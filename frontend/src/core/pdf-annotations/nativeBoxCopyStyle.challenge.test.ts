import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { rotateBoxShapeQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { fingerprintGeneratedBoxAppearance } from './nativeBoxShapeProvenance';

const n = lib.PDFName.of;
async function created(type: 'shape-rect' | 'shape-ellipse' = 'shape-rect', sourceRotation = 0) {
  const doc = await lib.PDFDocument.create();
  const source = doc.addPage([400, 500]); source.setCropBox(20, 30, 300, 400); source.setRotation(lib.degrees(sourceRotation));
  const target = doc.addPage([500, 600]); target.setCropBox(40, 60, 300, 400); target.setRotation(lib.degrees((sourceRotation + 90) % 360));
  const item: PdfAnnotation = { id: 'source-box', type, pageNumber: 1, rect: { x: 40, y: 50, width: 100, height: 60 },
    data: { borderColor: '#123456', borderWidth: 2, borderStyle: 'solid', backgroundColor: 'transparent', opacity: 0.8 }, createdAt: 1, updatedAt: 1 };
  return (await writeNativePdfAnnotations(await doc.save(), [item])).bytes;
}
async function document(bytes: Uint8Array) { return lib.PDFDocument.load(bytes); }
function roots(doc: lib.PDFDocument, page: number) {
  const annots = doc.getPage(page).node.lookup(n('Annots'), lib.PDFArray);
  return Array.from({ length: annots.size() }, (_, i) => ({ ref: annots.get(i), dict: annots.lookup(i, lib.PDFDict) }));
}
function shapeOn(doc: lib.PDFDocument, page: number) {
  const result = roots(doc, page).find(({ dict }) => ['Square', 'Circle'].includes(dict.lookupMaybe(n('Subtype'), lib.PDFName)?.decodeText() ?? ''));
  if (!result) throw new Error('Missing synthetic shape'); return result;
}
function normal(shape: lib.PDFDict) { return shape.lookup(n('AP'), lib.PDFDict).lookup(n('N'), lib.PDFStream) as lib.PDFRawStream; }
function decoded(shape: lib.PDFDict) { return lib.decodePDFRawStream(normal(shape)).decode(); }
function copySource(source: PdfAnnotation, turn: boolean, style: boolean) {
  useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([source]);
  useAnnotationStore.getState().setSelection([source.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
  let copy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2)!;
  if (turn) { const patch = rotateBoxShapeQuarterTurn(copy); if (!patch) throw new Error('Rotation unavailable');
    useAnnotationStore.getState().updateAnnotation(copy.id, patch); copy = useAnnotationStore.getState().annotations.find((item) => item.id === copy.id)!; }
  if (style) useAnnotationStore.getState().updateAnnotation(copy.id, { data: { ...copy.data, borderColor: '#ff0000', borderWidth: 4 } });
  return useAnnotationStore.getState().annotations;
}
async function attachPopupAndReply(bytes: Uint8Array) {
  const doc = await document(bytes); const page = doc.getPage(0); const annotations = page.node.lookup(n('Annots'), lib.PDFArray);
  const rootRef = annotations.get(0)!; const root = annotations.lookup(0, lib.PDFDict);
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [120, 100, 200, 160], P: page.ref, Parent: rootRef });
  const popupRef = doc.context.register(popup); root.set(n('Popup'), popupRef); annotations.push(popupRef);
  const reply = doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: lib.PDFString.of('source-reply'),
    Rect: [110, 40, 128, 58], P: page.ref, Contents: lib.PDFString.of('synthetic reply'), IRT: rootRef, RT: 'R' });
  const replyRef = doc.context.register(reply); annotations.push(replyRef);
  const replyPopup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [140, 100, 220, 160], P: page.ref, Parent: replyRef });
  const replyPopupRef = doc.context.register(replyPopup); reply.set(n('Popup'), replyPopupRef); annotations.push(replyPopupRef);
  return doc.save();
}

