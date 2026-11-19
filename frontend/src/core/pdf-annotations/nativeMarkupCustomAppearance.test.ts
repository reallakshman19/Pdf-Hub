import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream, degrees } from 'pdf-lib';
import { useAnnotationStore } from '../annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const subtypes = ['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Square'] as const;

describe('imported markup with absent optional fields', () => {
  it.each([true, false])('preserves absent fields on save and comment edit (appearance: %s)', async (withAppearance) => {
    const doc = await PDFDocument.load(await fixture('Highlight', withAppearance));
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    for (const key of ['F', 'C', 'CA', 'Border', 'BS']) dict.delete(PDFName.of(key));
    const bytes = await doc.save();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const changed of [item, { ...item, data: { ...item.data, text: 'updated' } }]) {
      const result = await writeNativePdfAnnotations(bytes, [changed]);
      const after = await root(result.bytes);
      for (const key of ['F', 'C', 'CA', 'Border', 'BS']) expect(after.get(PDFName.of(key)), key).toBeUndefined();
      if (withAppearance) expect(decoded(after)).toEqual(decoded(await root(bytes)));
      else expect(after.get(PDFName.of('AP'))).toBeUndefined();
    }
  });

  it('moves no-appearance markup without creating artwork or changing its quad shape', async () => {
    const bytes = await fixture('Highlight', false);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const moved = { ...item, rect: { ...item.rect, x: item.rect.x + 10 } };
    const result = await writeNativePdfAnnotations(bytes, [moved]);
    const after = await root(result.bytes);
    expect(after.get(PDFName.of('AP'))).toBeUndefined();
    expect(after.lookup(PDFName.of('QuadPoints'), PDFArray).asArray().map((entry) => Number(entry.toString())))
      .toEqual([50, 230, 150, 230, 50, 200, 150, 200]);
  });

  it('still rejects resize and recolor of no-appearance imported markup', async () => {
    const bytes = await fixture('Highlight', false);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, rect: { ...item.rect, width: item.rect.width * 2 } }]))
      .rejects.toThrow(/safely/i);
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, rect: { ...item.rect, x: item.rect.x + 10 },
      data: { ...item.data, backgroundColor: '#123456' } }])).rejects.toThrow(/safely/i);
  });
});

async function fixture(subtype: typeof subtypes[number], withAppearance = true) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const root = doc.context.obj({ Type: 'Annot', Subtype: subtype, NM: PDFString.of('markup'), P: page.ref,
    Rect: [40, 200, 140, 230], Contents: PDFString.of('old comment'), F: 4, C: [0, 0, 0] });
  if (subtype === 'Square') {
    root.set(PDFName.of('PDFHubType'), PDFString.of('redaction'));
    root.set(PDFName.of('IC'), doc.context.obj([0, 0, 0]));
  } else root.set(PDFName.of('QuadPoints'), doc.context.obj([40, 230, 140, 230, 40, 200, 140, 200]));
  if (withAppearance) {
    const custom = doc.context.register(doc.context.flateStream('q 1 0 0 rg 2 4 11 17 re f 0 1 0 rg 30 2 7 9 re f Q',
      { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 30], Resources: {} }));
    root.set(PDFName.of('AP'), doc.context.obj({ N: custom }));
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(root)]));
  return doc.save();
}

async function root(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}

async function generatedFixture(subtype: typeof subtypes[number], destinationRotation?: number) {
  const imported = await fixture(subtype, false);
  const item = (await readNativePdfAnnotations(imported)).annotations[0];
  const doc = await PDFDocument.load(imported);
  doc.getPage(0).node.delete(PDFName.of('Annots'));
  if (destinationRotation !== undefined) doc.addPage([300, 400]).setRotation(degrees(destinationRotation));
  const created = await writeNativePdfAnnotations(await doc.save(), [item]);
  return created.bytes;
}

function decoded(dict: PDFDict) {
  const stream = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  if (!(stream instanceof PDFRawStream)) throw new Error('Expected appearance stream');
  return Array.from(decodePDFRawStream(stream).decode());
}

