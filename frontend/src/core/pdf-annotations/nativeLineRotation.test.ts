import { describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString, degrees } from 'pdf-lib';
import { rotateLineQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function fixture(rotation = 0, ending = 'OpenArrow', appearance = true) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([400, 500]); source.setCropBox(25, 30, 300, 400); source.setRotation(degrees(rotation));
  const target = doc.addPage([500, 600]); target.setCropBox(40, 60, 300, 400); target.setRotation(degrees((rotation + 90) % 360));
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 RG 5 w 10 10 m 85 50 l S 85 50 m 65 47 l 74 32 l h B Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {} }));
  const line = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Line', NM: PDFString.of('line'), P: source.ref,
    Rect: [100, 100, 200, 160], L: [110, 110, 185, 150], LE: ['Circle', ending], C: [0.123456, 0.345678, 0.567891],
    IC: [0.765432, 0.54321, 0.321], CA: 0.6, BS: { W: 5, S: 'S' }, ...(appearance ? { AP: { N: ap } } : {}) }));
  source.node.set(PDFName.of('Annots'), doc.context.obj([line])); return doc.save();
}
function turn(item: PdfAnnotation, count = 1): PdfAnnotation {
  for (let i = 0; i < count; i += 1) item = { ...item, ...rotateLineQuarterTurn(item)! }; return item;
}
async function rootAt(bytes: Uint8Array, page = 0) {
  const doc = await PDFDocument.load(bytes); return doc.getPage(page).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}
function expectPoints(actual: number[] | undefined, expected: number[] | undefined) {
  expect(actual?.length).toBe(4); actual?.forEach((value, i) => expect(value).toBeCloseTo(expected![i], 4));
}

