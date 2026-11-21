import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, degrees } from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { viewRectToPdfRect, createMarkupSpace } from './markupGeometry';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';

const name = PDFName.of;
const rect = { x: 80, y: 120, width: 80, height: 30 };
const expectedMatrix: Record<number, number[]> = {
  0: [1, 0, 0, 1, 0, 0],
  90: [0, 1, -1, 0, 30, 0],
  180: [-1, 0, 0, -1, 80, 30],
  270: [0, -1, 1, 0, 0, 80],
};

function values(dict: PDFDict, key: string): number[] {
  return dict.lookup(name(key), PDFArray).asArray().map((item) => Number(item.toString()));
}

async function fixture(from: number, to = 0) {
  const doc = await PDFDocument.create();
  const first = doc.addPage([450, 550]);
  first.setCropBox(25, 30, 300, 400);
  first.setRotation(degrees(from));
  const second = doc.addPage([500, 600]);
  second.setCropBox(40, 50, 300, 400);
  second.setRotation(degrees(to));
  const model = {
    id: 'generated-stamp', type: 'stamp' as const, pageNumber: 1, rect,
    data: { text: 'APPROVED', borderColor: '#ff0000', backgroundColor: '#00ff00' },
    createdAt: 1, updatedAt: 1,
  };
  return { bytes: await doc.save(), model };
}