describe('native markup custom appearances', () => {
  it.each(subtypes)('preserves custom %s artwork when changing comment metadata', async (subtype) => {
    const bytes = await fixture(subtype);
    const before = await root(bytes);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const updated = { ...item, data: { ...item.data, text: 'new comment' } };
    const result = await writeNativePdfAnnotations(bytes, [updated]);
    const after = await root(result.bytes);
    expect(after.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('new comment');
    expect(decoded(after)).toEqual(decoded(before));
    expect((await readNativePdfAnnotations(result.bytes)).annotations[0].data.text).toBe('new comment');
  });

  it.each(subtypes.filter((subtype) => subtype !== 'Square'))('rejects unsafe custom %s appearance edits without altering the source', async (subtype) => {
    const bytes = await fixture(subtype);
    const before = await root(bytes);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const changed = { ...item, data: { ...item.data, borderColor: '#123456', backgroundColor: '#123456' } };
    await expect(writeNativePdfAnnotations(bytes, [changed])).rejects.toThrow(/safely|appearance/i);
    expect(decoded(await root(bytes))).toEqual(decoded(before));
  });

  it('retains the custom visual mask when its forced black color is unchanged', async () => {
    const bytes = await fixture('Square');
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const changed = { ...item, data: { ...item.data, borderColor: '#123456', backgroundColor: '#123456' } };
    const result = await writeNativePdfAnnotations(bytes, [changed]);
    expect(decoded(await root(result.bytes))).toEqual(decoded(await root(bytes)));
  });

  it.each(subtypes)('preserves custom %s appearance on no-op and move', async (subtype) => {
    const bytes = await fixture(subtype);
    const original = await root(bytes);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const changed of [item, { ...item, rect: { ...item.rect, x: item.rect.x + 10 } }]) {
      const result = await writeNativePdfAnnotations(bytes, [changed]);
      expect(decoded(await root(result.bytes))).toEqual(decoded(original));
    }
  });

  it.each(subtypes.filter((subtype) => subtype !== 'Square'))('retains editable generated %s artwork across reopen and a second style edit', async (subtype) => {
    const created = await generatedFixture(subtype);
    const createdRoot = await root(created);
    expect(createdRoot.get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeDefined();
    const model = (await readNativePdfAnnotations(created)).annotations[0];
    const first = { ...model, data: { ...model.data, borderColor: '#123456', backgroundColor: '#123456' } };
    const edited = await writeNativePdfAnnotations(created, [first]);
    expect(decoded(await root(edited.bytes))).not.toEqual(decoded(createdRoot));
    const reopened = (await readNativePdfAnnotations(edited.bytes)).annotations[0];
    const second = { ...reopened, data: { ...reopened.data, borderColor: '#987654', backgroundColor: '#987654' } };
    const editedAgain = await writeNativePdfAnnotations(edited.bytes, [second]);
    expect(decoded(await root(editedAgain.bytes))).not.toEqual(decoded(await root(edited.bytes)));
    expect((await root(editedAgain.bytes)).get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeDefined();
  });

  it.each(['appearance', 'quads', 'color'] as const)('rejects editing generated artwork after external %s changes', async (tamper) => {
    const created = await generatedFixture('Highlight');
    const doc = await PDFDocument.load(created);
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    if (tamper === 'appearance') {
      const stream = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 8 8 re f Q',
        { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 30], Resources: {} }));
      dict.set(PDFName.of('AP'), doc.context.obj({ N: stream }));
    } else if (tamper === 'quads') dict.set(PDFName.of('QuadPoints'), doc.context.obj([50, 230, 140, 230, 50, 200, 140, 200]));
    else dict.set(PDFName.of('C'), doc.context.obj([0.1, 0.2, 0.3]));
    const externallyEdited = await doc.save();
    const item = (await readNativePdfAnnotations(externallyEdited)).annotations[0];
    const original = await root(externallyEdited);
    const noop = await writeNativePdfAnnotations(externallyEdited, [item]);
    expect(decoded(await root(noop.bytes))).toEqual(decoded(original));
    const changed = { ...item, data: { ...item.data, backgroundColor: '#123456' } };
    await expect(writeNativePdfAnnotations(externallyEdited, [changed])).rejects.toThrow(/safely|appearance/i);
  });

  it.each([0, 90, 180, 270])('preserves generated appearance provenance after copying to page rotation %s and editing after reopen', async (rotation) => {
    const created = await generatedFixture('Highlight', rotation);
    const source = (await readNativePdfAnnotations(created)).annotations[0];
    useAnnotationStore.getState().setAnnotations([source]);
    useAnnotationStore.getState().setSelection([source.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const saved = await writeNativePdfAnnotations(created, useAnnotationStore.getState().annotations);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations;
    const copy = reopened.find((annotation) => annotation.pageNumber === 2)!;
    expect(copy).toBeDefined();
    const modified = reopened.map((annotation) => annotation.id === copy.id
      ? { ...annotation, data: { ...annotation.data, backgroundColor: '#123456' } } : annotation);
    const edited = await writeNativePdfAnnotations(saved.bytes, modified);
    const result = await PDFDocument.load(edited.bytes);
    const sourceRoot = result.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const copiedRoot = result.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(decoded(sourceRoot)).not.toEqual(decoded(copiedRoot));
    expect(copiedRoot.get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeDefined();
  });

  it.each(subtypes)('updates only the copied %s comment before first save and keeps the native artwork', async (subtype) => {
    const input = await PDFDocument.load(await fixture(subtype));
    input.addPage([300, 400]);
    const bytes = await input.save();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    useAnnotationStore.getState().setAnnotations([original]);
    useAnnotationStore.getState().setSelection([original.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const items = useAnnotationStore.getState().annotations.map((item) => item.pageNumber === 2
      ? { ...item, data: { ...item.data, text: 'copied comment' } } : item);
    const result = await writeNativePdfAnnotations(bytes, items);
    const doc = await PDFDocument.load(result.bytes);
    const originalRoot = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const copyRoot = doc.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(originalRoot.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('old comment');
    expect(copyRoot.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('copied comment');
    expect(decoded(copyRoot)).toEqual(decoded(originalRoot));
  });

  it.each(subtypes.filter((subtype) => subtype !== 'Square'))('preserves no-AP perimeter-ordered %s without inventing artwork and rejects style edits', async (subtype) => {
    const doc = await PDFDocument.load(await fixture(subtype, false));
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const perimeter = [40, 230, 140, 230, 140, 200, 40, 200];
    dict.set(PDFName.of('QuadPoints'), doc.context.obj(perimeter));
    const bytes = await doc.save();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const changed of [item, { ...item, data: { ...item.data, text: 'new comment' } }]) {
      const result = await writeNativePdfAnnotations(bytes, [changed]);
      const after = await root(result.bytes);
      expect(after.get(PDFName.of('AP'))).toBeUndefined();
      expect(after.lookup(PDFName.of('QuadPoints'), PDFArray).asArray().map((entry) => Number(entry.toString()))).toEqual(perimeter);
      expect(after.get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeUndefined();
    }
    const restyled = { ...item, data: { ...item.data, borderColor: '#123456', backgroundColor: '#123456' } };
    await expect(writeNativePdfAnnotations(bytes, [restyled])).rejects.toThrow(/safely|quadrilateral/i);
  });

  it.each([
    [40, 230, 140, 230, 40, 200, 140, 200],
    [40, 200, 140, 200, 40, 230, 140, 230],
  ])('preserves a no-AP paired quad on no-op and comment edit', async (...quad) => {
    const doc = await PDFDocument.load(await fixture('Underline', false));
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    dict.set(PDFName.of('QuadPoints'), doc.context.obj(quad));
    const bytes = await doc.save();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const changed of [item, { ...item, data: { ...item.data, text: 'new comment' } }]) {
      const result = await writeNativePdfAnnotations(bytes, [changed]);
      const after = await root(result.bytes);
      expect(after.get(PDFName.of('AP'))).toBeUndefined();
      expect(after.lookup(PDFName.of('QuadPoints'), PDFArray).asArray().map((entry) => Number(entry.toString()))).toEqual(quad);
      expect(after.get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeUndefined();
    }
  });

  it('copies imported no-AP markup and edits its comment without creating an appearance', async () => {
    const doc = await PDFDocument.load(await fixture('Underline', false));
    doc.addPage([300, 400]).setRotation(degrees(90));
    const bytes = await doc.save();
    const source = (await readNativePdfAnnotations(bytes)).annotations[0];
    useAnnotationStore.getState().setAnnotations([source]);
    useAnnotationStore.getState().setSelection([source.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const items = useAnnotationStore.getState().annotations.map((item) => item.pageNumber === 2
      ? { ...item, data: { ...item.data, text: 'copied comment' } } : item);
    const result = await writeNativePdfAnnotations(bytes, items);
    const output = await PDFDocument.load(result.bytes);
    const first = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const copy = output.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(first.get(PDFName.of('AP'))).toBeUndefined();
    expect(copy.get(PDFName.of('AP'))).toBeUndefined();
    expect(copy.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('copied comment');
  });

  it('preserves no-AP visual-mask viewer authority on no-op and comment-only saves', async () => {
    const bytes = await fixture('Square', false);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    for (const changed of [item, { ...item, data: { ...item.data, text: 'new comment' } }]) {
      const result = await writeNativePdfAnnotations(bytes, [changed]);
      const after = await root(result.bytes);
      expect(after.get(PDFName.of('AP'))).toBeUndefined();
      expect(after.get(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'))).toBeUndefined();
    }
  });

  it('fails closed on malformed no-AP text-markup quadrilaterals', async () => {
    const doc = await PDFDocument.load(await fixture('Highlight', false));
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    dict.set(PDFName.of('QuadPoints'), doc.context.obj([40, 230, 140, 230, 140, 200]));
    const bytes = await doc.save();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    await expect(writeNativePdfAnnotations(bytes, [item])).rejects.toThrow(/safely|quadrilateral/i);
  });
});
