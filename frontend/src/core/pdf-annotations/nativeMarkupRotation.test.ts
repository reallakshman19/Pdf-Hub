import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream, degrees } from 'pdf-lib';
import type { PdfAnnotation } from '../annotations/types';
import { useAnnotationStore } from '../annotations/store';
import { useSessionStore } from '../session/store';
import { initializeMarkupDraft, rotateMarkupQuarterTurn } from '../annotations/geometryTransform';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(rotation = 0, withAppearance = true) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  page.setCropBox(20, 30, 360, 450);
  page.setRotation(degrees(rotation));
  const dict = doc.context.obj({ Type: 'Annot', Subtype: 'Underline', NM: PDFString.of('synthetic'),
    Rect: [30, 400, 230, 450], QuadPoints: [30, 450, 190, 450, 30, 440, 190, 440], C: [0, 0, 0] });
  if (withAppearance) {
    const form = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 40 10 re f Q',
      { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: {} }));
    dict.set(PDFName.of('AP'), doc.context.obj({ N: form }));
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(dict)]));
  return doc.save();
}

function turned(item: PdfAnnotation): PdfAnnotation {
  const { x, y, width, height } = item.rect;
  const cx = x + width / 2; const cy = y + height / 2;
  const rect = { x: cx - height / 2, y: cy - width / 2, width: height, height: width };
  const source = item.data.textMarkupQuads!;
  const q: number[] = [];
  for (let i = 0; i < source.length; i += 2) {
    const px = x + source[i] * width; const py = y + source[i + 1] * height;
    q.push((cx - (py - cy) - rect.x) / rect.width, (cy + (px - cx) - rect.y) / rect.height);
  }
  return { ...item, rect, data: { ...item.data, textMarkupQuads: q,
    nativeMarkupTurn: { turns: 1, sourceHash: item.data.nativeMarkupRotationSourceHash! } } };
}

async function first(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}

function setTestPages(from: number, to: number) {
  useSessionStore.setState({ documentKey: 'synthetic-markup', pageGraph: { pages: [from, to].map((rotation, index) => ({
    pageId: `synthetic-${index}`, documentKey: 'synthetic-markup', originalPageNumber: index + 1,
    currentIndex: index, width: 400, height: 500, rotation: rotation as 0 | 90 | 180 | 270,
  })) } });
}

