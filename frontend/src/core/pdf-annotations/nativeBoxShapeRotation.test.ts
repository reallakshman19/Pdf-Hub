import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFStream, PDFString, degrees } from 'pdf-lib';
import { rotateBoxShapeQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function fixture(type: 'shape-rect' | 'shape-ellipse', rotation = 0, square = false) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([400, 500]); source.setCropBox(25, 30, 300, 400); source.setRotation(degrees(rotation));
  const dest = doc.addPage([500, 600]); dest.setCropBox(40, 60, 300, 400); dest.setRotation(degrees((rotation + 90) % 360));
  const rect = square ? [100, 100, 180, 180] : [100, 100, 200, 160];
  const form = doc.context.register(doc.context.flateStream('q 1 0 0 rg 8 8 25 12 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, rect[2] - rect[0], rect[3] - rect[1]], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: type === 'shape-rect' ? 'Square' : 'Circle',
    NM: PDFString.of('shape'), P: source.ref, Rect: rect, C: [0.123456, 0.345678, 0.567891], AP: { N: form } }));
  source.node.set(PDFName.of('Annots'), doc.context.obj([root]));
  return doc.save();
}
function turn(item: PdfAnnotation, count = 1): PdfAnnotation {
  for (let i = 0; i < count; i += 1) { const next = rotateBoxShapeQuarterTurn(item); if (!next) throw new Error('Rotation unavailable'); item = { ...item, ...next }; }
  return item;
}
async function shapeAt(bytes: Uint8Array, index = 0) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}

describe('native rectangle and ellipse quarter turns', () => {
  it.each(['shape-rect', 'shape-ellipse'] as const)('rotates asymmetric %s artwork on each cropped page orientation', async (type) => {
    for (const pageRotation of [0, 90, 180, 270]) {
      const bytes = await fixture(type, pageRotation);
      const original = (await readNativePdfAnnotations(bytes)).annotations[0];
      expect(original.data.nativeBoxShapeSourceHash).toBeDefined();
      for (const turns of [1, 2, 3]) {
        const changed = turn(original, turns);
        const output = await writeNativePdfAnnotations(bytes, [changed]);
        const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
        expect(reopened.rect).toEqual(changed.rect);
        expect(reopened.data.nativeBoxShapeTurn).toBeUndefined();
        expect((await shapeAt(output.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
        if (process.env.WP01_SYNTHETIC_BOX_PROOF_DIR && pageRotation === 0 && turns === 1) {
          await fs.mkdir(process.env.WP01_SYNTHETIC_BOX_PROOF_DIR, { recursive: true });
          await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_BOX_PROOF_DIR, `${type}-source.pdf`), bytes);
          await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_BOX_PROOF_DIR, `${type}-rotated.pdf`), output.bytes);
        }
      }
    }
  });
  it('uses the explicit turn even when the bounding square is unchanged', async () => {
    const bytes = await fixture('shape-rect', 0, true); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const changed = turn(original); expect(changed.rect).toEqual(original.rect);
    const output = await writeNativePdfAnnotations(bytes, [changed]);
    expect((await shapeAt(output.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
    expect(turn(original, 4).data.nativeBoxShapeTurn).toBeUndefined();
  });
  it('rejects stale AP fingerprints, mixed resize/style changes, malformed or unsupported source appearances', async () => {
    const bytes = await fixture('shape-rect'); const original = (await readNativePdfAnnotations(bytes)).annotations[0]; const changed = turn(original);
    const altered = await PDFDocument.load(bytes); const root = altered.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const ap = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    ap.dict.set(PDFName.of('BBox'), altered.context.obj([0, 0, 90, 60]));
    await expect(writeNativePdfAnnotations(await altered.save(), [changed])).rejects.toThrow('source appearance or identity changed');
    await expect(writeNativePdfAnnotations(bytes, [{ ...changed, rect: { ...changed.rect, width: changed.rect.width + 4 } }])).rejects.toThrow('geometry or appearance also changed');
    await expect(writeNativePdfAnnotations(bytes, [{ ...changed, data: { ...changed.data, borderColor: '#ff0000' } }])).rejects.toThrow('geometry or appearance also changed');
    for (const key of ['RD', 'BE', 'Measure', 'IT', 'Rotate']) {
      const doc = await PDFDocument.load(bytes); const shape = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
      shape.set(PDFName.of(key), key === 'RD' ? doc.context.obj([1,1,1,1]) : key === 'Rotate' ? PDFNumber.of(90) : doc.context.obj({}));
      const unsupported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
      expect(rotateBoxShapeQuarterTurn(unsupported), key).toBeNull();
    }
  });
  it.each(['shape-rect', 'shape-ellipse'] as const)('generates styled native appearance for newly drawn %s and rotates again after reopen', async (type) => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'new', type, pageNumber: 1, rect: { x: 40, y: 50, width: 100, height: 60 },
      data: { backgroundColor: 'transparent', borderColor: '#3b82f6', borderWidth: 4, borderStyle: 'dashed', opacity: 0.5 }, createdAt: 1, updatedAt: 1 };
    const output = await writeNativePdfAnnotations(await doc.save(), [turn(item)]);
    const dict = await shapeAt(output.bytes);
    expect(dict.get(PDFName.of('IC'))).toBeUndefined();
    expect(dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream)).toBeDefined();
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    expect(reopened.data.nativeBoxShapeSourceHash).toBeDefined();
    const twice = await writeNativePdfAnnotations(output.bytes, [turn(reopened)]);
    expect((await shapeAt(twice.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
  });
  it.each([0, 90, 180, 270])('copies a turned source onto a differently rotated crop and materializes it at %s', async (rotation) => {
    const bytes = await fixture('shape-rect', rotation); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().updateAnnotation(original.id, rotateBoxShapeQuarterTurn(original)!);
    useAnnotationStore.getState().setSelection([original.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations; const copy = current.find((item) => item.pageNumber === 2)!;
    const materialized = await materializeCopiedAnnotations(bytes, current); const saved = materialized.annotations.find((item) => item.pageNumber === 2)!;
    expect(saved.rect).toEqual(copy.rect); expect(saved.data.nativeBoxShapeTurn).toBeUndefined();
    const again = await writeNativePdfAnnotations(materialized.bytes, materialized.annotations);
    expect((await readNativePdfAnnotations(again.bytes)).annotations.find((item) => item.pageNumber === 2)?.rect).toEqual(copy.rect);
  });
});
