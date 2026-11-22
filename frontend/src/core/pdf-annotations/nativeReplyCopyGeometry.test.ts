import { describe, expect, it } from 'vitest';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, PDFString } from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const rootRect = [20, 300, 100, 330];
const replyRect = [110, 310, 128, 328];
const popupRect = [140, 250, 220, 310];

async function fixture(replyState = false, rootState: 'dictionary' | 'transition' | undefined = undefined) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([300, 400]);
  const target = doc.addPage([300, 400]);
  target.setCropBox(10, 20, 280, 360);
  target.setRotation(degrees(90));
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 18 18 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 18, 18], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', Rect: rootRect, NM: PDFString.of('root'),
    P: source.ref, AP: { N: appearance },
  }));
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: popupRect, P: source.ref });
  const popupRef = doc.context.register(popup);
  const reply = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: replyRect, NM: PDFString.of('reply'),
    Contents: PDFString.of('example'), P: source.ref, IRT: root, RT: 'R',
    Popup: popupRef, AP: { N: appearance },
  }));
  popup.set(PDFName.of('Parent'), reply);
  const refs = [root, reply, popupRef];
  if (rootState === 'dictionary') {
    const rootDict = doc.context.lookup(root, PDFDict);
    rootDict.set(PDFName.of('StateModel'), PDFString.of('Review'));
    rootDict.set(PDFName.of('State'), PDFString.of('Accepted'));
  }
  if (rootState === 'transition') {
    refs.push(doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [30, 300, 48, 318], P: source.ref,
      NM: PDFString.of('root-state'), IRT: root, StateModel: PDFString.of('Review'), State: PDFString.of('Accepted'),
    })));
  }
  if (replyState) {
    refs.push(doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [130, 310, 148, 328], P: source.ref,
      NM: PDFString.of('reply-state'), IRT: reply, StateModel: PDFString.of('Review'), State: PDFString.of('Accepted'),
    })));
  }
  source.node.set(PDFName.of('Annots'), doc.context.obj(refs));
  return doc.save();
}

function readReply(doc: PDFDocument, pageNumber: number) {
  const annots = doc.getPage(pageNumber - 1).node.lookup(PDFName.of('Annots'), PDFArray);
  for (let i = 0; i < annots.size(); i += 1) {
    const dict = annots.lookup(i, PDFDict);
    if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Text') continue;
    if (dict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString)?.decodeText() !== 'example') continue;
    return { dict, ref: annots.get(i) as PDFRef };
  }
  throw new Error('Missing reply');
}

function rect(dict: PDFDict) {
  return dict.lookup(PDFName.of('Rect'), PDFArray).asArray().map((value) => Number(value.toString()));
}

function expectPopupAndAppearance(reply: { dict: PDFDict; ref: PDFRef }, expectedPopupRect: number[]) {
  const popup = reply.dict.lookup(PDFName.of('Popup'), PDFDict);
  expect(popup.get(PDFName.of('Parent'))?.toString()).toBe(reply.ref.toString());
  expect(rect(popup)).toEqual(expectedPopupRect);
  const appearance = reply.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  expect(appearance.getContents().length).toBeGreaterThan(0);
}