describe('generated stamp appearance on rotated cropped pages', () => {
  it.each([0, 90, 180, 270])('fits upright text and preserves native geometry at %s degrees', async (rotation) => {
    const { bytes, model } = await fixture(rotation);
    const saved = await writeNativePdfAnnotations(bytes, [model]);
    const doc = await PDFDocument.load(saved.bytes);
    const root = doc.getPage(0).node.lookup(name('Annots'), PDFArray).lookup(0, PDFDict);
    expect(values(root, 'Rect')).toEqual(viewRectToPdfRect(rect, createMarkupSpace(doc.getPage(0).getCropBox(), rotation)));
    const form = root.lookup(name('AP'), PDFDict).lookup(name('N'), PDFStream);
    expect(values(form.dict, 'BBox')).toEqual([0, 0, 80, 30]);
    expect(values(form.dict, 'Matrix')).toEqual(expectedMatrix[rotation]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.rect).toEqual(rect);
    expect(reopened.data.nativeStampAppearanceKind).toBe('generated');
    expect(reopened.data.text).toBe('APPROVED');
  });

  it('does not trust a stale sidecar basis when regenerating a verified stamp', async () => {
    const { bytes, model } = await fixture(90);
    const saved = await writeNativePdfAnnotations(bytes, [model]);
    const original = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    const stale = { ...original, data: { ...original.data, nativeStampBasisRotation: 270, text: 'EDITED' } };
    const edited = await writeNativePdfAnnotations(saved.bytes, [stale]);
    const doc = await PDFDocument.load(edited.bytes);
    const root = doc.getPage(0).node.lookup(name('Annots'), PDFArray).lookup(0, PDFDict);
    const normal = root.lookup(name('AP'), PDFDict).lookup(name('N'), PDFStream);
    expect(values(normal.dict, 'Matrix')).toEqual(expectedMatrix[90]);
    const reopened = (await readNativePdfAnnotations(edited.bytes)).annotations[0];
    expect(reopened.data.nativeStampBasisRotation).toBe(90);
    expect(reopened.data.nativeStampAppearanceKind).toBe('generated');
    expect(reopened.data.text).toBe('EDITED');
  });

  it.each([[0, 90], [90, 0], [180, 270], [270, 180]])(
    'retains provenance after rotate, copy, reopen and edit from %s to %s',
    async (from, to) => {
      const { bytes, model } = await fixture(from, to);
      const saved = await writeNativePdfAnnotations(bytes, [model]);
      const original = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
      const rotated = await writeNativePdfAnnotations(saved.bytes, [{ ...original, data: { ...original.data, rotation: 45 } }]);
      const reopened = (await readNativePdfAnnotations(rotated.bytes)).annotations[0];
      expect(reopened.data.nativeStampAppearanceKind).toBe('generated');
      useSessionStore.getState().clearDocument();
      useAnnotationStore.getState().setAnnotations([reopened]);
      useAnnotationStore.getState().setSelection([reopened.id]);
      useAnnotationStore.getState().copySelection();
      useAnnotationStore.getState().pasteClipboard(2);
      const pasted = await writeNativePdfAnnotations(rotated.bytes, useAnnotationStore.getState().annotations);
      const models = (await readNativePdfAnnotations(pasted.bytes)).annotations;
      const source = models.find((item) => item.pageNumber === 1)!;
      const copy = models.find((item) => item.pageNumber === 2)!;
      expect(copy.data.nativeStampAppearanceKind).toBe('generated');
      expect(copy.data.rotation).toBe(45);
      const edited = await writeNativePdfAnnotations(pasted.bytes, [source, { ...copy, data: { ...copy.data, text: 'EDITED' } }]);
      const editedCopy = (await readNativePdfAnnotations(edited.bytes)).annotations.find((item) => item.pageNumber === 2)!;
      expect(editedCopy.data.nativeStampAppearanceKind).toBe('generated');
      expect(editedCopy.data.text).toBe('EDITED');
      const doc = await PDFDocument.load(edited.bytes);
      const target = doc.getPage(1).node.lookup(name('Annots'), PDFArray).lookup(0, PDFDict);
      const base = target.lookup(name('PDFHubBaseAP'), PDFDict).lookup(name('N'), PDFStream);
      expect(values(base.dict, 'Matrix')).toEqual(expectedMatrix[to]);
    },
  );

  it.each([0, 90, 180, 270])(
    'keeps page-following orientation when copying an externally page-rotated stamp to %s degrees',
    async (to) => {
      const { bytes, model } = await fixture(90, to);
      const saved = await writeNativePdfAnnotations(bytes, [model]);
      // Simulate a page-only rotation in another PDF editor: stamp dictionary,
      // artwork and its fingerprint remain untouched in PDF user space.
      const pageRotated = await PDFDocument.load(saved.bytes);
      pageRotated.getPage(0).setRotation(degrees(180));
      const sourceBytes = await pageRotated.save();
      const original = (await readNativePdfAnnotations(sourceBytes)).annotations[0];
      expect(original.data.nativeStampAppearanceKind).toBe('generated');
      expect(original.data.nativeStampBasisRotation).toBe(90);
      expect(original.rect.width).toBe(30);
      expect(original.rect.height).toBe(80);
      useSessionStore.getState().clearDocument();
      useSessionStore.setState({ pageGraph: { pages: [
        { pageId: 'source', documentKey: 'synthetic', originalPageNumber: 1, currentIndex: 0, width: 450, height: 550, rotation: 180 },
        { pageId: 'target', documentKey: 'synthetic', originalPageNumber: 2, currentIndex: 1, width: 500, height: 600, rotation: to as 0 | 90 | 180 | 270 },
      ] } });
      useAnnotationStore.getState().setAnnotations([original]);
      useAnnotationStore.getState().setSelection([original.id]);
      useAnnotationStore.getState().copySelection();
      useAnnotationStore.getState().pasteClipboard(2);
      const liveCopy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2)!;
      const targetBasis = (to + 270) % 360;
      expect(liveCopy.data.nativeStampBasisRotation).toBe(targetBasis);
      const pasted = await writeNativePdfAnnotations(sourceBytes, useAnnotationStore.getState().annotations);
      const models = (await readNativePdfAnnotations(pasted.bytes)).annotations;
      const source = models.find((item) => item.pageNumber === 1)!;
      const copy = models.find((item) => item.pageNumber === 2)!;
      expect(copy.data.nativeStampAppearanceKind).toBe('generated');
      expect(copy.data.nativeStampBasisRotation).toBe(targetBasis);
      expect(copy.rect.width).toBe(30);
      expect(copy.rect.height).toBe(80);
      const edited = await writeNativePdfAnnotations(pasted.bytes, [source, { ...copy, data: { ...copy.data, text: 'EDITED' } }]);
      const editedCopy = (await readNativePdfAnnotations(edited.bytes)).annotations.find((item) => item.pageNumber === 2)!;
      expect(editedCopy.data.nativeStampAppearanceKind).toBe('generated');
      expect(editedCopy.data.text).toBe('EDITED');
      const doc = await PDFDocument.load(edited.bytes);
      const root = doc.getPage(1).node.lookup(name('Annots'), PDFArray).lookup(0, PDFDict);
      const form = root.lookup(name('AP'), PDFDict).lookup(name('N'), PDFStream);
      expect(values(form.dict, 'BBox')).toEqual([0, 0, 80, 30]);
      expect(values(form.dict, 'Matrix')).toEqual(expectedMatrix[targetBasis]);
    },
  );

  it('clears the transient source basis when a copied stamp is materialized', async () => {
    const { bytes, model } = await fixture(90, 0);
    const saved = await writeNativePdfAnnotations(bytes, [model]);
    const pageRotated = await PDFDocument.load(saved.bytes);
    pageRotated.getPage(0).setRotation(degrees(180));
    const sourceBytes = await pageRotated.save();
    const original = (await readNativePdfAnnotations(sourceBytes)).annotations[0];
    useSessionStore.getState().clearDocument();
    useSessionStore.setState({ pageGraph: { pages: [
      { pageId: 'source', documentKey: 'synthetic', originalPageNumber: 1, currentIndex: 0, width: 450, height: 550, rotation: 180 },
      { pageId: 'target', documentKey: 'synthetic', originalPageNumber: 2, currentIndex: 1, width: 500, height: 600, rotation: 0 },
    ] } });
    useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().setSelection([original.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const prepared = await materializeCopiedAnnotations(sourceBytes, useAnnotationStore.getState().annotations);
    const firstCopy = prepared.annotations.find((item) => item.pageNumber === 2)!;
    expect(firstCopy.data.nativeCopySource).toBeUndefined();
    expect(firstCopy.data.nativeStampCopySourceBasisRotation).toBeUndefined();
    expect(firstCopy.data.nativeStampBasisRotation).toBe(270);
    useAnnotationStore.getState().setAnnotations(prepared.annotations);
    useAnnotationStore.getState().setSelection([firstCopy.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(1);
    const secondCopy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 1 && item.id !== original.id)!;
    expect(secondCopy.data.nativeStampBasisRotation).toBe(90);
    const savedAgain = await writeNativePdfAnnotations(prepared.bytes, useAnnotationStore.getState().annotations);
    const reopened = (await readNativePdfAnnotations(savedAgain.bytes)).annotations.find((item) => item.id === secondCopy.id)!;
    expect(reopened.data.nativeStampAppearanceKind).toBe('generated');
    expect(reopened.data.nativeStampBasisRotation).toBe(90);
  });
});
