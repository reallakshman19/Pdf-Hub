import { describe, it, expect } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import type { PdfAnnotation } from '../annotations/types';

describe('Reply appearance preservation and modification risk', () => {
  it('preserves unedited reply /AP and refuses to retain an appearance containing stale text', async () => {
    // 1. Construct a synthetic PDF with a highlight root annotation and a reply Text annotation with /AP
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([600, 400]);

    // Appearance Form XObject for reply
    const apXObject = doc.context.stream('q /Helv 10 Tf 0 0 Td (Original comment) Tj Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 100, 20],
      Resources: doc.context.obj({}),
    });
    const apRef = doc.context.register(apXObject);
    const apDict = doc.context.obj({ N: apRef });

    const rootAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: [50, 50, 150, 70],
      QuadPoints: [50, 70, 150, 70, 50, 50, 150, 50],
      Contents: pdfLib.PDFHexString.fromText('Source root text'),
      NM: pdfLib.PDFString.of('test-root-1'),
      C: [1, 1, 0],
      P: page.ref,
    });
    const rootRef = doc.context.register(rootAnnot);

    const replyAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [50, 50, 70, 70],
      Contents: pdfLib.PDFHexString.fromText('Original comment'),
      T: pdfLib.PDFHexString.fromText('Author A'),
      NM: pdfLib.PDFString.of('test-root-1:reply:0'),
      IRT: rootRef,
      RT: 'R',
      AP: apDict,
      P: page.ref,
    });
    const replyRef = doc.context.register(replyAnnot);

    page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([rootRef, replyRef]));
    const sourceBytes = await doc.save();

    // 2. Read annotations
    const readResult = await readNativePdfAnnotations(sourceBytes);
    expect(readResult.annotations.length).toBe(1);
    const root = readResult.annotations[0];
    expect(root.data.review?.replies.length).toBe(1);
    const reply = root.data.review!.replies[0];
    expect(reply.content).toBe('Original comment');

    // 3. Case A: Save with UNMODIFIED reply -> /AP must be preserved
    const unmodifiedResult = await writeNativePdfAnnotations(sourceBytes, [root]);
    const unmodifiedDoc = await pdfLib.PDFDocument.load(unmodifiedResult.bytes);
    const unmodifiedAnnots = unmodifiedDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray);
    expect(unmodifiedAnnots).toBeDefined();

    const findReplyDict = (annotsArray: pdfLib.PDFArray) => {
      for (let i = 0; i < annotsArray.size(); i++) {
        const dict = annotsArray.lookup(i, pdfLib.PDFDict);
        if (dict.lookupMaybe(pdfLib.PDFName.of('RT'), pdfLib.PDFName)?.decodeText() === 'R') {
          return dict;
        }
      }
      return null;
    };

    const unmodReplyDict = findReplyDict(unmodifiedAnnots!);
    expect(unmodReplyDict).not.toBeNull();
    // Unedited reply must preserve its /AP stream
    expect(unmodReplyDict!.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)).toBeDefined();

    // 4. The source appearance contains the old comment text. It cannot be
    // reused, and discarding it would silently lose the native appearance.
    const modifiedRoot: PdfAnnotation = {
      ...root,
      data: {
        ...root.data,
        review: {
          ...root.data.review!,
          replies: [
            {
              ...reply,
              content: 'Updated edited comment text',
            },
          ],
        },
      },
    };

    await expect(writeNativePdfAnnotations(sourceBytes, [modifiedRoot]))
      .rejects.toThrow('Cannot safely edit native comment appearance');
  });
});
