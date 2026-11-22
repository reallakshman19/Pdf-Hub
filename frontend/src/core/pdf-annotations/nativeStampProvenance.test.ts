import { describe, expect, it } from 'vitest';
import * as pdf from 'pdf-lib';
import {
  fingerprintStampAppearance, sealStampAppearanceFingerprint,
  STAMP_AP_FINGERPRINT_KEY, verifyStampAppearanceFingerprint,
} from './nativeStampProvenance';

async function fixture(rotated = false) {
  const doc = await pdf.PDFDocument.create();
  const fontFile = doc.context.register(doc.context.flateStream(new Uint8Array([1, 2, 3, 4]), { Length1: 4 }));
  const descriptor = doc.context.register(doc.context.obj({ Type: 'FontDescriptor', FontFile2: fontFile }));
  const font = doc.context.register(doc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica-Bold', Encoding: 'WinAnsiEncoding', FontDescriptor: descriptor }));
  const image = doc.context.register(doc.context.flateStream(new Uint8Array([10, 20, 30]), { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }));
  const child = doc.context.register(doc.context.flateStream('q Q', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} }));
  const gs = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: 1, ca: 1 }));
  const resources = doc.context.obj({ Font: { F1: font }, XObject: { Im1: image, Child: child }, ExtGState: { GS0: gs } });
  const baseForm = doc.context.register(doc.context.flateStream('q /GS0 gs /Child Do Q\n', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Matrix: [1, 0, 0, 1, 0, 0], Resources: resources }));
  const baseAp = doc.context.obj({ N: baseForm });
  const wrapper = doc.context.register(doc.context.flateStream('q /Original Do Q\n', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Matrix: [0, -1, 1, 0, 0, 0], Resources: { XObject: { Original: baseForm } } }));
  const stamp = doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', NM: pdf.PDFString.of('synthetic'),
    Rect: rotated ? [45, 5, 75, 85] : [20, 30, 100, 60],
    Contents: pdf.PDFString.of('APPROVED'), PDFHubData: pdf.PDFString.of('{"nativeStampAppearanceKind":"generated"}'),
    AP: rotated ? { N: wrapper } : baseAp,
    ...(rotated ? { PDFHubBaseAP: baseAp, PDFHubBaseRect: [20, 30, 100, 60], PDFHubRotation: 90 } : {}),
  });
  const page = doc.addPage([300, 400]);
  page.node.set(pdf.PDFName.of('Annots'), doc.context.obj([doc.context.register(stamp)]));
  return { doc, stamp, baseForm, wrapper, fontFile, font, image, child, gs };
}

const N = pdf.PDFName.of;

