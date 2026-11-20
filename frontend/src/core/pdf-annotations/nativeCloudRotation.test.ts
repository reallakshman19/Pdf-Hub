import { describe, expect, it } from 'vitest';
import * as pdf from 'pdf-lib';
import { rotateBoxShapeQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const k = pdf.PDFName.of;
const nums = (root: pdf.PDFDict, name: string) => { const a = root.lookup(k(name), pdf.PDFArray); return Array.from({length: a.size()}, (_, i) => a.lookup(i, pdf.PDFNumber).asNumber()); };
const rotate = (a: number[]) => [a[3], a[0], a[1], a[2]];
const view = (a: number[], angle: number) => { for (let n = 0; n < angle / 90; n++) a = rotate(a); return a; };

async function fixture(rotation = 0, destRotation = 90) {
  const doc = await pdf.PDFDocument.create();
  const source = doc.addPage([550, 550]); source.setCropBox(20, 30, 300, 400); source.setRotation(pdf.degrees(rotation));
  const dest = doc.addPage([650, 650]); dest.setCropBox(40, 50, 400, 300); dest.setRotation(pdf.degrees(destRotation));
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 5 4 24 9 re f Q', {Type:'XObject', Subtype:'Form', BBox:[0,0,100,60], Resources:{}}));
  const root = doc.context.obj({Type:'Annot', Subtype:'Square', Rect:[80,130,180,190], RD:[3,7,11,13], BE:{S:k('C'), I:1}, NM:pdf.PDFString.of('synthetic-cloud'), P:source.ref, AP:{N:ap}});
  source.node.set(k('Annots'), doc.context.obj([doc.context.register(root)]));
  return doc.save();
}
async function rootAt(bytes: Uint8Array, page = 0) {
  const doc = await pdf.PDFDocument.load(bytes);
  return doc.getPage(page).node.lookup(k('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
}
function turned(a: PdfAnnotation, count = 1): PdfAnnotation {
  for (let i = 0; i < count; i++) { const next = rotateBoxShapeQuarterTurn(a); if (!next) throw new Error('Rotation unavailable'); a = {...a, ...next}; }
  return a;
}

describe('imported native cloud quarter-turns', () => {
  it.each([0,90,180,270])('turns an asymmetric outer and inner PDF rectangle about their shared center at page rotation %i', async (pageRotation) => {
    // Native outer [80,130,180,190] has center [130,160]. Its /RD
    // [3,7,11,13] describes inner [83,143,169,183]. A clockwise
    // quarter-turn around that center yields the explicit rectangles below.
    const input = await fixture(pageRotation);
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    const root = await rootAt((await writeNativePdfAnnotations(input, [turned(original)])).bytes);
    const outer = nums(root, 'Rect'); const rd = nums(root, 'RD');
    expect(outer).toEqual([100,110,160,210]);
    expect(rd).toEqual([13,3,7,11]);
    expect([outer[0] + rd[0], outer[1] + rd[3], outer[2] - rd[2], outer[3] - rd[1]])
      .toEqual([113,121,153,207]);
  });
  it.each([0,90,180,270])('rotates artwork and asymmetric inset on cropped page %i', async (pageRotation) => {
    const input = await fixture(pageRotation); const original = (await readNativePdfAnnotations(input)).annotations[0];
    expect(original.data.nativeBoxShapeSourceHash).toBeDefined();
    for (const count of [1,2,3]) {
      const model = turned(original, count); const out = await writeNativePdfAnnotations(input, [model]);
      const saved = await rootAt(out.bytes); const reopened = (await readNativePdfAnnotations(out.bytes)).annotations[0];
      let expected = view([3,7,11,13], pageRotation); for (let n = 0; n < count; n++) expected = rotate(expected);
      expect(view(nums(saved, 'RD'), pageRotation)).toEqual(expected);
      expect(reopened.rect).toEqual(model.rect);
      expect(saved.lookup(k('BE'), pdf.PDFDict).lookup(k('S'), pdf.PDFName).decodeText()).toBe('C');
      expect(saved.lookup(k('AP'), pdf.PDFDict).lookup(k('N'), pdf.PDFStream).dict.get(k('PDFHubWrappedOriginal'))).toBeDefined();
      expect(reopened.data.nativeBoxShapeTurn).toBeUndefined();
      if (process.env.WP01_SYNTHETIC_CLOUD_PROOF_DIR && pageRotation === 0 && count === 1) {
        await fs.mkdir(process.env.WP01_SYNTHETIC_CLOUD_PROOF_DIR, { recursive: true });
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_CLOUD_PROOF_DIR, 'cloud-source.pdf'), input);
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_CLOUD_PROOF_DIR, 'cloud-rotated.pdf'), out.bytes);
      }
    }
  });
  it.each([0,90,180,270].flatMap((from) => [0,90,180,270].map((to) => [from,to])))('copies a pending rotation across pages %i to %i and materializes it', async (angle, dest) => {
    const input = await fixture(angle, dest);
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().updateAnnotation(original.id, rotateBoxShapeQuarterTurn(original)!);
    useAnnotationStore.getState().setSelection([original.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations; const copy = current.find((item) => item.pageNumber === 2)!;
    const written = await materializeCopiedAnnotations(input, current); const root = await rootAt(written.bytes, 1);
    expect(view(nums(root, 'RD'), dest)).toEqual(rotate(view([3,7,11,13], angle)));
    const saved = written.annotations.find((item) => item.pageNumber === 2)!;
    expect(saved.rect).toEqual(copy.rect); expect(saved.data.nativeBoxShapeTurn).toBeUndefined();
    expect((await readNativePdfAnnotations((await writeNativePdfAnnotations(written.bytes, written.annotations)).bytes)).annotations.find((item) => item.pageNumber === 2)?.rect).toEqual(copy.rect);
  });
  it.each(['AP', 'Rect', 'RD', 'BE'])('rejects source %s tampering after selection', async (field) => {
    const bytes = await fixture(); const original = (await readNativePdfAnnotations(bytes)).annotations[0]; const rotated = turned(original);
    const doc = await pdf.PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(k('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    if (field === 'AP') root.lookup(k('AP'), pdf.PDFDict).lookup(k('N'), pdf.PDFStream).dict.set(k('BBox'), doc.context.obj([0,0,90,60]));
    if (field === 'Rect') root.set(k('Rect'), doc.context.obj([80,130,181,190]));
    if (field === 'RD') root.set(k('RD'), doc.context.obj([4,7,11,13]));
    if (field === 'BE') root.set(k('BE'), doc.context.obj({S:k('C'), I:2}));
    await expect(writeNativePdfAnnotations(await doc.save(), [rotated])).rejects.toThrow(/source appearance or identity changed/);
  });
  it('supports successive saves and turns without applying a prior turn twice', async () => {
    let bytes = await fixture();
    let model = (await readNativePdfAnnotations(bytes)).annotations[0];
    let expected = [3,7,11,13];
    for (let n = 0; n < 4; n++) {
      const result = await writeNativePdfAnnotations(bytes, [turned(model)]); bytes = result.bytes; expected = rotate(expected);
      expect(nums(await rootAt(bytes), 'RD')).toEqual(expected);
      model = (await readNativePdfAnnotations(bytes)).annotations[0];
      expect(model.data.nativeBoxShapeSourceHash).toBeDefined();
      bytes = (await writeNativePdfAnnotations(bytes, [model])).bytes;
      const refreshed = (await readNativePdfAnnotations(bytes)).annotations[0];
      expect(refreshed.data.nativeBoxShapeSourceHash).toBe(model.data.nativeBoxShapeSourceHash);
      expect(nums(await rootAt(bytes), 'RD')).toEqual(expected);
    }
  });
  it('rejects combined rotation and appearance edits and imported type conversion', async () => {
    const bytes = await fixture(); const original = (await readNativePdfAnnotations(bytes)).annotations[0]; const rotated = turned(original);
    await expect(writeNativePdfAnnotations(bytes, [{...rotated, data:{...rotated.data, borderColor:'#ff0000'}}])).rejects.toThrow(/geometry or appearance also changed/);
    await expect(writeNativePdfAnnotations(bytes, [{...original, type:'shape-rect'}])).rejects.toThrow(/imported (shape|annotation appearance)/);
  });
  it('disables new, no-appearance and malformed native clouds', async () => {
    const bytes = await fixture(); const model = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(rotateBoxShapeQuarterTurn({...model, data:{}})).toBeNull();
    for (const field of ['AP', 'RD', 'BE', 'F']) {
      const doc = await pdf.PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(k('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
      if (field === 'AP') root.delete(k('AP'));
      if (field === 'RD') root.set(k('RD'), doc.context.obj([3,-1,11,13]));
      if (field === 'BE') root.set(k('BE'), doc.context.obj({S:k('C'), I:-1}));
      if (field === 'F') root.set(k('F'), pdf.PDFNumber.of(16));
      const item = (await readNativePdfAnnotations(await doc.save())).annotations[0];
      expect(rotateBoxShapeQuarterTurn(item), field).toBeNull();
    }
  });
});