describe('native line and arrow quarter-turn', () => {
  it.each([0, 90, 180, 270])('preserves endpoint order and native open/closed endings on cropped page rotation %s', async (rotation) => {
    for (const ending of ['OpenArrow', 'ClosedArrow']) {
      const bytes = await fixture(rotation, ending); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
      for (const count of [1, 2, 3, 4]) {
        const changed = turn(original, count); const output = await writeNativePdfAnnotations(bytes, [changed]);
        const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
        expect(reopened.rect).toEqual(changed.rect); expectPoints(reopened.data.points, changed.data.points);
        expect((reopened.data as typeof reopened.data & { nativeLineQuarterTurns?: number }).nativeLineQuarterTurns).toBeUndefined();
        const root = await rootAt(output.bytes); const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
        expect(Boolean(form.dict.get(PDFName.of('PDFHubWrappedOriginal')))).toBe(count !== 4);
        expect(root.lookup(PDFName.of('LE'), PDFArray).toString()).toBe(`[ /Circle /${ending} ]`);
        expect(root.lookup(PDFName.of('IC'), PDFArray).toString()).toBe('[ 0.765432 0.54321 0.321 ]');
        expect(root.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0.6);
        if (process.env.WP01_SYNTHETIC_LINE_PROOF_DIR && rotation === 0 && count === 1 && ending === 'ClosedArrow') {
          await fs.mkdir(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, { recursive: true });
          await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'source.pdf'), bytes);
          await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'rotated.pdf'), output.bytes);
        }
      }
    }
  });
  it('fails safely for changed/malformed geometry, unsupported native metadata, NoRotate, and missing appearance', async () => {
    const bytes = await fixture(); const original = (await readNativePdfAnnotations(bytes)).annotations[0]; const changed = turn(original);
    await expect(writeNativePdfAnnotations(bytes, [{ ...changed, data: { ...changed.data, points: changed.data.points!.map((v, i) => i ? v : v + 1) } }])).rejects.toThrow('Cannot safely rotate this line');
    for (const key of ['CO', 'LL', 'LLE', 'LLO', 'Cap', 'CP', 'Measure']) {
      const doc = await PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
      const value = key === 'CO' ? doc.context.obj([1, 2]) : key === 'Cap' ? doc.context.obj(true)
        : key === 'CP' ? doc.context.obj('Top') : key === 'Measure' ? doc.context.obj({}) : doc.context.obj(4);
      root.set(PDFName.of(key), value);
      const modified = await doc.save(); await expect(writeNativePdfAnnotations(modified, [turn((await readNativePdfAnnotations(modified)).annotations[0])])).rejects.toThrow('unsupported native geometry, caption, leader, intent or flags');
    }
    const doc = await PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    root.set(PDFName.of('F'), PDFNumber.of(16)); const noRotate = await doc.save();
    await expect(writeNativePdfAnnotations(noRotate, [turn((await readNativePdfAnnotations(noRotate)).annotations[0])])).rejects.toThrow('unsupported native geometry, caption, leader, intent or flags');
    const missing = await fixture(0, 'OpenArrow', false);
    await expect(writeNativePdfAnnotations(missing, [turn((await readNativePdfAnnotations(missing)).annotations[0])])).rejects.toThrow('without a native appearance');
    for (const points of [[], [1, 2], [1, 2, 1, 2], [1, 2, NaN, 4]]) expect(rotateLineQuarterTurn({ ...original, data: { ...original.data, points } })).toBeNull();
  });
  it('rejects unsupported line intents while retaining the supported LineArrow intent', async () => {
    const bytes = await fixture();
    for (const intent of ['LineDimension', 'VendorSpecific', 'LineArrow']) {
      const doc = await PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
      root.set(PDFName.of('IT'), PDFName.of(intent)); const modified = await doc.save();
      const operation = writeNativePdfAnnotations(modified, [turn((await readNativePdfAnnotations(modified)).annotations[0])]);
      if (intent === 'LineArrow') {
        const result = await operation;
        expect((await rootAt(result.bytes)).lookup(PDFName.of('IT'), PDFName).decodeText()).toBe(intent);
      } else await expect(operation).rejects.toThrow('unsupported native geometry, caption, leader, intent or flags');
    }
  });
  it.each(['line', 'arrow'] as const)('creates portable %s with style and matching endpoint fields, then reopens and rotates again', async (type) => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: `new-${type}`, type, pageNumber: 1, rect: { x: 100, y: 100, width: 80, height: 60 },
      data: { points: [80, 0, 0, 60], borderColor: '#ff0000', borderWidth: 3, borderStyle: 'dashed', opacity: 0.6,
        ...(type === 'arrow' ? { lineStartCap: 'circle', lineEndCap: 'arrow' } : {}) }, createdAt: 1, updatedAt: 1 };
    const changed = turn(item); const output = await writeNativePdfAnnotations(await doc.save(), [changed]);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    // Expanding the native box changes relative points but not absolute endpoints.
    for (let i = 0; i < 4; i += 2) {
      expect(reopened.rect.x + reopened.data.points![i]).toBeCloseTo(changed.rect.x + changed.data.points![i], 4);
      expect(reopened.rect.y + reopened.data.points![i + 1]).toBeCloseTo(changed.rect.y + changed.data.points![i + 1], 4);
    }
    const root = await rootAt(output.bytes); const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const content = new TextDecoder().decode(decodePDFRawStream(form).decode()); expect(content).toContain('1 0 0 RG'); expect(content).toContain('3 w'); expect(content).toContain('[3 2] 0 d');
    const gs = form.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('ExtGState'), PDFDict).lookup(PDFName.of('GS0'), PDFDict);
    expect(gs.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0.6);
    if (type === 'arrow') {
      expect(root.lookup(PDFName.of('LE'), PDFArray).toString()).toBe('[ /Circle /ClosedArrow ]');
      expect(root.lookup(PDFName.of('IC'), PDFArray).toString()).toBe('[ 1 0 0 ]'); expect(content).toContain('h B');
    }
    const twice = await writeNativePdfAnnotations(output.bytes, [turn(reopened)]);
    const final = (await readNativePdfAnnotations(twice.bytes)).annotations[0]; expectPoints(final.data.points, turn(reopened).data.points);
    if (process.env.WP01_SYNTHETIC_LINE_PROOF_DIR && type === 'arrow') {
      await fs.mkdir(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'new-first.pdf'), output.bytes);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'new-second.pdf'), twice.bytes);
    }
  });
  it('keeps the full arrowhead and stroke for tight and roomy model rectangles', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]); const bytes = await doc.save();
    const item: PdfAnnotation = { id: 'edge-arrow', type: 'arrow', pageNumber: 1, rect: { x: 100, y: 100, width: 80, height: 60 },
      data: { points: [0, 0, 80, 60], lineEndCap: 'arrow', borderWidth: 4, borderColor: '#3b82f6' }, createdAt: 1, updatedAt: 1 };
    const tight = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    const roomy = (await writeNativePdfAnnotations(bytes, [{ ...item, rect: { x: 90, y: 90, width: 100, height: 80 },
      data: { ...item.data, points: [10, 10, 90, 70] } }])).bytes;
    if (process.env.WP01_SYNTHETIC_LINE_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'edge-tight.pdf'), tight);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_LINE_PROOF_DIR, 'edge-roomy.pdf'), roomy);
    }
    const source = await rootAt(tight); const target = await rootAt(roomy);
    expect(source.lookup(PDFName.of('L'), PDFArray).toString()).toBe(target.lookup(PDFName.of('L'), PDFArray).toString());
  });
  it.each([
    { label: 'horizontal', rect: { x: 0, y: 0, width: 80, height: 0.1 }, points: [0, 0, 80, 0] },
    { label: 'vertical', rect: { x: 0, y: 0, width: 0.1, height: 80 }, points: [0, 80, 0, 0] },
  ])('preserves $label edge line endpoints through save/reopen/second rotation', async ({ rect, points }) => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'edge-thin', type: 'arrow', pageNumber: 1, rect,
      data: { points, lineEndCap: 'arrow', borderWidth: 4, borderColor: '#3b82f6' }, createdAt: 1, updatedAt: 1 };
    const changed = turn(item); const output = await writeNativePdfAnnotations(await doc.save(), [changed]);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    for (let i = 0; i < 4; i += 2) {
      expect(reopened.rect.x + reopened.data.points![i]).toBeCloseTo(changed.rect.x + changed.data.points![i], 4);
      expect(reopened.rect.y + reopened.data.points![i + 1]).toBeCloseTo(changed.rect.y + changed.data.points![i + 1], 4);
    }
    const pdfRect = (await rootAt(output.bytes)).lookup(PDFName.of('Rect'), PDFArray);
    const bounds = [0, 1, 2, 3].map((i) => pdfRect.lookup(i, PDFNumber).asNumber());
    expect(bounds[0] < 0 || bounds[1] < 0 || bounds[2] > 400 || bounds[3] > 500).toBe(true);
    const second = turn(reopened); const again = await writeNativePdfAnnotations(output.bytes, [second]);
    expectPoints((await readNativePdfAnnotations(again.bytes)).annotations[0].data.points, second.data.points);
  });
  it.each([0, 90, 180, 270])('copies rotated arrow onto a differently rotated cropped page and materializes it at %s', async (rotation) => {
    const bytes = await fixture(rotation, 'ClosedArrow'); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().updateAnnotation(original.id, rotateLineQuarterTurn(original)!); useAnnotationStore.getState().setSelection([original.id]);
    useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations; const copy = current.find((item) => item.pageNumber === 2)!;
    const result = await materializeCopiedAnnotations(bytes, current); const actual = result.annotations.find((item) => item.pageNumber === 2)!;
    expect(actual.rect).toEqual(copy.rect); expectPoints(actual.data.points, copy.data.points);
    expect((actual.data as typeof actual.data & { nativeLineQuarterTurns?: number }).nativeLineQuarterTurns).toBeUndefined();
    const again = await writeNativePdfAnnotations(result.bytes, result.annotations); const reopened = (await readNativePdfAnnotations(again.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expectPoints(reopened.data.points, copy.data.points); expect((await rootAt(again.bytes, 1)).lookup(PDFName.of('LE'), PDFArray).toString()).toBe('[ /Circle /ClosedArrow ]');
  });
});