describe('generated shape metadata and pre-save copy styling', () => {
  it('does not rebuild AP for a content-only edit after external BS/Border changes', async () => {
    const sourceDoc = await document(await created()); const sourceRoot = shapeOn(sourceDoc, 0).dict;
    sourceRoot.set(n('Border'), sourceDoc.context.obj([0, 0, 9]));
    sourceRoot.set(n('BS'), sourceDoc.context.obj({ W: 3, S: n('D'), D: [4, 2] }));
    const input = await sourceDoc.save(); const model = (await readNativePdfAnnotations(input)).annotations[0];
    expect(model.data.nativeBoxShapeGenerated).toBe(true);
    const edited = { ...model, data: { ...model.data, content: 'synthetic metadata change' } };
    const output = await writeNativePdfAnnotations(input, [edited]); const saved = await document(output.bytes); const target = shapeOn(saved, 0).dict;
    expect(target.lookup(n('Contents'), lib.PDFString, lib.PDFHexString).decodeText()).toBe('synthetic metadata change');
    expect(decoded(target)).toEqual(decoded(sourceRoot));
    expect(normal(target).dict.lookup(n('BBox'), lib.PDFArray).toString()).toBe(normal(sourceRoot).dict.lookup(n('BBox'), lib.PDFArray).toString());
    expect(target.lookup(n('BS'), lib.PDFDict).lookup(n('D'), lib.PDFArray).toString()).toBe('[ 4 2 ]');
    expect(await fingerprintGeneratedBoxAppearance(saved, target, lib)).toBe(await fingerprintGeneratedBoxAppearance(sourceDoc, sourceRoot, lib));
    expect((await readNativePdfAnnotations(output.bytes)).annotations[0].data.nativeBoxShapeGenerated).toBe(true);
  });
  it.each(['shape-rect', 'shape-ellipse'] as const)('allows styling a copied verified %s before first save across page rotations', async (type) => {
    for (const sourceRotation of [0, 90, 180, 270]) for (const turned of [false, true]) {
      const bytes = await attachPopupAndReply(await created(type, sourceRotation));
      const source = (await readNativePdfAnnotations(bytes)).annotations[0]; expect(source.data.nativeBoxShapeGenerated).toBe(true);
      const state = copySource(source, turned, true); const copy = state.find((item) => item.pageNumber === 2)!;
      const result = await writeNativePdfAnnotations(bytes, state); const output = await document(result.bytes);
      const originalRoot = shapeOn(output, 0); const copiedRoot = shapeOn(output, 1);
      expect(decoded(originalRoot.dict)).toEqual(decoded(shapeOn(await document(bytes), 0).dict));
      expect(originalRoot.ref?.toString()).not.toBe(copiedRoot.ref?.toString());
      expect(copiedRoot.dict.lookup(n('C'), lib.PDFArray).toString()).toBe('[ 1 0 0 ]');
      const reopened = (await readNativePdfAnnotations(result.bytes)).annotations.find((item) => item.pageNumber === 2)!;
      expect(reopened.id).toBe(copy.id); expect(reopened.data.nativeBoxShapeGenerated).toBe(true);
      expect(reopened.data.borderColor).toBe('#ff0000'); expect(reopened.data.borderWidth).toBe(4);
      expect(reopened.data.review?.replies).toHaveLength(1);
      const copyPopup = copiedRoot.dict.lookup(n('Popup'), lib.PDFDict);
      expect(copyPopup.get(n('Parent'))?.toString()).toBe(copiedRoot.ref?.toString());
      const reply = roots(output, 1).find(({ dict }) => dict.get(n('IRT'))?.toString() === copiedRoot.ref?.toString())!;
      expect(reply).toBeDefined();
      expect(reply.dict.lookup(n('Popup'), lib.PDFDict).get(n('Parent'))?.toString()).toBe(reply.ref?.toString());
      const secondEdit = { ...reopened, data: { ...reopened.data, borderWidth: 6 } };
      const all = (await readNativePdfAnnotations(result.bytes)).annotations.map((item) => item.id === reopened.id ? secondEdit : item);
      await expect(writeNativePdfAnnotations(result.bytes, all)).resolves.toBeDefined();
    }
  }, 30_000);
  it('never turns a copied tampered appearance into editable generated artwork', async () => {
    const original = await document(await created()); const root = shapeOn(original, 0).dict;
    root.lookup(n('AP'), lib.PDFDict).set(n('N'), original.context.register(original.context.flateStream('q 1 0 0 rg 0 0 5 5 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
    })));
    const input = await original.save(); const source = (await readNativePdfAnnotations(input)).annotations[0];
    expect(source.data.nativeBoxShapeGenerated).toBeUndefined();
    const unchangedCopy = copySource(source, false, false); const copied = await writeNativePdfAnnotations(input, unchangedCopy);
    const reopened = (await readNativePdfAnnotations(copied.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expect(reopened.data.nativeBoxShapeGenerated).toBeUndefined();
    const forged = copySource(source, false, true).map((item) => item.pageNumber === 2
      ? { ...item, data: { ...item.data, nativeBoxShapeGenerated: true } } : item);
    await expect(writeNativePdfAnnotations(input, forged)).rejects.toThrow(/Cannot safely (?:copy|replace|edit)/);
  });
  it.each(['shape-rect', 'shape-ellipse'] as const)('preserves arbitrary imported %s artwork while changing only its comment', async (type) => {
    const sourceDoc = await document(await attachPopupAndReply(await created(type)));
    const sourceRoot = shapeOn(sourceDoc, 0).dict;
    const custom = sourceDoc.context.flateStream('q 1 0 0 rg 1 1 20 20 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
    });
    const rollover = sourceDoc.context.flateStream('q 0 0 1 rg 2 2 5 5 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
    });
    const appearances = sourceRoot.lookup(n('AP'), lib.PDFDict);
    appearances.set(n('N'), sourceDoc.context.register(custom));
    appearances.set(n('R'), sourceDoc.context.register(rollover));
    const input = await sourceDoc.save(); const source = (await readNativePdfAnnotations(input)).annotations[0];
    expect(source.data.nativeBoxShapeGenerated).toBeUndefined();
    const result = await writeNativePdfAnnotations(input, [{ ...source, data: { ...source.data, content: 'Updated comment' } }]);
    const output = await document(result.bytes); const saved = shapeOn(output, 0);
    expect(saved.dict.lookup(n('Contents'), lib.PDFString, lib.PDFHexString).decodeText()).toBe('Updated comment');
    expect(decoded(saved.dict)).toEqual(lib.decodePDFRawStream(custom).decode());
    expect(lib.decodePDFRawStream(saved.dict.lookup(n('AP'), lib.PDFDict).lookup(n('R'), lib.PDFStream) as lib.PDFRawStream).decode())
      .toEqual(lib.decodePDFRawStream(rollover).decode());
    expect(saved.dict.lookup(n('Popup'), lib.PDFDict).get(n('Parent'))?.toString()).toBe(saved.ref?.toString());
    expect(roots(output, 0).find(({ dict }) => dict.get(n('IRT'))?.toString() === saved.ref?.toString())).toBeDefined();
    expect((await readNativePdfAnnotations(result.bytes)).annotations[0].data.nativeBoxShapeGenerated).toBeUndefined();
    const changedStyle = { ...source, data: { ...source.data, content: 'Updated comment', borderColor: '#ff0000' } };
    await expect(writeNativePdfAnnotations(input, [changedStyle])).rejects.toThrow(/Cannot safely replace/);
  });
});
