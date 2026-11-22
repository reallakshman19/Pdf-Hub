import { describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString, degrees } from 'pdf-lib';
import { rotatePolygonQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function fixture(rotation = 0, withAppearance = true, centered = false) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([400, 500]);
  source.setCropBox(25, 30, 300, 400);
  source.setRotation(degrees(rotation));
  const target = doc.addPage([500, 600]);
  target.setCropBox(40, 60, 300, 400);
  target.setRotation(degrees((rotation + 90) % 360));
  const rect = centered ? [100, 100, 180, 180] : [100, 100, 200, 160];
  const vertices = centered ? [140, 140, 140, 140, 140, 140] : [110, 110, 185, 120, 160, 150, 120, 140];
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 8 8 25 12 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, rect[2] - rect[0], rect[3] - rect[1]], Resources: {},
  }));
  const polygon = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Polygon', NM: PDFString.of('poly'), P: source.ref,
    Rect: rect, Vertices: vertices, C: [0.1, 0.2, 0.3], ...(withAppearance ? { AP: { N: appearance } } : {}),
  }));
  source.node.set(PDFName.of('Annots'), doc.context.obj([polygon]));
  return doc.save();
}

function turn(item: PdfAnnotation, count = 1): PdfAnnotation {
  for (let i = 0; i < count; i += 1) item = { ...item, ...rotatePolygonQuarterTurn(item)! };
  return item;
}

async function polygonAt(bytes: Uint8Array, page: number) {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPage(page).node.lookup(PDFName.of('Annots'), PDFArray);
  return annots.lookup(0, PDFDict);
}

