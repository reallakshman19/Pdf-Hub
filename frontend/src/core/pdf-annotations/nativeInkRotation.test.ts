import { describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString, degrees } from 'pdf-lib';
import { rotateInkQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function fixture(rotation = 0, withAppearance = true) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([400, 500]); source.setCropBox(25, 30, 300, 400); source.setRotation(degrees(rotation));
  const target = doc.addPage([500, 600]); target.setCropBox(40, 60, 300, 400); target.setRotation(degrees((rotation + 90) % 360));
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 RG 5 w 1 J 10 10 m 85 20 l 60 50 l S 15 45 m 40 30 l S Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
  }));
  const ink = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Ink', NM: PDFString.of('ink'), P: source.ref,
    Rect: [100, 100, 200, 160], InkList: [[110, 110, 185, 120, 160, 150], [115, 145, 140, 130]],
    C: [0.123456, 0.345678, 0.567891], CA: 0.6, BS: { W: 5, S: 'S' }, ...(withAppearance ? { AP: { N: appearance } } : {}) }));
  source.node.set(PDFName.of('Annots'), doc.context.obj([ink]));
  return doc.save();
}
function turn(item: PdfAnnotation, count = 1): PdfAnnotation {
  for (let i = 0; i < count; i += 1) item = { ...item, ...rotateInkQuarterTurn(item)! };
  return item;
}
async function inkAt(bytes: Uint8Array, page = 0) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(page).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}
function expectPaths(actual: number[][] | undefined, expected: number[][] | undefined) {
  expect(actual?.length).toBe(expected?.length);
  actual?.forEach((stroke, i) => {
    expect(stroke.length).toBe(expected![i].length);
    stroke.forEach((value, j) => expect(value).toBeCloseTo(expected![i][j], 4));
  });
}

