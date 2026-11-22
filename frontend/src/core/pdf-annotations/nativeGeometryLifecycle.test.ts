import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, PDFString, degrees } from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture() {
  const doc = await PDFDocument.create();
  const source = doc.addPage([300, 400]);
  const target = doc.addPage([300, 400]);
  target.setRotation(degrees(90));
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 RG 3 w 0 0 m 100 50 l S Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
  }));
  const refs: PDFRef[] = [];
  for (const [name, subtype, extra] of [
    ['ink', 'Ink', { InkList: [[30, 220, 70, 240, 100, 210]] }],
    ['polygon', 'Polygon', { Vertices: [30, 210, 100, 215, 80, 250] }],
    ['line', 'Line', { L: [30, 220, 100, 240] }],
  ] as const) {
    refs.push(doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: subtype, NM: PDFString.of(name), P: source.ref,
      Rect: [20, 200, 120, 260], C: [0.123456, 0.54321, 0.987654], AP: { N: ap }, ...extra,
    })));
  }
  source.node.set(PDFName.of('Annots'), doc.context.obj(refs));
  return doc.save();
}

function byName(annots: PDFArray, name: string) {
  for (let i = 0; i < annots.size(); i += 1) {
    const dict = annots.lookup(i, PDFDict);
    if (dict.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText() === name) return dict;
  }
  throw new Error(`Missing annotation ${name}`);
}

const translated = (values: number[], dx: number, dy: number) =>
  values.map((value, index) => value + (index % 2 ? dy : dx));

describe('native ink and polygon geometry lifecycle', () => {
  it('copies absolute ink and polygon geometry on screen and into a rotated-page PDF', async () => {
    const bytes = await fixture();
    const originals = (await readNativePdfAnnotations(bytes)).annotations;
    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations(originals);
    for (const original of originals.filter((item) => item.type === 'ink' || item.type === 'shape-polygon')) {
      useAnnotationStore.getState().setSelection([original.id]);
      useAnnotationStore.getState().copySelection();
      useAnnotationStore.getState().pasteClipboard(2);
      const copy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2 && item.type === original.type)!;
      expect(copy.rect.x).toBe(original.rect.x + 18);
      expect(copy.rect.y).toBe(original.rect.y + 18);
      if (original.type === 'ink') expect(copy.data.paths).toEqual(original.data.paths!.map((path) => translated(path, 18, 18)));
      else expect(copy.data.points).toEqual(translated(original.data.points!, 18, 18));
    }
    const current = useAnnotationStore.getState().annotations;
    const output = await writeNativePdfAnnotations(bytes, current);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations;
    for (const copied of current.filter((item) => item.pageNumber === 2)) {
      const saved = reopened.find((item) => item.id === copied.id)!;
      expect(saved.rect).toEqual(copied.rect);
      if (copied.type === 'ink') expect(saved.data.paths).toEqual(copied.data.paths);
      else expect(saved.data.points).toEqual(copied.data.points);
    }
  });

  it('moves native ink, polygon and line without discarding their original appearance', async () => {
    const bytes = await fixture();
    const originals = (await readNativePdfAnnotations(bytes)).annotations;
    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations(originals);
    for (const original of originals) {
      useAnnotationStore.getState().updateAnnotation(original.id, {
        rect: { ...original.rect, x: original.rect.x + 25, y: original.rect.y + 15 },
      });
    }
    const updated = useAnnotationStore.getState().annotations;
    const saved = await writeNativePdfAnnotations(bytes, updated);
    const pdf = await PDFDocument.load(saved.bytes);
    const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    for (const original of originals) {
      const current = updated.find((item) => item.id === original.id)!;
      if (original.type === 'ink') expect(current.data.paths).toEqual(original.data.paths!.map((path) => translated(path, 25, 15)));
      if (original.type === 'shape-polygon') expect(current.data.points).toEqual(translated(original.data.points!, 25, 15));
      const dict = byName(annots, original.id);
      expect(dict.get(PDFName.of('AP')), `${original.type} must retain its appearance`).toBeDefined();
      const normal = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
      expect(normal.getContents().length).toBeGreaterThan(0);
    }
  });

  it('does not silently restore old native points when a copied shape is edited', async () => {
    const bytes = await fixture();
    const originals = (await readNativePdfAnnotations(bytes)).annotations;
    const polygon = originals.find((item) => item.type === 'shape-polygon')!;
    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations(originals);
    useAnnotationStore.getState().setSelection([polygon.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const copy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2)!;
    useAnnotationStore.getState().updateAnnotation(copy.id, {
      data: { ...copy.data, points: copy.data.points!.map((value, index) => index === 0 ? value + 8 : value) },
    });
    await expect(writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations))
      .rejects.toThrow('Cannot safely copy this modified native appearance');
  });

  it('resizes imported ink and polygons while retaining exact source colors and appearances', async () => {
    const bytes = await fixture();
    const originals = (await readNativePdfAnnotations(bytes)).annotations;
    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations(originals);
    for (const original of originals.filter((item) => item.type === 'ink' || item.type === 'shape-polygon')) {
      useAnnotationStore.getState().updateAnnotation(original.id, {
        rect: { ...original.rect, width: original.rect.width * 1.5, height: original.rect.height * 2 },
      });
    }
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const pdf = await PDFDocument.load(saved.bytes);
    const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    for (const original of originals.filter((item) => item.type === 'ink' || item.type === 'shape-polygon')) {
      const dict = byName(annots, original.id);
      expect(dict.get(PDFName.of('AP'))).toBeDefined();
      expect(dict.lookup(PDFName.of('C'), PDFArray).toString()).toBe('[ 0.123456 0.54321 0.987654 ]');
    }
  });
});