describe('native polygon quarter-turn', () => {
  it.each([0, 90, 180, 270])('rotates native vertices and appearance on a cropped page at %s degrees', async (rotation) => {
    const bytes = await fixture(rotation);
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const count of [1, 2, 3]) {
      const changed = turn(original, count);
      const saved = await writeNativePdfAnnotations(bytes, [changed]);
      if (process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR && rotation === 0 && count === 1) {
        await fs.mkdir(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, { recursive: true });
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'source.pdf'), bytes);
        await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'rotated.pdf'), saved.bytes);
      }
      const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
      expect(reopened.rect).toEqual(changed.rect);
      reopened.data.points!.forEach((value, index) => expect(value).toBeCloseTo(changed.data.points![index], 4));
      expect((reopened.data as typeof reopened.data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns).toBeUndefined();
      const dict = await polygonAt(saved.bytes, 0);
      const stream = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
      expect(stream.dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
    }
  });

  it('rotates asymmetric artwork even when every source vertex is at the center', async () => {
    const bytes = await fixture(0, true, true);
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const rotated = turn(original);
    expect(rotated.data.points).toEqual(original.data.points);
    const saved = await writeNativePdfAnnotations(bytes, [rotated]);
    const dict = await polygonAt(saved.bytes, 0);
    expect(dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
    const restored = turn(original, 4);
    expect((restored.data as typeof restored.data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns).toBeUndefined();
    const unchanged = await writeNativePdfAnnotations(bytes, [restored]);
    const restoredDict = await polygonAt(unchanged.bytes, 0);
    expect(restoredDict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeUndefined();
  });

  it('rejects altered geometry and missing native artwork instead of silently losing it', async () => {
    const bytes = await fixture();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const rotated = turn(original);
    const invalid = { ...rotated, data: { ...rotated.data, points: rotated.data.points!.map((value, i) => i === 0 ? value + 2 : value) } };
    await expect(writeNativePdfAnnotations(bytes, [invalid])).rejects.toThrow('Cannot safely rotate this polygon');
    const noAppearance = await fixture(0, false);
    const noAppearancePolygon = (await readNativePdfAnnotations(noAppearance)).annotations[0];
    await expect(writeNativePdfAnnotations(noAppearance, [turn(noAppearancePolygon)])).rejects.toThrow('without a native appearance');
  });

  it('preserves an imported polygon\'s precise native fill during no-op save and rotation', async () => {
    const doc = await PDFDocument.load(await fixture());
    const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    root.set(PDFName.of('IC'), doc.context.obj([0.123456, 0.345678, 0.567891]));
    const bytes = await doc.save();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const annotation of [original, turn(original)]) {
      const output = await writeNativePdfAnnotations(bytes, [annotation]);
      const saved = await polygonAt(output.bytes, 0);
      expect(saved.lookup(PDFName.of('IC'), PDFArray).toString()).toBe('[ 0.123456 0.345678 0.567891 ]');
    }
  });

  it('rotates a newly created polygon without a native source and reopens its standard vertices', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 500]);
    const original: PdfAnnotation = {
      id: 'new-polygon', type: 'shape-polygon', pageNumber: 1,
      rect: { x: 100, y: 100, width: 100, height: 60 },
      data: { points: [110, 110, 185, 120, 160, 150, 120, 140], borderColor: '#ff0000',
        backgroundColor: '#00ff00', borderWidth: 3, borderStyle: 'dashed', opacity: 0.6 },
      createdAt: 1, updatedAt: 1,
    };
    const changed = turn(original);
    const saved = await writeNativePdfAnnotations(await doc.save(), [changed]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.rect).toEqual(changed.rect);
    reopened.data.points!.forEach((value, index) => expect(value).toBeCloseTo(changed.data.points![index], 4));
    expect((reopened.data as typeof reopened.data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns).toBeUndefined();
    const root = await polygonAt(saved.bytes, 0);
    const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const content = new TextDecoder().decode(decodePDFRawStream(form).decode());
    expect(content).toContain('1 0 0 RG');
    expect(content).toContain('0 1 0 rg');
    expect(content).toContain('3 w');
    expect(content).toContain('[3 2] 0 d');
    expect(content).toContain('h\nB');
    const gs = form.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('ExtGState'), PDFDict).lookup(PDFName.of('GS0'), PDFDict);
    expect(gs.lookup(PDFName.of('CA'), PDFNumber).asNumber()).toBeCloseTo(0.6);
    expect(gs.lookup(PDFName.of('ca'), PDFNumber).asNumber()).toBeCloseTo(0.6);
    const twice = await writeNativePdfAnnotations(saved.bytes, [turn(reopened)]);
    expect((await polygonAt(twice.bytes, 0)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
    if (process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'new-first.pdf'), saved.bytes);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'new-second.pdf'), twice.bytes);
    }
  });

  it('rejects unsupported new-polygon colors rather than substituting appearance', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'unsupported-color', type: 'shape-polygon', pageNumber: 1,
      rect: { x: 20, y: 30, width: 80, height: 60 },
      data: { points: [20, 30, 100, 30, 60, 90], borderColor: 'rgb(1,2,3)' }, createdAt: 1, updatedAt: 1 };
    await expect(writeNativePdfAnnotations(await doc.save(), [item])).rejects.toThrow('unsupported color');
  });

  it('renders the app default transparent fill with its blue outline', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'default-polygon', type: 'shape-polygon', pageNumber: 1,
      rect: { x: 20, y: 30, width: 80, height: 60 },
      data: { points: [25, 35, 95, 35, 60, 85], backgroundColor: 'transparent', borderColor: '#3b82f6', borderWidth: 2 },
      createdAt: 1, updatedAt: 1 };
    const bytes = (await writeNativePdfAnnotations(await doc.save(), [turn(item)])).bytes;
    const root = await polygonAt(bytes, 0);
    expect(root.get(PDFName.of('IC'))).toBeUndefined();
    expect((await readNativePdfAnnotations(bytes)).annotations[0].data.backgroundColor).toBe('transparent');
    const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const content = new TextDecoder().decode(decodePDFRawStream(form).decode());
    expect(content).toContain('h\nS');
    expect(content).not.toContain('h\nB');
    if (process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'default.pdf'), bytes);
    }
  });

  it('preserves edge vertices through save, reopen and another rotation', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const item: PdfAnnotation = { id: 'edge-polygon', type: 'shape-polygon', pageNumber: 1,
      rect: { x: 0, y: 10, width: 80, height: 60 },
      data: { points: [0, 10, 80, 10, 40, 70], backgroundColor: 'transparent', borderColor: '#3b82f6', borderWidth: 2 },
      createdAt: 1, updatedAt: 1 };
    const once = turn(item);
    const bytes = (await writeNativePdfAnnotations(await doc.save(), [once])).bytes;
    const saved = (await readNativePdfAnnotations(bytes)).annotations[0];
    saved.data.points!.forEach((value, i) => expect(value).toBeCloseTo(once.data.points![i], 4));
    expect(saved.rect.width).toBeGreaterThan(once.rect.width);
    expect(saved.rect.height).toBeGreaterThan(once.rect.height);
    const twice = turn(saved);
    const again = (await writeNativePdfAnnotations(bytes, [twice])).bytes;
    const reopened = (await readNativePdfAnnotations(again)).annotations[0];
    reopened.data.points!.forEach((value, i) => expect(value).toBeCloseTo(twice.data.points![i], 4));
    if (process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'page-edge-first.pdf'), bytes);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'page-edge-second.pdf'), again);
    }
  });

  it('produces identical edge artwork from tight and roomy model rectangles', async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const bytes = await doc.save();
    const item: PdfAnnotation = { id: 'edge-control', type: 'shape-polygon', pageNumber: 1,
      rect: { x: 100, y: 100, width: 80, height: 60 },
      data: { points: [100, 100, 180, 100, 140, 160], backgroundColor: 'transparent', borderColor: '#3b82f6', borderWidth: 8 },
      createdAt: 1, updatedAt: 1 };
    const tight = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    const roomy = (await writeNativePdfAnnotations(bytes, [{ ...item, rect: { x: 90, y: 90, width: 100, height: 80 } }])).bytes;
    const tightVertices = (await readNativePdfAnnotations(tight)).annotations[0].data.points;
    const roomyVertices = (await readNativePdfAnnotations(roomy)).annotations[0].data.points;
    expect(tightVertices).toEqual(roomyVertices);
    if (process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR) {
      await fs.mkdir(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'edge-tight.pdf'), tight);
      await fs.writeFile(path.join(process.env.WP01_SYNTHETIC_POLYGON_PROOF_DIR, 'edge-roomy.pdf'), roomy);
    }
  });

  it.each([0, 90, 180, 270])('copies a rotated polygon to a differently rotated page and materializes it at %s degrees', async (rotation) => {
    const bytes = await fixture(rotation);
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().updateAnnotation(original.id, rotatePolygonQuarterTurn(original)!);
    useAnnotationStore.getState().setSelection([original.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations;
    const copy = current.find((item) => item.pageNumber === 2)!;
    expect(copy).toBeDefined();
    const materialized = await materializeCopiedAnnotations(bytes, current);
    const actual = materialized.annotations.find((item) => item.pageNumber === 2)!;
    expect(actual.rect).toEqual(copy.rect);
    actual.data.points!.forEach((value, index) => expect(value).toBeCloseTo(copy.data.points![index], 4));
    expect((actual.data as typeof actual.data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns).toBeUndefined();
    const savedAgain = await writeNativePdfAnnotations(materialized.bytes, materialized.annotations);
    const reopened = (await readNativePdfAnnotations(savedAgain.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expect(reopened.rect).toEqual(copy.rect);
    reopened.data.points!.forEach((value, index) => expect(value).toBeCloseTo(copy.data.points![index], 4));
  });
});
