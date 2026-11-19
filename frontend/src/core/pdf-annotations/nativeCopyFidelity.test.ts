import { describe, expect, it } from 'vitest';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, PDFString } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { useAnnotationStore } from '@/core/annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { materializeCopiedAnnotations } from './materializeCopiedAnnotations';

async function fixture(withReplies = false) {
  const doc = await PDFDocument.create();
  const first = doc.addPage([300, 400]);
  doc.addPage([300, 400]);
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 80 30 re f 0 0 1 rg 0 20 15 10 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
  }));
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [120, 100, 200, 160], P: first.ref });
  const popupRef = doc.context.register(popup);
  const root = doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', Rect: [20, 30, 100, 60],
    NM: PDFString.of('foreign-stamp'), P: first.ref, Popup: popupRef, AP: { N: appearance },
  });
  const rootRef = doc.context.register(root);
  popup.set(PDFName.of('Parent'), rootRef);
  const refs: PDFRef[] = [rootRef, popupRef];
  if (withReplies) {
    const replyPopup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [140, 100, 220, 160], P: first.ref });
    const replyPopupRef = doc.context.register(replyPopup);
    const reply1 = doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [110, 40, 128, 58], P: first.ref,
      NM: PDFString.of('reply-one'), Contents: PDFString.of('first reply'),
      RC: PDFHexString.fromText('<body xmlns="http://www.w3.org/1999/xhtml"><p>first reply</p></body>'),
      IRT: rootRef, RT: 'R', Popup: replyPopupRef, AP: { N: appearance },
    });
    const reply1Ref = doc.context.register(reply1);
    replyPopup.set(PDFName.of('Parent'), reply1Ref);
    const reply2 = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [130, 40, 148, 58], P: first.ref,
      NM: PDFString.of('reply-two'), Contents: PDFString.of('nested reply'), IRT: reply1Ref, RT: 'R',
    }));
    refs.push(reply1Ref, replyPopupRef, reply2);
  }
  first.node.set(PDFName.of('Annots'), doc.context.obj(refs));
  return doc.save();
}

function bySubtype(annots: PDFArray, subtype: string) {
  for (let i = 0; i < annots.size(); i += 1) {
    const dict = annots.lookup(i, PDFDict);
    if (dict.get(PDFName.of('Subtype'))?.toString() === `/${subtype}`) return { dict, ref: annots.get(i) as PDFRef };
  }
  throw new Error(`Missing ${subtype}`);
}

