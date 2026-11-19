import { describe, expect, it } from 'vitest';
import * as pdf from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { isImportedStampArtworkReadOnly } from '@/core/annotations/nativeInteropFidelity';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { STAMP_AP_FINGERPRINT_KEY, STAMP_ROTATION_FINGERPRINT_KEY, verifyStampAppearanceFingerprint, verifyStampRotationFingerprint } from './nativeStampProvenance';

const N = pdf.PDFName.of;
async function outputRoot(bytes: Uint8Array, page = 0) {
  const doc = await pdf.PDFDocument.load(bytes);
  const annots = doc.getPage(page).node.lookup(N('Annots'), pdf.PDFArray);
  const roots = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, pdf.PDFDict))
    .filter((entry) => entry.lookupMaybe(N('Subtype'), pdf.PDFName)?.decodeText() === 'Stamp');
  return { doc, roots };
}

async function generated() {
  const doc = await pdf.PDFDocument.create(); doc.addPage([300, 400]); doc.addPage([300, 400]);
  const stamp = { id: 'stamp', type: 'stamp' as const, pageNumber: 1,
    rect: { x: 20, y: 40, width: 100, height: 32 },
    data: { text: 'APPROVED', borderColor: '#3366cc' }, createdAt: 1, updatedAt: 1 };
  return (await writeNativePdfAnnotations(await doc.save(), [stamp])).bytes;
}

