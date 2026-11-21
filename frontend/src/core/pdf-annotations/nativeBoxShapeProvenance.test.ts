import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { BOX_GENERATED_AP_FINGERPRINT_KEY, BOX_GENERATED_AP_ORIENTATION_KEY,
  fingerprintGeneratedBoxAppearance, sealGeneratedBoxAppearanceFingerprint, verifyGeneratedBoxAppearanceFingerprint } from './nativeBoxShapeProvenance';

async function fixture(subtype: 'Square' | 'Circle' = 'Square') {
  const doc = await lib.PDFDocument.create(); const page = doc.addPage([300, 400]);
  const state = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: 0.6, ca: 0.6 }));
  const nested = doc.context.register(doc.context.flateStream('q 0 1 0 rg 0 0 5 5 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 5, 5], Resources: {},
  }));
  const appearance = doc.context.register(doc.context.flateStream('q /GS0 gs /Nested Do Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Matrix: [1, 0, 0, 1, 0, 0],
    Resources: { ExtGState: { GS0: state }, XObject: { Nested: nested } },
  }));
  const shape = doc.context.obj({ Type: 'Annot', Subtype: subtype, Rect: [40, 60, 140, 120],
    NM: lib.PDFString.of('shape'), C: [0.1, 0.2, 0.3], AP: { N: appearance } }) as lib.PDFDict;
  const ref = doc.context.register(shape); page.node.set(lib.PDFName.of('Annots'), doc.context.obj([ref]));
  return { doc, shape, state, nested };
}
const key = lib.PDFName.of;
const normal = (shape: lib.PDFDict) => shape.lookup(key('AP'), lib.PDFDict).lookup(key('N'), lib.PDFStream) as lib.PDFRawStream;

describe('generated box AP-only provenance', () => {
  it.each(['Square', 'Circle'] as const)('seals %s, survives save/reopen and ignores mutable native fields', async (subtype) => {
    const { doc, shape } = await fixture(subtype);
    expect(await verifyGeneratedBoxAppearanceFingerprint(doc, shape, lib)).toBe(false);
    expect(await sealGeneratedBoxAppearanceFingerprint(doc, shape, 0, lib)).toBe(true);
    for (const [name, value] of [
      ['Rect', [10, 20, 170, 160]], ['C', [0.9, 0.8, 0.7]], ['IC', [0.2, 0.4, 0.6]],
      ['CA', 0.4], ['BS', { W: 5, S: 'D', D: [4, 2] }], ['Border', [0, 0, 9]],
      ['Contents', lib.PDFString.of('Changed')], ['PDFHubData', lib.PDFString.of('new metadata')],
    ] as const) shape.set(key(name), doc.context.obj(value as never));
    expect(await verifyGeneratedBoxAppearanceFingerprint(doc, shape, lib)).toBe(true);
    const reopened = await lib.PDFDocument.load(await doc.save());
    const restored = reopened.getPage(0).node.lookup(key('Annots'), lib.PDFArray).lookup(0, lib.PDFDict);
    expect(await verifyGeneratedBoxAppearanceFingerprint(reopened, restored, lib)).toBe(true);
  });
  it('rejects subtype, reserved orientation and any AP graph changes', async () => {
    for (const mutation of ['subtype', 'orientation', 'stream', 'bbox', 'matrix', 'state', 'nested'] as const) {
      const { doc, shape, state, nested } = await fixture();
      expect(await sealGeneratedBoxAppearanceFingerprint(doc, shape, 0, lib)).toBe(true);
      const form = normal(shape);
      if (mutation === 'subtype') shape.set(key('Subtype'), key('Circle'));
      if (mutation === 'orientation') shape.set(key(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber.of(1));
      if (mutation === 'stream') shape.lookup(key('AP'), lib.PDFDict).set(key('N'), doc.context.register(doc.context.flateStream('q Q', {
        Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
      })));
      if (mutation === 'bbox') form.dict.set(key('BBox'), doc.context.obj([0, 0, 101, 60]));
      if (mutation === 'matrix') form.dict.set(key('Matrix'), doc.context.obj([1, 0, 0, 1, 1, 0]));
      if (mutation === 'state') doc.context.lookup(state, lib.PDFDict).set(key('ca'), lib.PDFNumber.of(0.8));
      if (mutation === 'nested') (doc.context.lookup(nested, lib.PDFStream) as lib.PDFRawStream).dict.set(key('BBox'), doc.context.obj([0, 0, 6, 5]));
      expect(await verifyGeneratedBoxAppearanceFingerprint(doc, shape, lib), mutation).toBe(false);
    }
  });
  it('fails closed for unsafe geometry semantics, AP states, unsupported compression and object budgets', async () => {
    for (const mutation of ['intent', 'differences', 'cloud', 'measure', 'norotate', 'state', 'filter', 'budget'] as const) {
      const { doc, shape } = await fixture();
      shape.set(key(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber.of(0));
      if (mutation === 'intent') shape.set(key('IT'), key('VendorSpecific'));
      if (mutation === 'differences') shape.set(key('RD'), doc.context.obj([1, 1, 1, 1]));
      if (mutation === 'cloud') shape.set(key('BE'), doc.context.obj({ S: 'C' }));
      if (mutation === 'measure') shape.set(key('Measure'), doc.context.obj({}));
      if (mutation === 'norotate') shape.set(key('F'), lib.PDFNumber.of(16));
      if (mutation === 'state') shape.lookup(key('AP'), lib.PDFDict).set(key('R'), shape.lookup(key('AP'), lib.PDFDict).get(key('N'))!);
      if (mutation === 'filter') normal(shape).dict.set(key('Filter'), key('DCTDecode'));
      const result = await fingerprintGeneratedBoxAppearance(doc, shape, lib, mutation === 'budget' ? { maxObjects: 1 } : {});
      expect(result, mutation).toBeNull();
    }
  });
  it('does not keep a stale marker when sealing an unsupported graph', async () => {
    const { doc, shape } = await fixture(); expect(await sealGeneratedBoxAppearanceFingerprint(doc, shape, 0, lib)).toBe(true);
    normal(shape).dict.set(key('Filter'), key('DCTDecode'));
    expect(await sealGeneratedBoxAppearanceFingerprint(doc, shape, 0, lib)).toBe(false);
    expect(shape.get(key(BOX_GENERATED_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(shape.get(key(BOX_GENERATED_AP_ORIENTATION_KEY))).toBeUndefined();
  });
});
