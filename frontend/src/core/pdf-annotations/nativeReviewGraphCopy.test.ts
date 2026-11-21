import { describe, expect, it } from 'vitest';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, PDFString } from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';

async function fixture(noRotate = false, futureAccepted = false) {
  const doc = await PDFDocument.create();
  const source = doc.addPage([300, 400]);
  const destination = doc.addPage([300, 400]);
  destination.setCropBox(10, 20, 280, 360);
  destination.setRotation(degrees(90));
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 18 18 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 18, 18], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', NM: PDFString.of('root'), Rect: [20, 300, 100, 330],
    P: source.ref, AP: { N: ap },
  }));
  const reply = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('reply'), Contents: PDFString.of('first'),
    Rect: [110, 310, 128, 328], P: source.ref, IRT: root, RT: 'R',
  }));
  const nested = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('nested'), Contents: PDFString.of('nested'),
    Rect: [135, 310, 153, 328], P: source.ref, IRT: reply, RT: 'R',
  }));
  const open = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('open'), T: PDFString.of('Alice'),
    M: PDFString.of('D:20260101000000Z'), Rect: [30, 300, 48, 318], P: source.ref,
    IRT: root, StateModel: PDFString.of('Review'), State: PDFString.of('None'), AP: { N: ap },
    F: noRotate ? 16 : 4,
  }));
  const accepted = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('accepted'), T: PDFString.of('Bob'),
    M: PDFString.of(futureAccepted ? 'D:20990201000000Z' : 'D:20260201000000Z'), Rect: [35, 305, 53, 323], P: source.ref,
    IRT: open, StateModel: PDFString.of('Review'), State: PDFString.of('Accepted'), AP: { N: ap },
  }));
  const popupDict = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [140, 250, 220, 310], P: source.ref, AP: { N: ap } });
  const popup = doc.context.register(popupDict);
  const nestedState = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('nested-state'), T: PDFString.of('Carol'),
    M: PDFString.of('D:20260301000000Z'), Rect: [145, 310, 163, 328], P: source.ref,
    IRT: nested, StateModel: PDFString.of('Review'), State: PDFString.of('Rejected'),
    Popup: popup, AP: { N: ap }, C: [0.2, 0.3, 0.4],
  }));
  popupDict.set(PDFName.of('Parent'), nestedState);
  source.node.set(PDFName.of('Annots'), doc.context.obj([root, reply, nested, open, accepted, nestedState, popup]));
  return doc.save();
}