describe('native ink quarter-turn', () => {
  it.each([0, 90, 180, 270])('rotates every native stroke and appearance on a cropped page at %s degrees', async (rotation) => {
    const bytes = await fixture(rotation); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const count of [1, 2, 3, 4]) {
      const changed = turn(original, count); const output = await writeNativePdfAnnotations(bytes, [changed]);
      const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
      expect(reopened.rect).toEqual(changed.rect); expectPaths(reopened.data.paths, changed.data.paths);
      expect((reopened.data as typeof reopened.data & { nativeInkQuarterTurns?: number }).nativeInkQuarterTurns).toBeUndefined();
      const dict = await inkAt(output.bytes); const form = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
      expect(Boolean(form.dict.get(PDFName.of('PDFHubWrappedOriginal')))).toBe(count !== 4);
      expect(dict.lookup(PDFName.of('C'), PDFArray).toString()).toBe('[ 0.123456 0.345678 0.567891 ]');
      expect(dict.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0.6);
      if (process.env.WP01_SYNTHETIC_INK_PROOF_DIR && rotation === 0 && count === 1) {
        await fs.mkdir(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, { recursive: true });
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'source.pdf'), bytes);
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'rotated.pdf'), output.bytes);
      }
    }
  });
  it('rejects changed geometry, malformed strokes, NoRotate, and missing native appearance', async () => {
    const bytes = await fixture(); const original = (await readNativePdfAnnotations(bytes)).annotations[0]; const rotated = turn(original);
    const invalid = { ...rotated, data: { ...rotated.data, paths: rotated.data.paths!.map((stroke, i) => i === 0 ? stroke.map((v, j) => j === 0 ? v + 1 : v) : stroke) } };
    await expect(writeNativePdfAnnotations(bytes, [invalid])).rejects.toThrow('Cannot safely rotate this ink');
    const doc = await PDFDocument.load(bytes); const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    dict.set(PDFName.of('F'), PDFNumber.of(16)); const noRotate = await doc.save();
    await expect(writeNativePdfAnnotations(noRotate, [turn((await readNativePdfAnnotations(noRotate)).annotations[0])])).rejects.toThrow('unsupported native geometry or flags');
    const missing = await fixture(0, false);
    await expect(writeNativePdfAnnotations(missing, [turn((await readNativePdfAnnotations(missing)).annotations[0])])).rejects.toThrow('without a native appearance');
    for (const paths of [[], [[1, 2]], [[1, 2, 1, 2]], [[1, 2, 3]], [[1, 2, NaN, 4]], [[]]]) {
      expect(rotateInkQuarterTurn({ ...original, data: { ...original.data, paths } })).toBeNull();
    }
    dict.set(PDFName.of('F'), PDFNumber.of(0)); dict.set(PDFName.of('InkList'), doc.context.obj([[1, 2, 3]]));
    const malformed = await doc.save();
    const malformedModel = (await readNativePdfAnnotations(malformed)).annotations[0];
    const forged = { ...malformedModel, data: { ...malformedModel.data, paths: [[1, 2, 3, 4]] } };
    await expect(writeNativePdfAnnotations(malformed, [turn(forged)])).rejects.toThrow('Cannot safely rotate this ink');
  });
  it('creates a portable appearance with exact style, stroke bounds, and repeat editing after reopen', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'new-ink', type: 'ink', pageNumber: 1, rect: { x: 100, y: 100, width: 80, height: 60 },
      data: { paths: [[100, 100, 180, 160], [110, 155, 170, 110]], borderColor: '#ff0000', borderWidth: 8, borderStyle: 'dashed', opacity: 0.6 }, createdAt: 1, updatedAt: 1 };
    const changed = turn(item); const saved = await writeNativePdfAnnotations(await doc.save(), [changed]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0]; expectPaths(reopened.data.paths, changed.data.paths);
    expect(reopened.rect.width).toBeGreaterThan(changed.rect.width); expect(reopened.rect.height).toBeGreaterThan(changed.rect.height);
    const root = await inkAt(saved.bytes); const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const content = new TextDecoder().decode(decodePDFRawStream(form).decode());
    expect(content).toContain('1 0 0 RG'); expect(content).toContain('8 w'); expect(content).toContain('[3 2] 0 d'); expect(content).toContain('1 J');
    const gs = form.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('ExtGState'), PDFDict).lookup(PDFName.of('GS0'), PDFDict);
    expect(gs.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0.6);
    const twice = await writeNativePdfAnnotations(saved.bytes, [turn(reopened)]); const final = (await readNativePdfAnnotations(twice.bytes)).annotations[0];
    expectPaths(final.data.paths, turn(reopened).data.paths);
    if (process.env.WP01_SYNTHETIC_INK_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'new-first.pdf'), saved.bytes);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'new-second.pdf'), twice.bytes);
    }
  });
  it('rejects unsupported generated ink and cannot replace malformed/single-point data silently', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]); const bytes = await doc.save();
    const item: PdfAnnotation = { id: 'bad', type: 'ink', pageNumber: 1, rect: { x: 20, y: 30, width: 80, height: 60 }, data: { paths: [[20, 30]], borderColor: '#111827' }, createdAt: 1, updatedAt: 1 };
    await expect(writeNativePdfAnnotations(bytes, [item])).rejects.toThrow('single-point stroke');
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, paths: [[20, 30, 20, 30]] } }])).rejects.toThrow('single-point stroke');
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, data: { paths: [[20, 30, 40, 60]], borderColor: 'rgb(1,2,3)' } }])).rejects.toThrow('unsupported color');
  });
  it('preserves full edge strokes for tight and roomy rectangles', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]); const bytes = await doc.save();
    const item: PdfAnnotation = { id: 'edge-ink', type: 'ink', pageNumber: 1, rect: { x: 100, y: 100, width: 80, height: 60 },
      data: { paths: [[100, 100, 180, 160], [100, 160, 180, 100]], borderWidth: 8, borderColor: '#3b82f6' }, createdAt: 1, updatedAt: 1 };
    const tight = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    const roomy = (await writeNativePdfAnnotations(bytes, [{ ...item, rect: { x: 90, y: 90, width: 100, height: 80 } }])).bytes;
    expectPaths((await readNativePdfAnnotations(tight)).annotations[0].data.paths, (await readNativePdfAnnotations(roomy)).annotations[0].data.paths);
    if (process.env.WP01_SYNTHETIC_INK_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'edge-tight.pdf'), tight);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_INK_PROOF_DIR, 'edge-roomy.pdf'), roomy);
    }
  });
  it.each([0, 90, 180, 270])('copies rotated ink to a differently rotated cropped page and materializes it at %s degrees', async (rotation) => {
    const bytes = await fixture(rotation); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().updateAnnotation(original.id, rotateInkQuarterTurn(original)!);
    useAnnotationStore.getState().setSelection([original.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations; const copy = current.find((item) => item.pageNumber === 2)!;
    const materialized = await materializeCopiedAnnotations(bytes, current); const actual = materialized.annotations.find((item) => item.pageNumber === 2)!;
    expect(actual.rect).toEqual(copy.rect); expectPaths(actual.data.paths, copy.data.paths);
    expect((actual.data as typeof actual.data & { nativeInkQuarterTurns?: number }).nativeInkQuarterTurns).toBeUndefined();
    const again = await writeNativePdfAnnotations(materialized.bytes, materialized.annotations);
    const reopened = (await readNativePdfAnnotations(again.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expectPaths(reopened.data.paths, copy.data.paths);
  });
});
