import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function createPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  return new Uint8Array(await doc.save());
}

function annotation(
  id: string,
  type: PdfAnnotation['type'],
  data: PdfAnnotation['data'] = {},
): PdfAnnotation {
  return {
    id,
    type,
    pageNumber: 1,
    rect: { x: 20, y: 30, width: 120, height: 24 },
    data,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
  };
}

function readAnnotations(doc: PDFDocument): PDFDict[] {
  const page = doc.getPage(0);
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return [];

  const result: PDFDict[] = [];
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookupMaybe(index, PDFDict);
    if (dict) result.push(dict);
  }
  return result;
}

function readName(dict: PDFDict, key: string): string | null {
  return dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText() ?? null;
}

function readString(dict: PDFDict, key: string): string | null {
  return dict.lookupMaybe(PDFName.of(key), PDFString)?.decodeText() ?? null;
}

describe('writeNativePdfAnnotations', () => {
  it('writes markup, comments and reply relationships as native annotations', async () => {
    const bytes = await createPdf();

    const result = await writeNativePdfAnnotations(bytes, [
      annotation('highlight-1', 'highlight', {
        backgroundColor: '#fde047',
        opacity: 0.4,
      }),
      annotation('comment-1', 'comment', {
        text: 'Check this value.',
        review: {
          author: 'Alice',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_100,
          status: 'open',
          replies: [
            {
              id: 'reply-1',
              author: 'Bob',
              content: 'Confirmed.',
              createdAt: 1_700_000_000_200,
            },
          ],
        },
      }),
    ]);

    expect(result.annotationCount).toBe(2);
    expect(result.replyCount).toBe(1);

    const doc = await PDFDocument.load(result.bytes);
    const annots = readAnnotations(doc);

    expect(annots).toHaveLength(3);

    const byNm = new Map(
      annots.map((dict) => [readString(dict, 'NM'), dict]),
    );

    expect(readName(byNm.get('highlight-1')!, 'Subtype')).toBe('Highlight');
    expect(readName(byNm.get('comment-1')!, 'Subtype')).toBe('Text');
    expect(readString(byNm.get('comment-1')!, 'Contents')).toBe('Check this value.');

    const reply = byNm.get('comment-1:reply:reply-1');
    expect(reply).toBeTruthy();
    expect(readName(reply!, 'Subtype')).toBe('Text');
    expect(readString(reply!, 'Contents')).toBe('Confirmed.');
    expect(reply!.get(PDFName.of('IRT'))).toBeTruthy();
  });

  it('upserts PDF Hub annotations by NM instead of duplicating them across saves', async () => {
    const bytes = await createPdf();
    const comment = annotation('comment-1', 'comment', {
      text: 'First text',
    });

    const first = await writeNativePdfAnnotations(bytes, [comment]);
    const second = await writeNativePdfAnnotations(first.bytes, [
      {
        ...comment,
        data: {
          ...comment.data,
          text: 'Updated text',
        },
        updatedAt: comment.updatedAt + 100,
      },
    ]);

    const doc = await PDFDocument.load(second.bytes);
    const annots = readAnnotations(doc);
    const matching = annots.filter((dict) => readString(dict, 'NM') === 'comment-1');

    expect(matching).toHaveLength(1);
    expect(readString(matching[0], 'Contents')).toBe('Updated text');
  });

  it('preserves pre-existing annotations not owned by PDF Hub', async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([300, 400]);
    const existing = source.context.register(
      source.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [10, 10, 50, 20],
        Border: [0, 0, 0],
      }),
    );
    const annots = source.context.obj([]);
    annots.push(existing);
    page.node.set(PDFName.of('Annots'), annots);

    const bytes = new Uint8Array(await source.save());
    const result = await writeNativePdfAnnotations(bytes, [
      annotation('comment-1', 'comment', { text: 'Review note' }),
    ]);

    const doc = await PDFDocument.load(result.bytes);
    const written = readAnnotations(doc);

    expect(written).toHaveLength(2);
    expect(written.some((dict) => readName(dict, 'Subtype') === 'Link')).toBe(true);
    expect(written.some((dict) => readString(dict, 'NM') === 'comment-1')).toBe(true);
  });

  it('serializes visual masks as editable Square annotations, never PDF Redact annotations', async () => {
    const bytes = await createPdf();

    const result = await writeNativePdfAnnotations(bytes, [
      annotation('mask-1', 'redaction', {
        backgroundColor: '#000000',
      }),
    ]);

    const doc = await PDFDocument.load(result.bytes);
    const [mask] = readAnnotations(doc);

    expect(readName(mask, 'Subtype')).toBe('Square');
    expect(readName(mask, 'Subtype')).not.toBe('Redact');
  });
});