describe('stamp provenance lifecycle', () => {
  it('reseals generated stamps after move, rotate, restore, copy and another edit', async () => {
    let bytes = await generated();
    let stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');
    stamp = { ...stamp, rect: { ...stamp.rect, x: stamp.rect.x + 13, y: stamp.rect.y + 7 } };
    bytes = (await writeNativePdfAnnotations(bytes, [stamp])).bytes;
    stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');
    stamp = { ...stamp, data: { ...stamp.data, rotation: 90 } };
    bytes = (await writeNativePdfAnnotations(bytes, [stamp])).bytes;
    stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');
    stamp = { ...stamp, data: { ...stamp.data, rotation: 0 } };
    bytes = (await writeNativePdfAnnotations(bytes, [stamp])).bytes;
    stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');

    useSessionStore.getState().clearDocument();
    useAnnotationStore.getState().setAnnotations([stamp]);
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const current = useAnnotationStore.getState().annotations;
    bytes = (await writeNativePdfAnnotations(bytes, current)).bytes;
    const saved = (await readNativePdfAnnotations(bytes)).annotations;
    expect(saved).toHaveLength(2);
    expect(saved.map((item) => item.data.nativeStampAppearanceKind)).toEqual(['generated', 'generated']);
    const copy = saved.find((item) => item.pageNumber === 2)!;
    const edited = { ...copy, data: { ...copy.data, text: 'REVIEWED', borderColor: '#cc3333' } };
    bytes = (await writeNativePdfAnnotations(bytes, saved.map((item) => item.id === copy.id ? edited : item))).bytes;
    const { doc, roots } = await outputRoot(bytes, 1);
    expect(await verifyStampAppearanceFingerprint(doc, roots[0], pdf)).toBe(true);
    expect((await readNativePdfAnnotations(bytes)).annotations.find((item) => item.pageNumber === 2)?.data.text).toBe('REVIEWED');
  });

  it('never reseals externally altered artwork through forged flags, move or copy', async () => {
    const original = await generated();
    const doc = await pdf.PDFDocument.load(original);
    const stamp = doc.getPage(0).node.lookup(N('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    const art = doc.context.register(doc.context.flateStream('q 0 1 1 rg 0 0 100 32 re f Q\n', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 32], Resources: {},
    }));
    stamp.set(N('AP'), doc.context.obj({ N: art }));
    let bytes = await doc.save();
    let imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    imported = { ...imported, rect: { ...imported.rect, x: imported.rect.x + 5 },
      data: { ...imported.data, nativeStampAppearanceKind: 'generated' } };
    bytes = (await writeNativePdfAnnotations(bytes, [imported])).bytes;
    let first = await outputRoot(bytes);
    expect(first.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(await verifyStampAppearanceFingerprint(first.doc, first.roots[0], pdf)).toBe(false);
    imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([imported]);
    useAnnotationStore.getState().setSelection([imported.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    bytes = (await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes;
    first = await outputRoot(bytes);
    const second = await outputRoot(bytes, 1);
    expect(first.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(second.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(await verifyStampAppearanceFingerprint(second.doc, second.roots[0], pdf)).toBe(false);
    expect((await readNativePdfAnnotations(bytes)).annotations.map((item) => item.data.nativeStampAppearanceKind)).toEqual(['imported', 'imported']);
  });

  it('does not promote externally altered artwork when the user rotates it', async () => {
    const original = await generated(); const doc = await pdf.PDFDocument.load(original);
    const root = doc.getPage(0).node.lookup(N('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    const changed = doc.context.register(doc.context.flateStream('q 0 1 1 rg 0 0 100 32 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 32], Resources: {},
    }));
    root.set(N('AP'), doc.context.obj({ N: changed }));
    let bytes = await doc.save(); let imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    bytes = (await writeNativePdfAnnotations(bytes, [{ ...imported, data: { ...imported.data, rotation: 90 } }])).bytes;
    const result = await outputRoot(bytes);
    expect(result.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(await verifyStampAppearanceFingerprint(result.doc, result.roots[0], pdf)).toBe(false);
    expect(await verifyStampRotationFingerprint(result.doc, result.roots[0], pdf)).toBe(true);
    imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    await expect(writeNativePdfAnnotations(bytes, [{ ...imported, data: { ...imported.data,
      nativeStampAppearanceKind: 'generated', borderColor: '#ff0000' } }]))
      .rejects.toThrow('Cannot safely replace an imported custom stamp appearance');
  });

  it('retains verified editability while rotated and copied', async () => {
    let bytes = await generated();
    let stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    stamp = { ...stamp, data: { ...stamp.data, rotation: 90 } };
    bytes = (await writeNativePdfAnnotations(bytes, [stamp])).bytes;
    stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');
    stamp = { ...stamp, data: { ...stamp.data, text: 'CHECKED', borderColor: '#ff0000' } };
    bytes = (await writeNativePdfAnnotations(bytes, [stamp])).bytes;
    stamp = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(stamp.data.nativeStampAppearanceKind).toBe('generated');
    expect(stamp.data.rotation).toBe(90);
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([stamp]);
    useAnnotationStore.getState().setSelection([stamp.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    bytes = (await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes;
    const reopened = (await readNativePdfAnnotations(bytes)).annotations;
    expect(reopened.map((item) => item.data.nativeStampAppearanceKind)).toEqual(['generated', 'generated']);
    expect(reopened.map((item) => item.data.rotation)).toEqual([90, 90]);
    const second = await outputRoot(bytes, 1);
    expect(await verifyStampAppearanceFingerprint(second.doc, second.roots[0], pdf)).toBe(true);
  });

  it('preserves an unverified rotated stamp on no-op and move, but rejects unsafe base use', async () => {
    let bytes = await generated();
    let item = (await readNativePdfAnnotations(bytes)).annotations[0];
    bytes = (await writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, rotation: 90 } }])).bytes;
    const external = await pdf.PDFDocument.load(bytes);
    const root = external.getPage(0).node.lookup(N('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    const changedBase = external.context.register(external.context.flateStream('q 0 1 1 rg 0 0 100 32 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 32], Resources: {},
    }));
    root.lookup(N('PDFHubBaseAP'), pdf.PDFDict).set(N('N'), changedBase);
    bytes = await external.save();
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeStampAppearanceKind).toBe('imported');
    expect(item.data.nativeStampRotationReadOnly).toBe(true);
    const before = await outputRoot(bytes);
    const streamBytes = (dict: pdf.PDFDict, key: string) => Array.from(
      dict.lookup(N(key), pdf.PDFDict).lookup(N('N'), pdf.PDFStream).getContents(),
    );
    const beforeCurrent = streamBytes(before.roots[0], 'AP');
    const beforeBase = streamBytes(before.roots[0], 'PDFHubBaseAP');
    bytes = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    let after = await outputRoot(bytes);
    expect(streamBytes(after.roots[0], 'AP')).toEqual(beforeCurrent);
    expect(streamBytes(after.roots[0], 'PDFHubBaseAP')).toEqual(beforeBase);
    expect(after.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    item = { ...item, rect: { ...item.rect, x: item.rect.x + 6 } };
    bytes = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    after = await outputRoot(bytes);
    expect(streamBytes(after.roots[0], 'AP')).toEqual(beforeCurrent);
    expect(streamBytes(after.roots[0], 'PDFHubBaseAP')).toEqual(beforeBase);
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, rotation: 0 } }]))
      .rejects.toThrow('saved base appearance is not verified');
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([item]);
    useAnnotationStore.getState().setSelection([item.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    await expect(writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations))
      .rejects.toThrow('saved base appearance is not verified');
  });

  it('rotates and copies imported artwork with separate wrapper provenance, then restores it', async () => {
    const doc = await pdf.PDFDocument.create(); const page = doc.addPage([300, 400]); doc.addPage([300, 400]);
    const form = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 80 30 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
    }));
    const original = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp',
      NM: pdf.PDFString.of('imported-art'), Rect: [20, 40, 100, 70], P: page.ref, AP: { N: form } }));
    page.node.set(N('Annots'), doc.context.obj([original]));
    let bytes = await doc.save();
    let item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeStampAppearanceKind).toBe('imported');
    bytes = (await writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, rotation: 90 } }])).bytes;
    let first = await outputRoot(bytes);
    expect(first.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(first.roots[0].get(N(STAMP_ROTATION_FINGERPRINT_KEY))).toBeDefined();
    expect(await verifyStampAppearanceFingerprint(first.doc, first.roots[0], pdf)).toBe(false);
    expect(await verifyStampRotationFingerprint(first.doc, first.roots[0], pdf)).toBe(true);
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeStampAppearanceKind).toBe('imported');
    expect(Boolean(item.data.nativeStampRotationReadOnly)).toBe(false);
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([item]);
    useAnnotationStore.getState().setSelection([item.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    bytes = (await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes;
    first = await outputRoot(bytes); const second = await outputRoot(bytes, 1);
    expect(await verifyStampRotationFingerprint(first.doc, first.roots[0], pdf)).toBe(true);
    expect(await verifyStampRotationFingerprint(second.doc, second.roots[0], pdf)).toBe(true);
    expect(second.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    const reopened = (await readNativePdfAnnotations(bytes)).annotations;
    expect(reopened.map((value) => value.data.nativeStampAppearanceKind)).toEqual(['imported', 'imported']);
    const restored = { ...reopened[0], data: { ...reopened[0].data, rotation: 0 } };
    bytes = (await writeNativePdfAnnotations(bytes, reopened.map((value) => value.id === restored.id ? restored : value))).bytes;
    first = await outputRoot(bytes);
    expect(first.roots[0].get(N('PDFHubBaseAP'))).toBeUndefined();
    expect(first.roots[0].get(N(STAMP_ROTATION_FINGERPRINT_KEY))).toBeUndefined();
    expect((await readNativePdfAnnotations(bytes)).annotations[0].data.nativeStampAppearanceKind).toBe('imported');
  });

  it('does not trust a changed current wrapper even when the saved base remains', async () => {
    const doc = await pdf.PDFDocument.create(); const page = doc.addPage([300, 400]); doc.addPage([300, 400]);
    const form = doc.context.register(doc.context.flateStream('q 0 1 0 rg 0 0 80 30 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
    }));
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', NM: pdf.PDFString.of('external'),
      Rect: [20, 40, 100, 70], P: page.ref, AP: { N: form } }));
    page.node.set(N('Annots'), doc.context.obj([root]));
    let bytes = await doc.save(); let item = (await readNativePdfAnnotations(bytes)).annotations[0];
    bytes = (await writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, rotation: 90 } }])).bytes;
    const external = await pdf.PDFDocument.load(bytes);
    const rotated = external.getPage(0).node.lookup(N('Annots'), pdf.PDFArray).lookup(0, pdf.PDFDict);
    const changed = external.context.register(external.context.flateStream('q 0 0 1 rg 0 0 30 80 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 30, 80], Resources: {},
    }));
    rotated.lookup(N('AP'), pdf.PDFDict).set(N('N'), changed);
    bytes = await external.save();
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeStampAppearanceKind).toBe('imported');
    expect(item.data.nativeStampRotationReadOnly).toBe(true);
    bytes = (await writeNativePdfAnnotations(bytes, [item])).bytes;
    const unchanged = await outputRoot(bytes);
    const preserved = unchanged.roots[0].lookup(N('AP'), pdf.PDFDict).lookup(N('N'), pdf.PDFStream) as pdf.PDFRawStream;
    expect(new TextDecoder().decode(pdf.decodePDFRawStream(preserved).decode())).toBe('q 0 0 1 rg 0 0 30 80 re f Q');
    expect(unchanged.roots[0].get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    expect(unchanged.roots[0].get(N(STAMP_ROTATION_FINGERPRINT_KEY))).toBeUndefined();
    expect((await readNativePdfAnnotations(bytes)).annotations[0].data.nativeStampRotationReadOnly).toBe(true);
    item = (await readNativePdfAnnotations(bytes)).annotations[0];
    await expect(writeNativePdfAnnotations(bytes, [{ ...item, data: { ...item.data, rotation: 0 } }]))
      .rejects.toThrow('saved base appearance is not verified');
  });

  it('preserves a no-AP legacy stamp and its comment through no-op, move and copy, and rejects rotation', async () => {
    const doc = await pdf.PDFDocument.create(); const firstPage = doc.addPage([300, 400]); doc.addPage([300, 400]);
    const stamp = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', Name: 'Approved',
      NM: pdf.PDFString.of('legacy'), Rect: [20, 40, 120, 72], P: firstPage.ref }));
    const reply = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: pdf.PDFString.of('reply'),
      Contents: pdf.PDFString.of('Existing comment'), Rect: [20, 40, 40, 60], IRT: stamp, RT: 'R', P: firstPage.ref }));
    firstPage.node.set(N('Annots'), doc.context.obj([stamp, reply]));
    let bytes = await doc.save();
    let imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    expect(isImportedStampArtworkReadOnly(imported)).toBe(true);
    expect(imported.data.review?.replies.map((item) => item.content)).toContain('Existing comment');
    bytes = (await writeNativePdfAnnotations(bytes, [imported])).bytes;
    let first = await outputRoot(bytes);
    expect(first.roots[0].get(N('AP'))).toBeUndefined();
    expect(first.roots[0].lookup(N('Name'), pdf.PDFName).decodeText()).toBe('Approved');
    imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.review?.replies.map((item) => item.content)).toContain('Existing comment');
    await expect(writeNativePdfAnnotations(bytes, [{ ...imported, data: { ...imported.data, rotation: 90 } }]))
      .rejects.toThrow('without a native appearance');
    imported = { ...imported, rect: { ...imported.rect, x: imported.rect.x + 10 } };
    bytes = (await writeNativePdfAnnotations(bytes, [imported])).bytes;
    imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([imported]);
    useAnnotationStore.getState().setSelection([imported.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    useAnnotationStore.getState().addReviewReply(imported.id, 'Added comment', 'Reviewer');
    expect(useAnnotationStore.getState().annotations.find((item) => item.id === imported.id)?.data.review?.replies.map((item) => item.content)).toContain('Added comment');
    bytes = (await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes;
    first = await outputRoot(bytes);
    const second = await outputRoot(bytes, 1);
    expect(first.roots[0].get(N('AP'))).toBeUndefined();
    expect(second.roots[0].get(N('AP'))).toBeUndefined();
    const reopened = (await readNativePdfAnnotations(bytes)).annotations;
    expect(reopened).toHaveLength(2);
    for (const root of reopened) expect(root.data.review?.replies.map((item) => item.content)).toContain('Existing comment');
    expect(reopened.find((root) => root.pageNumber === 1)?.data.review?.replies.map((item) => item.content)).toContain('Added comment');
  });

  it('preserves an unsupported native appearance-state dictionary through no-op and copy', async () => {
    const doc = await pdf.PDFDocument.create(); const page = doc.addPage([300, 400]); doc.addPage([300, 400]);
    const form = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 100 32 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 32], Resources: {},
    }));
    const stamp = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', Name: 'Approved',
      NM: pdf.PDFString.of('states'), Rect: [20, 40, 120, 72], P: page.ref,
      AS: 'On', AP: { N: { On: form } } }));
    const reply = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: pdf.PDFString.of('state-reply'),
      Contents: pdf.PDFString.of('State comment'), Rect: [20, 40, 40, 60], IRT: stamp, RT: 'R', P: page.ref }));
    page.node.set(N('Annots'), doc.context.obj([stamp, reply]));
    let bytes = await doc.save();
    let imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    bytes = (await writeNativePdfAnnotations(bytes, [imported])).bytes;
    let first = await outputRoot(bytes);
    expect(first.roots[0].lookup(N('AP'), pdf.PDFDict).lookup(N('N'), pdf.PDFDict).get(N('On'))).toBeDefined();
    imported = (await readNativePdfAnnotations(bytes)).annotations[0];
    await expect(writeNativePdfAnnotations(bytes, [{ ...imported, data: { ...imported.data, rotation: 90 } }]))
      .rejects.toThrow('unsupported appearance states');
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([imported]);
    useAnnotationStore.getState().setSelection([imported.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    bytes = (await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes;
    first = await outputRoot(bytes); const second = await outputRoot(bytes, 1);
    for (const entry of [first.roots[0], second.roots[0]]) {
      expect(entry.lookup(N('AP'), pdf.PDFDict).lookup(N('N'), pdf.PDFDict).get(N('On'))).toBeDefined();
      expect(entry.get(N(STAMP_AP_FINGERPRINT_KEY))).toBeUndefined();
    }
    for (const root of (await readNativePdfAnnotations(bytes)).annotations) {
      expect(root.data.review?.replies.map((item) => item.content)).toContain('State comment');
    }
  });
});
