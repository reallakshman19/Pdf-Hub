import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function createPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  return new Uint8Array(await doc.save());
}

function annotation(
  id: string,
  type: PdfAnnotation['type'],
  data: PdfAnnotation['data'],
  rect: PdfAnnotation['rect'] = { x: 20, y: 30, width: 120, height: 24 },
): PdfAnnotation {
  return {
    id,
    type,
    pageNumber: 1,
    rect,
    data,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
  };
}

describe('readNativePdfAnnotations', () => {
  it('round-trips PDF Hub annotation type, custom data, Unicode text and replies', async () => {
    const source = await createPdf();

    const written = await writeNativePdfAnnotations(source, [
      annotation('comment-1', 'comment', {
        text: 'مراجعة',
        backgroundColor: '#fff7cc',
        review: {
          author: 'Alice',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_100,
          status: 'resolved',
          title: 'Valve check',
          category: 'Design',
          replies: [
            {
              id: 'reply-1',
              author: 'Bob',
              content: 'تم',
              createdAt: 1_700_000_000_200,
            },
          ],
        },
      }),
      annotation('callout-1', 'callout', {
        text: 'Check nozzle',
        anchor: { x: 10, y: 20 },
        knee: { x: 16, y: 28 },
        borderColor: '#475569',
        backgroundColor: '#ffffff',
      }, { x: 60, y: 80, width: 140, height: 50 }),
      annotation('mask-1', 'redaction', {
        backgroundColor: '#000000',
      }),
    ]);

    const read = await readNativePdfAnnotations(written.bytes);

    expect(read.importedCount).toBe(3);

    const comment = read.annotations.find((item) => item.id === 'comment-1');
    expect(comment?.type).toBe('comment');
    expect(comment?.data.text).toBe('مراجعة');
    expect(comment?.data.review?.status).toBe('resolved');
    expect(comment?.data.review?.title).toBe('Valve check');
    expect(comment?.data.review?.category).toBe('Design');
    expect(comment?.data.review?.replies).toHaveLength(1);
    expect(comment?.data.review?.replies[0]).toMatchObject({
      id: 'reply-1',
      author: 'Bob',
      content: 'تم',
    });

    const callout = read.annotations.find((item) => item.id === 'callout-1');
    expect(callout?.type).toBe('callout');
    expect(callout?.data.anchor).toEqual({ x: 10, y: 20 });
    expect(callout?.data.knee).toEqual({ x: 16, y: 28 });

    const mask = read.annotations.find((item) => item.id === 'mask-1');
    expect(mask?.type).toBe('redaction');
  });

  it('imports supported external standard annotations without PDF Hub metadata', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);

    const note = doc.context.register(
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [20, 300, 40, 320],
        Contents: PDFHexString.fromText('External note'),
        T: PDFHexString.fromText('External reviewer'),
        NM: PDFString.of('external-note-1'),
        F: 4,
      }),
    );

    const annots = doc.context.obj([]);
    annots.push(note);
    page.node.set(PDFName.of('Annots'), annots);

    const bytes = new Uint8Array(await doc.save());
    const read = await readNativePdfAnnotations(bytes);

    expect(read.importedCount).toBe(1);
    expect(read.annotations[0]).toMatchObject({
      id: 'external-note-1',
      type: 'sticky-note',
      pageNumber: 1,
      data: {
        text: 'External note',
        author: 'External reviewer',
      },
    });
  });

  it('skips unrelated annotation types such as links', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);

    const link = doc.context.register(
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [10, 10, 50, 20],
        Border: [0, 0, 0],
      }),
    );

    const annots = doc.context.obj([]);
    annots.push(link);
    page.node.set(PDFName.of('Annots'), annots);

    const bytes = new Uint8Array(await doc.save());
    const read = await readNativePdfAnnotations(bytes);

    expect(read.annotations).toEqual([]);
    expect(read.skippedCount).toBe(1);
  });
});
