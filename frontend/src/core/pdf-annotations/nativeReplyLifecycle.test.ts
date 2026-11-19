import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(replyAppearance = true) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const icon = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 18 18 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 18, 18], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', NM: PDFString.of('root'), Rect: [30, 30, 80, 60], P: page.ref, AP: { N: icon } }));
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [90, 90, 140, 130], P: page.ref });
  const popupRef = doc.context.register(popup);
  const replyDict = doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: PDFString.of('reply-a'), Rect: [30, 30, 48, 48], P: page.ref, IRT: root, RT: 'R', F: 4, Name: 'Comment', Contents: PDFString.of('First comment'), RC: PDFString.of('<body><p><span style="font-weight:bold">First comment</span></p></body>'), Popup: popupRef });
  if (replyAppearance) replyDict.set(PDFName.of('AP'), doc.context.obj({ N: icon }));
  const reply = doc.context.register(replyDict);
  popup.set(PDFName.of('Parent'), reply);
  const child = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: PDFString.of('reply-b'), Rect: [50, 30, 68, 48], P: page.ref, IRT: reply, RT: 'R', Contents: PDFString.of('Child comment') }));
  const state = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', NM: PDFString.of('reply-state'), Rect: [50, 30, 68, 48], P: page.ref, IRT: reply, StateModel: PDFString.of('Review'), State: PDFString.of('Accepted') }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([root, reply, popupRef, child, state]));
  return doc.save();
}

async function records(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  return Array.from({ length: annots.size() }, (_, i) => ({ raw: annots.get(i), dict: annots.lookup(i, PDFDict) }));
}

describe('native comment lifecycle', () => {
  it('edits a rich comment without AP while retaining its formatting', async () => {
    const input = await fixture(false);
    const annotation = (await readNativePdfAnnotations(input)).annotations[0];
    const reply = annotation.data.review!.replies.find((item) => item.id === 'reply-a')!;
    reply.content = 'Updated comment';
    const output = await writeNativePdfAnnotations(input, [annotation]);
    const loaded = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    expect(loaded.data.review!.replies.find((item) => item.id === 'reply-a')?.content).toBe('Updated comment');
    const saved = (await records(output.bytes)).find(({ dict }) => dict.lookupMaybe(PDFName.of('PDFHubReplyId'), PDFString)?.decodeText() === 'reply-a')!.dict;
    expect(saved.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toContain('font-weight:bold');
    expect(saved.get(PDFName.of('AP'))).toBeUndefined();
  });

  it('deletes the explicit comment and popup while reparenting its child and review state', async () => {
    const input = await fixture();
    const annotation = (await readNativePdfAnnotations(input)).annotations[0];
    annotation.data.review!.replies = annotation.data.review!.replies.filter((item) => item.id !== 'reply-a').map((item) => ({ ...item, parentReplyId: undefined }));
    annotation.data.nativeDeletedReplyIds = ['reply-a'];
    const output = await writeNativePdfAnnotations(input, [annotation]);
    const saved = await records(output.bytes);
    expect(saved.some(({ dict }) => dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'Popup')).toBe(false);
    const root = saved.find(({ dict }) => dict.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText() === 'root')!;
    const child = saved.find(({ dict }) => dict.lookupMaybe(PDFName.of('PDFHubReplyId'), PDFString)?.decodeText() === 'reply-b')!;
    const state = saved.find(({ dict }) => dict.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText() === 'reply-state')!;
    expect(child.dict.get(PDFName.of('IRT'))).toEqual(root.raw as PDFRef);
    expect(state.dict.get(PDFName.of('IRT'))).toEqual(root.raw as PDFRef);
    expect((await readNativePdfAnnotations(output.bytes)).annotations[0].data.review!.replies.map((item) => item.id)).toEqual(['reply-b']);
  });
});
