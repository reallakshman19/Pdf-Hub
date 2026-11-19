import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = doc.context.register(doc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' }));
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 RG 30 0 120 40 re S 0 20 m 30 20 l S BT /F1 12 Tf 35 15 Td (Old text) Tj ET Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 40], Resources: { Font: { F1: font } },
  }));
  const annot = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout',
    NM: PDFString.of('callout'), P: page.ref, Rect: [20, 100, 170, 140], RD: [30, 0, 0, 0], CL: [20, 120, 50, 120],
    Contents: PDFString.of('Old text'), RC: PDFString.of('<body><p><span style="color:#ff0000">Old text</span></p></body>'),
    DA: PDFString.of('/F1 12 Tf 1 0 0 rg'), AP: { N: appearance } }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([annot]));
  return doc.save();
}
async function root(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}
function array(dict: PDFDict, key: string) {
  return dict.lookup(PDFName.of(key), PDFArray).asArray().map((value) => Number(value.toString()));
}

describe('native callout rotation', () => {
  it('edits the same imported rich callout again after saving and reopening', async () => {
    const input = await fixture();
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    const edited = (item: typeof original, text: string) => ({ ...item, data: { ...item.data, text,
      nativeInterop: { fidelityClass: 'MUTATED_USER_EDIT' as const, reason: 'USER_EDITED' as const, richText: true } } });
    const first = await writeNativePdfAnnotations(input, [edited(original, 'First edit')]);
    const reopened = (await readNativePdfAnnotations(first.bytes)).annotations[0];
    const second = await writeNativePdfAnnotations(first.bytes, [edited(reopened, 'Second edit')]);
    expect((await readNativePdfAnnotations(second.bytes)).annotations[0].data.text).toBe('Second edit');
    expect((await root(second.bytes)).get(PDFName.of('RC'))).toBeDefined();
  });

  it.each([
    [90, [90, 60, 130, 210], [110, 210, 110, 180]],
    [180, [50, 100, 200, 140], [200, 120, 170, 120]],
    [270, [90, 30, 130, 180], [110, 30, 110, 60]],
  ])('keeps appearance and native leader aligned at %i degrees', async (angle, expectedRect, expectedLeader) => {
    const input = await fixture();
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    const output = await writeNativePdfAnnotations(input, [{ ...original, data: { ...original.data, rotation: angle } }]);
    const dict = await root(output.bytes);
    expect(array(dict, 'Rect')).toEqual(expectedRect);
    expect(array(dict, 'CL')).toEqual(expectedLeader);
    expect((await readNativePdfAnnotations(output.bytes)).annotations[0].data.rotation).toBe(angle);
  });

  it('rotates a native text box without changing its rich text', async () => {
    const doc = await PDFDocument.load(await fixture());
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    dict.set(PDFName.of('IT'), PDFName.of('FreeText'));
    dict.set(PDFName.of('Rect'), doc.context.obj([50, 100, 170, 140]));
    dict.delete(PDFName.of('CL')); dict.delete(PDFName.of('RD'));
    const bytes = await doc.save();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const output = await writeNativePdfAnnotations(bytes, [{ ...original, data: { ...original.data, rotation: 90 } }]);
    const saved = await root(output.bytes);
    expect(array(saved, 'Rect')).toEqual([90, 60, 130, 180]);
    expect(saved.get(PDFName.of('CL'))).toBeUndefined();
    expect(saved.get(PDFName.of('RC'))).toBeDefined();
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    expect(reopened.type).toBe('textbox');
    expect(reopened.data.rotation).toBe(90);
    expect(reopened.rect).toEqual(original.rect);
  });

  it('copies a rotated callout before saving without losing its leader or rich text', async () => {
    const doc = await PDFDocument.load(await fixture());
    doc.addPage([300, 400]);
    const bytes = await doc.save();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const rotated = { ...original, data: { ...original.data, rotation: 90 } };
    const copy = { ...rotated, id: 'copied-callout', pageNumber: 2,
      rect: { ...rotated.rect, x: rotated.rect.x + 18, y: rotated.rect.y + 18 },
      data: { ...rotated.data, nativeInterop: undefined,
        anchor: rotated.data.anchor ? { x: rotated.data.anchor.x + 18, y: rotated.data.anchor.y + 18 } : undefined,
        nativeCopySource: { pageNumber: 1, nativeName: original.id, requiresSource: true } } };
    const saved = await writeNativePdfAnnotations(bytes, [rotated, copy]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations;
    expect(reopened).toHaveLength(2);
    expect(reopened[1].data.rotation).toBe(90);
    expect(reopened[1].rect).toEqual(copy.rect);
    expect(reopened[1].data.anchor).toEqual(copy.data.anchor);
    expect(reopened[1].data.nativeInterop?.richText).toBe(true);
  });

  it('reopens and repeatedly edits a rotated callout copied onto a rotated page', async () => {
    const doc = await PDFDocument.load(await fixture());
    doc.addPage([400, 500]).setRotation(degrees(90));
    const bytes = await doc.save();
    const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const rotated = { ...original, data: { ...original.data, rotation: 90 } };
    const copy = { ...rotated, id: 'rotated-page-copy', pageNumber: 2,
      rect: { ...rotated.rect, x: rotated.rect.x + 18, y: rotated.rect.y + 18 },
      data: { ...rotated.data, nativeInterop: undefined,
        anchor: rotated.data.anchor ? { x: rotated.data.anchor.x + 18, y: rotated.data.anchor.y + 18 } : undefined,
        nativeCopySource: { pageNumber: 1, nativeName: original.id, requiresSource: true } } };
    const first = await writeNativePdfAnnotations(bytes, [rotated, copy]);
    let current = (await readNativePdfAnnotations(first.bytes)).annotations;
    expect(current[1].data.nativeOrientationAdjustment).toBe(270);
    expect(current[1].data.rotation).toBe(90);
    const edit = (text: string) => current.map((item) => item.id === 'rotated-page-copy' ? { ...item,
      data: { ...item.data, text, nativeInterop: { fidelityClass: 'MUTATED_USER_EDIT' as const, reason: 'USER_EDITED' as const, richText: true } } } : item);
    const second = await writeNativePdfAnnotations(first.bytes, edit('First edit'));
    current = (await readNativePdfAnnotations(second.bytes)).annotations;
    const third = await writeNativePdfAnnotations(second.bytes, edit('Second edit'));
    const final = (await readNativePdfAnnotations(third.bytes)).annotations;
    expect(final.find((item) => item.id === 'rotated-page-copy')?.data.text).toBe('Second edit');
    expect(final.find((item) => item.id === original.id)?.data.text).toBe('Old text');
    if (process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR) {
      await mkdir(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, { recursive: true });
      await writeFile(join(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, 'copied-rotated-pages.pdf'), first.bytes);
      await writeFile(join(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, 'copied-edited-twice.pdf'), third.bytes);
    }
  });

  it('rotates the native appearance and leader together, survives reopen and restores its original shape', async () => {
    const input = await fixture();
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    const rotated = { ...original, data: { ...original.data, rotation: 90 } };
    const saved = await writeNativePdfAnnotations(input, [rotated]);
    const dict = await root(saved.bytes);
    expect(array(dict, 'Rect')).toEqual([90, 60, 130, 210]);
    expect(array(dict, 'CL')).toEqual([110, 210, 110, 180]);
    expect(array(dict, 'RD')).toEqual([0, 30, 0, 0]);
    const ap = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    expect(array(ap.dict, 'Matrix').slice(0, 4)).toEqual([0, -1, 1, 0]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.rect).toEqual(original.rect);
    expect(reopened.data.anchor).toEqual(original.data.anchor);
    expect(reopened.data.rotation).toBe(90);
    const repeated = await writeNativePdfAnnotations(saved.bytes, [reopened]);
    expect(array(await root(repeated.bytes), 'CL')).toEqual([110, 210, 110, 180]);
    const restored = await writeNativePdfAnnotations(repeated.bytes, [{ ...reopened, data: { ...reopened.data, rotation: 0 } }]);
    expect(array(await root(restored.bytes), 'Rect')).toEqual([20, 100, 170, 140]);
    expect(array(await root(restored.bytes), 'CL')).toEqual([20, 120, 50, 120]);
    const originalAp = (await root(input)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    const restoredAp = (await root(restored.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    expect(Array.from(restoredAp)).toEqual(Array.from(originalAp));
    if (process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR) {
      await mkdir(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, { recursive: true });
      await writeFile(join(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, 'original.pdf'), input);
      await writeFile(join(process.env.WP01_SYNTHETIC_FREETEXT_EVIDENCE_DIR, 'rotated.pdf'), saved.bytes);
    }
  });
});