describe('imported reply geometry and native parent appearance', () => {
  it('keeps a reply rectangle and popup unchanged on a no-op save', async () => {
    const bytes = await fixture();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    const saved = await writeNativePdfAnnotations(bytes, annotations);
    const reply = readReply(await PDFDocument.load(saved.bytes), 1);
    expect(rect(reply.dict)).toEqual(replyRect);
    expectPopupAndAppearance(reply, popupRect);
  });

  it('does not create a review-state annotation for a thread with no source state on a no-op save', async () => {
    const bytes = await fixture();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    const saved = await writeNativePdfAnnotations(bytes, annotations);
    const doc = await PDFDocument.load(saved.bytes);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const stateAnnotations = annots.asArray().filter((_, index) =>
      Boolean(annots.lookup(index, PDFDict).get(PDFName.of('StateModel'))));
    expect(stateAnnotations).toHaveLength(0);
    expect(annots.size()).toBe(3);
  });

  it('writes a review-state transition when an imported default-open thread is resolved', async () => {
    const bytes = await fixture();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    const root = annotations[0];
    const updated = { ...root, data: { ...root.data, review: { ...root.data.review!, status: 'resolved' as const } } };
    const saved = await writeNativePdfAnnotations(bytes, [updated]);
    const doc = await PDFDocument.load(saved.bytes);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const stateAnnotations = annots.asArray().map((_, index) => annots.lookup(index, PDFDict))
      .filter((dict) => Boolean(dict.get(PDFName.of('StateModel'))));
    expect(stateAnnotations).toHaveLength(1);
    const state = stateAnnotations[0].lookup(PDFName.of('State'), PDFString, PDFHexString);
    expect(['Accepted', 'Completed']).toContain(state.decodeText());
    expect((await readNativePdfAnnotations(saved.bytes)).annotations[0].data.review?.status).toBe('resolved');
  });

  it('does not promote a reply-level review state to its root', async () => {
    const bytes = await fixture(true);
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    expect(annotations[0].data.review?.status).toBe('open');
    const saved = await writeNativePdfAnnotations(bytes, annotations);
    const doc = await PDFDocument.load(saved.bytes);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const states = annots.asArray().map((_, index) => annots.lookup(index, PDFDict))
      .filter((dict) => Boolean(dict.get(PDFName.of('StateModel'))));
    expect(states).toHaveLength(1);
    expect(states[0].get(PDFName.of('IRT'))?.toString()).toBe(readReply(doc, 1).ref.toString());
    expect((await readNativePdfAnnotations(saved.bytes)).annotations[0].data.review?.status).toBe('open');
  });

  it('preserves source root dictionary state on no-op and clears it on an explicit status change', async () => {
    const bytes = await fixture(false, 'dictionary');
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    expect(annotations[0].data.review?.status).toBe('resolved');
    const unchanged = await writeNativePdfAnnotations(bytes, annotations);
    const noOp = await PDFDocument.load(unchanged.bytes);
    const annots = noOp.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const root = annots.asArray().map((_, i) => annots.lookup(i, PDFDict))
      .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
    expect(root.lookup(PDFName.of('State'), PDFString).decodeText()).toBe('Accepted');
    expect(annots.size()).toBe(3);
    const source = annotations[0];
    const changed = { ...source, data: { ...source.data, review: { ...source.data.review!, status: 'rejected' as const } } };
    const saved = await writeNativePdfAnnotations(bytes, [changed]);
    expect((await readNativePdfAnnotations(saved.bytes)).annotations[0].data.review?.status).toBe('rejected');
  });

  it('preserves an existing private review-status fallback without inventing a native transition', async () => {
    const initial = await PDFDocument.load(await fixture());
    const annots = initial.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    annots.lookup(0, PDFDict).set(PDFName.of('PDFHubReviewStatus'), PDFString.of('resolved'));
    const bytes = await initial.save();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    expect(annotations[0].data.review?.status).toBe('resolved');
    const saved = await writeNativePdfAnnotations(bytes, annotations);
    const output = await PDFDocument.load(saved.bytes);
    const result = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(result.size()).toBe(3);
    const root = result.asArray().map((_, i) => result.lookup(i, PDFDict))
      .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
    expect(root.lookup(PDFName.of('PDFHubReviewStatus'), PDFString).decodeText()).toBe('resolved');
    expect((await readNativePdfAnnotations(saved.bytes)).annotations[0].data.review?.status).toBe('resolved');
  });

  it('preserves source review status when copying a thread whose status lives in a state annotation', async () => {
    const bytes = await fixture(false, 'transition');
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    expect(annotations[0].data.review?.status).toBe('resolved');
    useAnnotationStore.getState().setAnnotations(annotations);
    useAnnotationStore.getState().setSelection([annotations[0].id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const imported = (await readNativePdfAnnotations(saved.bytes)).annotations;
    expect(imported.find((annotation) => annotation.pageNumber === 1)?.data.review?.status).toBe('resolved');
    expect(imported.find((annotation) => annotation.pageNumber === 2)?.data.review?.status).toBe('resolved');
  });

  it('translates the original reply rectangle when its root moves', async () => {
    const bytes = await fixture();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    const root = annotations[0];
    const moved = { ...root, rect: { ...root.rect, x: root.rect.x + 18, y: root.rect.y + 18 } };
    const saved = await writeNativePdfAnnotations(bytes, [moved]);
    const reply = readReply(await PDFDocument.load(saved.bytes), 1);
    expect(rect(reply.dict)).toEqual([128, 292, 146, 310]);
    expectPopupAndAppearance(reply, popupRect);
  });

  it('maps reply and popup together when copied to a differently cropped and rotated page', async () => {
    const bytes = await fixture();
    const annotations = (await readNativePdfAnnotations(bytes)).annotations;
    useAnnotationStore.getState().setAnnotations(annotations);
    useAnnotationStore.getState().setSelection([annotations[0].id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const doc = await PDFDocument.load(saved.bytes);
    const reply = readReply(doc, 2);
    expect(rect(reply.dict)).toEqual([100, 148, 118, 166]);
    expectPopupAndAppearance(reply, [118, 178, 178, 258]);
  });
});