describe('source-bound native markup rotation', () => {
  it.each([0, 90, 180, 270])('creates, turns and reopens a new underline on a %s-degree page', async (rotation) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setCropBox(20, 30, 360, 450); page.setRotation(degrees(rotation));
    const bytes = await doc.save();
    const draft = initializeMarkupDraft({ id: 'new-synthetic', type: 'underline', pageNumber: 1,
      rect: { x: 60, y: 90, width: 120, height: 20 }, data: { borderColor: '#123456' }, createdAt: 1, updatedAt: 1 }, rotation);
    const patch = rotateMarkupQuarterTurn(draft);
    expect(patch).not.toBeNull();
    const saved = await writeNativePdfAnnotations(bytes, [{ ...draft, ...patch }]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.data.nativeMarkupDraft).toBeUndefined();
    expect(reopened.data.nativeMarkupRotationSourceHash).toBeDefined();
    expect(reopened.data.nativeMarkupPreviewOffset).toBe(((1 - rotation / 90) % 4 + 4) % 4);
    expect(rotateMarkupQuarterTurn(reopened)).not.toBeNull();
  });

  it('rejects a forged draft marker when a native source already exists', async () => {
    const bytes = await fixture();
    const source = (await readNativePdfAnnotations(bytes)).annotations[0];
    const forged = { ...source, data: { ...source.data, nativeMarkupRotationSourceHash: undefined,
      nativeMarkupDraft: { basisRotation: 0, turns: 1 } } };
    await expect(writeNativePdfAnnotations(bytes, [forged])).rejects.toThrow(/safely/i);
  });

  it.each([null, false, 0, 'invalid', {}])('refuses to save malformed markup draft state %s', async (value) => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    const draft = initializeMarkupDraft({ id: 'new-synthetic', type: 'underline', pageNumber: 1,
      rect: { x: 60, y: 90, width: 120, height: 20 }, data: {}, createdAt: 1, updatedAt: 1 }, 0);
    draft.data.nativeMarkupDraft = value as unknown as NonNullable<PdfAnnotation['data']['nativeMarkupDraft']>;
    await expect(writeNativePdfAnnotations(await doc.save(), [draft])).rejects.toThrow(/safely/i);
  });

  it.each([0, 90, 180, 270])('turns imported markup on a cropped page at %s degrees, saves and can turn after reopening', async (rotation) => {
    const bytes = await fixture(rotation);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeMarkupRotationSourceHash).toBeDefined();
    const saved = await writeNativePdfAnnotations(bytes, [turned(item)]);
    const after = await first(saved.bytes);
    const form = after.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    expect(form.dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.data.nativeMarkupTurn).toBeUndefined();
    expect(reopened.data.nativeMarkupRotationSourceHash).toBeDefined();
    expect(reopened.data.nativeMarkupPreviewOffset).toBe(1);
    await expect(writeNativePdfAnnotations(saved.bytes, [turned(reopened)])).resolves.toBeDefined();
    if (rotation === 0) {
      const values = (name: string) => after.lookup(PDFName.of(name), PDFArray).asArray().map((v) => Number(v.toString()));
      expect(values('Rect')).toEqual([105, 325, 155, 525]);
      expect(values('QuadPoints')).toEqual([155, 525, 155, 365, 145, 525, 145, 365]);
    }
  });

  it.each(['appearance', 'quads', 'style'] as const)('rejects a turn after external %s changes', async (change) => {
    const bytes = await fixture();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const doc = await PDFDocument.load(bytes);
    const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    if (change === 'quads') root.set(PDFName.of('QuadPoints'), doc.context.obj([40, 450, 190, 450, 40, 440, 190, 440]));
    if (change === 'style') root.set(PDFName.of('C'), doc.context.obj([0, 1, 0]));
    if (change === 'appearance') {
      const form = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
      const replacement = doc.context.register(doc.context.flateStream(decodePDFRawStream(form).decode().map((byte) => byte ^ 1),
        { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: {} }));
      root.set(PDFName.of('AP'), doc.context.obj({ N: replacement }));
    }
    await expect(writeNativePdfAnnotations(await doc.save(), [turned(item)])).rejects.toThrow(/safely/i);
  });

  it('does not grant rotation capability for missing appearances or forged sidecar fields', async () => {
    const bytes = await fixture(0, false);
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.data.nativeMarkupRotationSourceHash).toBeUndefined();
    await expect(writeNativePdfAnnotations(bytes, [turned({ ...item, data: { ...item.data, nativeMarkupRotationSourceHash: 'forged' } })]))
      .rejects.toThrow(/safely/i);
  });

  it.each([8, 16])('does not grant rotation capability for native flags %s', async (flag) => {
    const doc = await PDFDocument.load(await fixture());
    const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    root.set(PDFName.of('F'), doc.context.obj(flag));
    const read = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    expect(read.data.nativeMarkupRotationSourceHash).toBeUndefined();
  });

  it('rotates a source-backed visual mask as a Square without claiming content removal', async () => {
    const doc = await PDFDocument.load(await fixture());
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    dict.set(PDFName.of('Subtype'), PDFName.of('Square'));
    dict.set(PDFName.of('PDFHubType'), PDFString.of('redaction'));
    dict.set(PDFName.of('IC'), doc.context.obj([0, 0, 0]));
    dict.delete(PDFName.of('QuadPoints'));
    const bytes = await doc.save();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    expect(item.type).toBe('redaction');
    const { x, y, width, height } = item.rect;
    const changed = { ...item, rect: { x: x + (width - height) / 2, y: y + (height - width) / 2, width: height, height: width },
      data: { ...item.data, nativeMarkupTurn: { turns: 1, sourceHash: item.data.nativeMarkupRotationSourceHash! } } };
    const result = await writeNativePdfAnnotations(bytes, [changed]);
    const after = await first(result.bytes);
    expect(after.lookup(PDFName.of('Subtype'), PDFName).decodeText()).toBe('Square');
    expect(after.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
  });

  it('keeps an application-generated markup editable after rotation and reopen', async () => {
    const imported = await fixture(0, false);
    const item = (await readNativePdfAnnotations(imported)).annotations[0];
    const doc = await PDFDocument.load(imported);
    doc.getPage(0).node.delete(PDFName.of('Annots'));
    const created = await writeNativePdfAnnotations(await doc.save(), [item]);
    const source = (await readNativePdfAnnotations(created.bytes)).annotations[0];
    const saved = await writeNativePdfAnnotations(created.bytes, [turned(source)]);
    const rotated = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    const recolored = { ...rotated, data: { ...rotated.data, borderColor: '#123456' } };
    const edited = await writeNativePdfAnnotations(saved.bytes, [recolored]);
    const reopened = (await readNativePdfAnnotations(edited.bytes)).annotations[0];
    expect(reopened.data.nativeMarkupPreviewOffset).toBe(1);
    expect(reopened.data.nativeMarkupRotationSourceHash).toBeDefined();
    await expect(writeNativePdfAnnotations(edited.bytes, [turned(reopened)])).resolves.toBeDefined();
  });

  it.each([0, 90, 180, 270].flatMap((from) => [0, 90, 180, 270].map((to) => [from, to])))(
    'preserves rotated preview orientation when copying from %s to %s', async (from, to) => {
    const doc = await PDFDocument.load(await fixture(from));
    doc.addPage([400, 500]).setRotation(degrees(to));
    const source = await doc.save();
    const item = (await readNativePdfAnnotations(source)).annotations[0];
    const saved = await writeNativePdfAnnotations(source, [turned(item)]);
    const rotated = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    setTestPages(from, to);
    useAnnotationStore.getState().setAnnotations([rotated]);
    useAnnotationStore.getState().setSelection([rotated.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const result = await writeNativePdfAnnotations(saved.bytes, useAnnotationStore.getState().annotations);
    const reopened = (await readNativePdfAnnotations(result.bytes)).annotations;
    const copy = reopened.find((entry) => entry.pageNumber === 2)!;
    expect(copy.data.nativeMarkupRotationSourceHash).toBeDefined();
    expect(copy.data.nativeMarkupPreviewOffset).toBe(((1 + (from - to) / 90) % 4 + 4) % 4);
    });

  it.each(['offset', 'fingerprint'] as const)('does not trust a tampered persisted preview %s', async (change) => {
    const bytes = await fixture();
    const item = (await readNativePdfAnnotations(bytes)).annotations[0];
    const saved = await writeNativePdfAnnotations(bytes, [turned(item)]);
    const doc = await PDFDocument.load(saved.bytes);
    const dict = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    if (change === 'offset') dict.set(PDFName.of('PDFHubMarkupPreviewOffset'), doc.context.obj(2));
    else dict.set(PDFName.of('PDFHubMarkupPreviewFingerprint'), PDFString.of('forged'));
    const altered = await doc.save();
    const read = (await readNativePdfAnnotations(altered)).annotations[0];
    expect(read.data.nativeMarkupRotationSourceHash).toBeUndefined();
    expect(read.data.nativeMarkupPreviewOffset).toBeUndefined();
    await expect(writeNativePdfAnnotations(altered, [turned({ ...read, data: { ...read.data, nativeMarkupRotationSourceHash: 'forged' } })]))
      .rejects.toThrow(/safely/i);
  });

  it.each([0, 90, 180, 270].flatMap((from) => [0, 90, 180, 270].map((to) => [from, to])))(
    'copies a pending rotated markup from page %s to %s before the first save', async (from, to) => {
      const doc = await PDFDocument.load(await fixture(from));
      doc.addPage([400, 500]).setRotation(degrees(to));
      const bytes = await doc.save();
      const original = (await readNativePdfAnnotations(bytes)).annotations[0];
      setTestPages(from, to);
      useAnnotationStore.getState().setAnnotations([turned(original)]);
      useAnnotationStore.getState().setSelection([original.id]);
      useAnnotationStore.getState().copySelection();
      useAnnotationStore.getState().pasteClipboard(2);
      const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
      const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations;
      expect(reopened).toHaveLength(2);
      const copy = reopened.find((item) => item.pageNumber === 2)!;
      expect(copy.data.nativeMarkupPreviewOffset).toBe(((1 + (from - to) / 90) % 4 + 4) % 4);
      expect(copy.data.nativeMarkupRotationSourceHash).toBeDefined();
    });
});