type RecordWithRef = { ref: PDFRef; dict: PDFDict };
function pageRecords(doc: PDFDocument, page: number): RecordWithRef[] {
  const annots = doc.getPage(page - 1).node.lookup(PDFName.of('Annots'), PDFArray);
  return annots.asArray().map((ref, i) => ({ ref: ref as PDFRef, dict: annots.lookup(i, PDFDict) }));
}
function text(dict: PDFDict, key: string) {
  return dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString)?.decodeText();
}
function rect(dict: PDFDict) {
  return dict.lookup(PDFName.of('Rect'), PDFArray).asArray().map((value) => Number(value.toString()));
}
function find(records: RecordWithRef[], key: string, expected: string) {
  const result = records.find(({ dict }) => text(dict, key) === expected);
  if (!result) throw new Error(`Missing ${key}=${expected}`);
  return result;
}
function assertGraph(doc: PDFDocument, page: number) {
  const records = pageRecords(doc, page);
  const states = records.filter(({ dict }) => text(dict, 'StateModel') === 'Review');
  expect(states).toHaveLength(3);
  const root = records.find(({ dict }) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
  const reply = find(records, 'Contents', 'first');
  const nested = find(records, 'Contents', 'nested');
  const open = find(states, 'T', 'Alice');
  const accepted = find(states, 'T', 'Bob');
  const nestedState = find(states, 'T', 'Carol');
  expect(reply.dict.get(PDFName.of('IRT'))?.toString()).toBe(root.ref.toString());
  expect(nested.dict.get(PDFName.of('IRT'))?.toString()).toBe(reply.ref.toString());
  expect(open.dict.get(PDFName.of('IRT'))?.toString()).toBe(root.ref.toString());
  expect(accepted.dict.get(PDFName.of('IRT'))?.toString()).toBe(open.ref.toString());
  expect(nestedState.dict.get(PDFName.of('IRT'))?.toString()).toBe(nested.ref.toString());
  expect(states.map(({ dict }) => text(dict, 'State'))).toEqual(['None', 'Accepted', 'Rejected']);
  expect(states.map(({ dict }) => text(dict, 'M'))).toEqual([
    'D:20260101000000Z', 'D:20260201000000Z', 'D:20260301000000Z',
  ]);
  const popup = nestedState.dict.lookup(PDFName.of('Popup'), PDFDict);
  expect(popup.get(PDFName.of('Parent'))?.toString()).toBe(nestedState.ref.toString());
  expect(popup.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents().length).toBeGreaterThan(0);
  for (const { dict } of states) {
    expect(dict.get(PDFName.of('P'))?.toString()).toBe(doc.getPage(page - 1).ref.toString());
    expect(dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents().length).toBeGreaterThan(0);
  }
  return { states, popup, open, accepted, nestedState };
}

async function copy(bytes: Uint8Array) {
  const input = (await readNativePdfAnnotations(bytes)).annotations;
  useAnnotationStore.getState().setAnnotations(input);
  useAnnotationStore.getState().setSelection([input[0].id]);
  useAnnotationStore.getState().copySelection();
  useAnnotationStore.getState().pasteClipboard(2);
  return useAnnotationStore.getState().annotations;
}

describe('cross-page native review-state graph copy', () => {
  it('copies all state history, identities, geometry, appearance and popup without changing the source graph', async () => {
    const bytes = await fixture();
    const saved = await writeNativePdfAnnotations(bytes, await copy(bytes));
    const doc = await PDFDocument.load(saved.bytes);
    const source = assertGraph(doc, 1);
    const target = assertGraph(doc, 2);
    expect(source.states.map(({ dict }) => text(dict, 'NM'))).toEqual(['open', 'accepted', 'nested-state']);
    const targetNames = target.states.map(({ dict }) => text(dict, 'NM'));
    expect(new Set(targetNames).size).toBe(3);
    expect(targetNames.every((name) => name && !['open', 'accepted', 'nested-state'].includes(name))).toBe(true);
    expect(rect(source.open.dict)).toEqual([30, 300, 48, 318]);
    expect(rect(target.open.dict)).toEqual([110, 68, 128, 86]);
    expect(rect(target.accepted.dict)).toEqual([105, 73, 123, 91]);
    expect(rect(target.nestedState.dict)).toEqual([100, 183, 118, 201]);
    expect(rect(target.popup)).toEqual([118, 178, 178, 258]);
    const loaded = (await readNativePdfAnnotations(saved.bytes)).annotations;
    expect(loaded.map((annotation) => annotation.data.review?.status)).toEqual(['resolved', 'resolved']);
    const savedAgain = await writeNativePdfAnnotations(saved.bytes, loaded);
    const reopened = await PDFDocument.load(savedAgain.bytes);
    assertGraph(reopened, 1);
    assertGraph(reopened, 2);
  });

  it('rejects an unsafe NoRotate state when copying between differently rotated pages', async () => {
    const bytes = await fixture(true);
    const error = await writeNativePdfAnnotations(bytes, await copy(bytes)).then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/NoRotate|safely/i);
  });

  it('keeps the copied graph intact when the source page is removed after materialization', async () => {
    const bytes = await fixture();
    const prepared = await materializeCopiedAnnotations(bytes, await copy(bytes));
    const doc = await PDFDocument.load(prepared.bytes);
    doc.removePage(0);
    const afterRemoval = await PDFDocument.load(await doc.save());
    assertGraph(afterRemoval, 1);
    const reread = await readNativePdfAnnotations(await afterRemoval.save());
    expect(reread.annotations).toHaveLength(1);
    expect(reread.annotations[0].data.review?.status).toBe('resolved');
    expect(reread.annotations[0].data.review?.replies.map((reply) => reply.content)).toEqual(['first', 'nested']);
  });

  it('retains history and honors a new explicit transition despite a future-dated prior state', async () => {
    const bytes = await fixture(false, true);
    const input = (await readNativePdfAnnotations(bytes)).annotations;
    expect(input[0].data.review?.status).toBe('resolved');
    const root = input[0];
    const updated = { ...root, data: { ...root.data, review: {
      ...root.data.review!, status: 'rejected' as const, statusAuthor: 'Bob', updatedAt: Date.UTC(2026, 10, 19, 6, 0, 0),
    } } };
    const saved = await writeNativePdfAnnotations(bytes, [updated]);
    const output = await PDFDocument.load(saved.bytes);
    const records = pageRecords(output, 1);
    const oldState = find(records, 'T', 'Bob');
    expect(text(oldState.dict, 'M')).toBe('D:20990201000000Z');
    const states = records.filter(({ dict }) => text(dict, 'StateModel') === 'Review');
    expect(states).toHaveLength(4);
    const newest = states.find(({ dict }) => text(dict, 'State') === 'Rejected'
      && text(dict, 'T') === 'Bob')!;
    expect(newest).toBeDefined();
    expect(newest.dict.get(PDFName.of('IRT'))?.toString()).toBe(oldState.ref.toString());
    expect(text(newest.dict, 'M')).toBe('D:20261119060000Z');
    const reread = (await readNativePdfAnnotations(saved.bytes)).annotations;
    expect(reread[0].data.review?.status).toBe('rejected');
    const savedAgain = await writeNativePdfAnnotations(saved.bytes, reread);
    const afterAgain = await PDFDocument.load(savedAgain.bytes);
    expect(pageRecords(afterAgain, 1).filter(({ dict }) => text(dict, 'StateModel') === 'Review')).toHaveLength(4);
    expect((await readNativePdfAnnotations(savedAgain.bytes)).annotations[0].data.review?.status).toBe('rejected');
  });

  it('fails safely if a different author cannot supersede a future state without inventing history', async () => {
    const bytes = await fixture(false, true);
    const input = (await readNativePdfAnnotations(bytes)).annotations;
    const root = input[0];
    const updated = { ...root, data: { ...root.data, review: {
      ...root.data.review!, status: 'rejected' as const, statusAuthor: 'Dana', updatedAt: Date.UTC(2026, 10, 19, 6, 0, 0),
    } } };
    const error = await writeNativePdfAnnotations(bytes, [updated]).then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/state|time|author|safely/i);
    expect((await readNativePdfAnnotations(bytes)).annotations[0].data.review?.status).toBe('resolved');
  });


  it('fails safely when a future ancestor defers an old-clock child beyond a new different-author state', async () => {
    const original = await PDFDocument.load(await fixture(false, true));
    const page = original.getPage(0);
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    const parent = annots.asArray().map((ref, i) => ({ ref, dict: annots.lookup(i, PDFDict) }))
      .find(({ dict }) => text(dict, 'NM') === 'accepted')!;
    annots.push(original.context.register(original.context.obj({
      Type: 'Annot', Subtype: 'Text', NM: PDFString.of('old-clock-child'), T: PDFString.of('Bob'),
      M: PDFString.of('D:20250101000000Z'), Rect: [30, 300, 48, 318], P: page.ref,
      IRT: parent.ref, StateModel: PDFString.of('Review'), State: PDFString.of('Rejected'),
    })));
    const bytes = await original.save();
    const input = (await readNativePdfAnnotations(bytes)).annotations;
    expect(input[0].data.review?.status).toBe('rejected');
    const root = input[0];
    const updated = { ...root, data: { ...root.data, review: {
      ...root.data.review!, status: 'resolved' as const, statusAuthor: 'Current User', updatedAt: Date.UTC(2026, 10, 19, 6, 0, 0),
    } } };
    const error = await writeNativePdfAnnotations(bytes, [updated]).then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/state|time|author|safely/i);
    expect((await readNativePdfAnnotations(bytes)).annotations[0].data.review?.status).toBe('rejected');
  });
});