describe('cross-page native annotation copy', () => {
  it('materializes a copied native appearance and its comment graph before a page mutation', async () => {
    const bytes = await fixture(true);
    const loaded = await readNativePdfAnnotations(bytes);
    const stamp = loaded.annotations.find((annotation) => annotation.type === 'stamp')!;
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const copied = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2)!;
    useAnnotationStore.getState().addReviewReply(copied.id, 'new copied comment', 'Reviewer');
    const prepared = await materializeCopiedAnnotations(bytes, useAnnotationStore.getState().annotations);
    const refreshed = prepared.annotations.find((item) => item.id === copied.id)!;
    expect(refreshed.data.nativeCopySource).toBeUndefined();
    expect(refreshed.data.nativeSourceRef).toBeDefined();
    expect(refreshed.data.review?.replies.map((reply) => reply.content))
      .toEqual(['first reply', 'nested reply', 'new copied comment']);
    const output = await writeNativePdfAnnotations(prepared.bytes, prepared.annotations, { replaceManagedAnnotations: true });
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations.find((item) => item.id === copied.id)!;
    expect(reopened.data.review?.replies.map((reply) => reply.content))
      .toEqual(['first reply', 'nested reply', 'new copied comment']);
  });

  it('copies a custom stamp appearance and creates an independent popup', async () => {
    const bytes = await fixture();
    const read = await readNativePdfAnnotations(bytes);
    const stamp = read.annotations.find((annotation) => annotation.type === 'stamp')!;
    useAnnotationStore.getState().setAnnotations(read.annotations);
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const annotations = useAnnotationStore.getState().annotations;
    expect(annotations).toHaveLength(2);
    const saved = await writeNativePdfAnnotations(bytes, annotations);
    const pdf = await PDFDocument.load(saved.bytes);
    const p1 = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const p2 = pdf.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
    const root1 = bySubtype(p1, 'Stamp');
    const root2 = bySubtype(p2, 'Stamp');
    const popup1 = bySubtype(p1, 'Popup');
    const popup2 = bySubtype(p2, 'Popup');
    expect(root1.ref.toString()).not.toBe(root2.ref.toString());
    expect(popup1.ref.toString()).not.toBe(popup2.ref.toString());
    expect(popup1.dict.get(PDFName.of('Parent'))?.toString()).toBe(root1.ref.toString());
    expect(popup2.dict.get(PDFName.of('Parent'))?.toString()).toBe(root2.ref.toString());
    const normal = (dict: PDFDict) => dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    expect(Array.from(normal(root2.dict))).toEqual(Array.from(normal(root1.dict)));
  });

  it('copies a native stamp to a cropped page with a different rotation without changing its on-screen size', async () => {
    const doc = await PDFDocument.load(await fixture());
    const source = bySubtype(doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray), 'Stamp').dict;
    source.set(PDFName.of('Rect'), doc.context.obj([20, 300, 100, 330]));
    const target = doc.getPage(1);
    target.setCropBox(10, 20, 280, 360);
    target.setRotation(degrees(90));
    const bytes = await doc.save();
    const loaded = await readNativePdfAnnotations(bytes);
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().setSelection([loaded.annotations[0].id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const copy = useAnnotationStore.getState().annotations.find((item) => item.pageNumber === 2)!;
    const output = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    if (process.env.WP01_SYNTHETIC_COPY_EVIDENCE_DIR) {
      await mkdir(process.env.WP01_SYNTHETIC_COPY_EVIDENCE_DIR, { recursive: true });
      await writeFile(join(process.env.WP01_SYNTHETIC_COPY_EVIDENCE_DIR, 'rotated-copy.pdf'), output.bytes);
    }
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expect(reopened.rect).toEqual(copy.rect);
    const outputDoc = await PDFDocument.load(output.bytes);
    const root = bySubtype(outputDoc.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray), 'Stamp').dict;
    expect(root.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
    expect(bySubtype(outputDoc.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray), 'Popup').dict.get(PDFName.of('Parent'))).toBeDefined();
  });

  it('copies nested comments with independent parent and popup links', async () => {
    const bytes = await fixture(true);
    const loaded = await readNativePdfAnnotations(bytes);
    const stamp = loaded.annotations.find((annotation) => annotation.type === 'stamp')!;
    expect(stamp.data.review?.replies).toHaveLength(2);
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const pdf = await PDFDocument.load(saved.bytes);
    const page1 = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const page2 = pdf.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
    const root1 = bySubtype(page1, 'Stamp');
    const root2 = bySubtype(page2, 'Stamp');
    const findReply = (arr: PDFArray, contents: string) => {
      for (let i = 0; i < arr.size(); i += 1) {
        const dict = arr.lookup(i, PDFDict);
        const value = dict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString);
        if (value?.decodeText() === contents) return { dict, ref: arr.get(i) as PDFRef };
      }
      throw new Error(`Missing reply ${contents}`);
    };
    const first1 = findReply(page1, 'first reply');
    const first2 = findReply(page2, 'first reply');
    const nested2 = findReply(page2, 'nested reply');
    expect(first1.dict.get(PDFName.of('IRT'))?.toString()).toBe(root1.ref.toString());
    expect(first2.dict.get(PDFName.of('IRT'))?.toString()).toBe(root2.ref.toString());
    expect(nested2.dict.get(PDFName.of('IRT'))?.toString()).toBe(first2.ref.toString());
    const popup1 = first1.dict.lookup(PDFName.of('Popup'), PDFDict);
    const popup2 = first2.dict.lookup(PDFName.of('Popup'), PDFDict);
    expect(popup1.get(PDFName.of('Parent'))?.toString()).toBe(first1.ref.toString());
    expect(popup2.get(PDFName.of('Parent'))?.toString()).toBe(first2.ref.toString());
    expect(first2.dict.get(PDFName.of('RC'))).toBeDefined();
    expect(first2.dict.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  });

  it('keeps copied nested comments and popups linked across differently rotated pages', async () => {
    const doc = await PDFDocument.load(await fixture(true));
    const source = bySubtype(doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray), 'Stamp').dict;
    source.set(PDFName.of('Rect'), doc.context.obj([20, 300, 100, 330]));
    doc.getPage(1).setRotation(degrees(90));
    const bytes = await doc.save();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    useAnnotationStore.getState().setAnnotations(loaded);
    useAnnotationStore.getState().setSelection([loaded[0].id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const output = await PDFDocument.load((await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).bytes);
    const annots = output.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
    const root = bySubtype(annots, 'Stamp');
    const findReply = (text: string) => {
      for (let i = 0; i < annots.size(); i += 1) {
        const dict = annots.lookup(i, PDFDict);
        if (dict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString)?.decodeText() === text) return { dict, ref: annots.get(i) as PDFRef };
      }
      throw new Error(`Missing reply ${text}`);
    };
    const first = findReply('first reply'); const nested = findReply('nested reply');
    expect(first.dict.get(PDFName.of('IRT'))?.toString()).toBe(root.ref.toString());
    expect(nested.dict.get(PDFName.of('IRT'))?.toString()).toBe(first.ref.toString());
    expect(first.dict.lookup(PDFName.of('Popup'), PDFDict).get(PDFName.of('Parent'))?.toString()).toBe(first.ref.toString());
    expect(first.dict.get(PDFName.of('RC'))).toBeDefined();
    expect(first.dict.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  });

  it('fails safely instead of replacing a modified custom appearance with a stock stamp', async () => {
    const bytes = await fixture();
    const loaded = await readNativePdfAnnotations(bytes);
    const stamp = loaded.annotations.find((annotation) => annotation.type === 'stamp')!;
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const copy = useAnnotationStore.getState().annotations.find((annotation) => annotation.pageNumber === 2)!;
    useAnnotationStore.getState().updateAnnotation(copy.id, { data: { ...copy.data, borderColor: '#ff0000' } });
    await expect(writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations)).rejects.toThrow(/modified native appearance/);
  });

  it('copies a rotated imported stamp before the session is reopened', async () => {
    const bytes = await fixture();
    const loaded = await readNativePdfAnnotations(bytes);
    const stamp = loaded.annotations.find((annotation) => annotation.type === 'stamp')!;
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().updateAnnotation(stamp.id, { data: { ...stamp.data, rotation: 90 } });
    useAnnotationStore.getState().setSelection([stamp.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const output = await PDFDocument.load(saved.bytes);
    for (const page of output.getPages()) {
      const root = bySubtype(page.node.lookup(PDFName.of('Annots'), PDFArray), 'Stamp').dict;
      const ap = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
      const matrix = ap.dict.lookup(PDFName.of('Matrix'), PDFArray).asArray().map((value) => Number(value.toString()));
      expect(matrix.slice(0, 4)).toEqual([0, -1, 1, 0]);
    }
  });

  it('allows an independently edited copied rich-text box without changing its original', async () => {
    const doc = await PDFDocument.create();
    const first = doc.addPage([300, 400]);
    doc.addPage([300, 400]);
    const ap = doc.context.register(doc.context.flateStream('q BT /Helv 12 Tf 5 10 Td (Original) Tj ET Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 40], Resources: {},
    }));
    const rich = '<body xmlns="http://www.w3.org/1999/xhtml" style="font-size:12pt;color:#ff0000"><p>Original</p></body>';
    const root = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: [30, 120, 180, 160], P: first.ref,
      NM: PDFString.of('rich-box'), Contents: PDFHexString.fromText('Original'),
      RC: PDFHexString.fromText(rich), AP: { N: ap },
    }));
    first.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const bytes = await doc.save();
    const loaded = await readNativePdfAnnotations(bytes);
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().setSelection([loaded.annotations[0].id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const copy = useAnnotationStore.getState().annotations.find((annotation) => annotation.pageNumber === 2)!;
    useAnnotationStore.getState().updateAnnotation(copy.id, { data: { ...copy.data, text: 'Modified' } });
    const saved = await writeNativePdfAnnotations(bytes, useAnnotationStore.getState().annotations);
    const output = await PDFDocument.load(saved.bytes);
    const sourceRoot = bySubtype(output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray), 'FreeText').dict;
    const copiedRoot = bySubtype(output.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray), 'FreeText').dict;
    expect(sourceRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toBe(rich);
    expect(copiedRoot.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Modified');
    expect(copiedRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toContain('Modified');
    expect(copiedRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toContain('color:#ff0000');
    expect(copiedRoot.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  });
});