describe('generated stamp appearance provenance', () => {
  it('fails closed without a valid marker and survives a PDF save/reopen', async () => {
    const { doc, stamp } = await fixture();
    expect(await verifyStampAppearanceFingerprint(doc, stamp, pdf)).toBe(false);
    expect(await sealStampAppearanceFingerprint(doc, stamp, pdf)).toBe(true);
    expect(await verifyStampAppearanceFingerprint(doc, stamp, pdf)).toBe(true);
    const reopened = await pdf.PDFDocument.load(await doc.save());
    const saved = reopened.getPage(0).node.lookup(N('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    expect(await verifyStampAppearanceFingerprint(reopened, saved, pdf)).toBe(true);
    saved.set(N(STAMP_AP_FINGERPRINT_KEY), pdf.PDFNumber.of(7));
    expect(await verifyStampAppearanceFingerprint(reopened, saved, pdf)).toBe(false);
  });

  it.each(['content', 'bbox', 'matrix', 'font', 'font-stream', 'opacity', 'image', 'child', 'inputs', 'extra-state'] as const)(
    'detects changed %s while the old marker remains', async (change) => {
      const f = await fixture();
      expect(await sealStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(true);
      const form = f.doc.context.lookup(f.baseForm, pdf.PDFStream) as pdf.PDFRawStream;
      if (change === 'content') {
        const replacement = f.doc.context.flateStream('q 1 0 0 rg 80 30 re f Q\n', {});
        f.doc.context.assign(f.baseForm, pdf.PDFRawStream.of(form.dict, replacement.contents));
      }
      if (change === 'bbox') form.dict.set(N('BBox'), f.doc.context.obj([0, 0, 81, 30]));
      if (change === 'matrix') form.dict.set(N('Matrix'), f.doc.context.obj([1, 0, 0, 1, 1, 0]));
      if (change === 'font') f.doc.context.lookup(f.font, pdf.PDFDict).set(N('Encoding'), N('MacRomanEncoding'));
      if (change === 'font-stream') {
        const original = f.doc.context.lookup(f.fontFile, pdf.PDFStream) as pdf.PDFRawStream;
        const replacement = f.doc.context.flateStream(new Uint8Array([1, 2, 3, 5]), {});
        f.doc.context.assign(f.fontFile, pdf.PDFRawStream.of(original.dict, replacement.contents));
      }
      if (change === 'opacity') f.doc.context.lookup(f.gs, pdf.PDFDict).set(N('ca'), pdf.PDFNumber.of(0.5));
      if (change === 'image') {
        const original = f.doc.context.lookup(f.image, pdf.PDFStream) as pdf.PDFRawStream;
        const replacement = f.doc.context.flateStream(new Uint8Array([11, 20, 30]), {});
        f.doc.context.assign(f.image, pdf.PDFRawStream.of(original.dict, replacement.contents));
      }
      if (change === 'child') (f.doc.context.lookup(f.child, pdf.PDFStream) as pdf.PDFRawStream).dict.set(N('BBox'), f.doc.context.obj([0, 0, 11, 10]));
      if (change === 'inputs') f.stamp.set(N('Contents'), pdf.PDFString.of('ALTERED'));
      if (change === 'extra-state') f.stamp.lookup(N('AP'), pdf.PDFDict).set(N('R'), f.baseForm);
      expect(await verifyStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(false);
    },
  );

  it('binds the rotated wrapper, base appearance and rotation geometry', async () => {
    const f = await fixture(true);
    expect(await sealStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(true);
    expect(await verifyStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(true);
    const wrapper = f.doc.context.lookup(f.wrapper, pdf.PDFStream) as pdf.PDFRawStream;
    wrapper.dict.set(N('Matrix'), f.doc.context.obj([0, -1, 1, 0, 1, 0]));
    expect(await verifyStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(false);
    expect(await sealStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(true);
    (f.doc.context.lookup(f.baseForm, pdf.PDFStream) as pdf.PDFRawStream).dict.set(N('BBox'), f.doc.context.obj([0, 0, 79, 30]));
    expect(await verifyStampAppearanceFingerprint(f.doc, f.stamp, pdf)).toBe(false);
    f.stamp.set(N('Rect'), f.doc.context.obj([45, 5, 76, 85]));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBeNull();
  });

  it('is stable across dictionary insertion order and indirect object numbers', async () => {
    const f = await fixture();
    const before = await fingerprintStampAppearance(f.doc, f.stamp, pdf);
    expect(before).not.toBeNull();
    const form = f.doc.context.lookup(f.baseForm, pdf.PDFStream) as pdf.PDFRawStream;
    const resources = form.dict.lookup(N('Resources'), pdf.PDFDict);
    const entries = resources.entries();
    for (const [key] of entries) resources.delete(key);
    for (const [key, value] of entries.reverse()) resources.set(key, value);
    const replacementRef = f.doc.context.register(form.clone(f.doc.context));
    f.stamp.lookup(N('AP'), pdf.PDFDict).set(N('N'), replacementRef);
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBe(before);
  });

  it('rejects unsupported filters, parameters, states, cycles and budgets', async () => {
    const f = await fixture();
    const form = f.doc.context.lookup(f.baseForm, pdf.PDFStream) as pdf.PDFRawStream;
    form.dict.set(N('Filter'), N('DCTDecode'));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBeNull();
    form.dict.set(N('Filter'), N('FlateDecode'));
    form.dict.set(N('DecodeParms'), f.doc.context.obj({ Predictor: 12 }));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBeNull();
    form.dict.delete(N('DecodeParms'));
    const resources = form.dict.lookup(N('Resources'), pdf.PDFDict);
    resources.set(N('Cycle'), f.baseForm);
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBeNull();
    resources.delete(N('Cycle'));
    resources.set(N('Dangling'), pdf.PDFRef.of(999_999, 0));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf)).toBeNull();
    resources.delete(N('Dangling'));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf, { maxDepth: 1 })).toBeNull();
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf, { maxObjects: 1 })).toBeNull();
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf, { maxBytes: 50 })).toBeNull();
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf, { maxBytes: 9_000_000 })).toBeNull();
  });

  it('rejects a compressed stream exceeding the decoded-byte budget', async () => {
    const f = await fixture();
    const huge = f.doc.context.register(f.doc.context.flateStream(new Uint8Array(100_000), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {} }));
    f.stamp.set(N('AP'), f.doc.context.obj({ N: huge }));
    expect(await fingerprintStampAppearance(f.doc, f.stamp, pdf, { maxBytes: 4096 })).toBeNull();
  });
});
