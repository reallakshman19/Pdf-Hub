import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';
import {
  composeCommittedPdf,
  composeEditablePdf,
} from './commitPipeline';

async function createPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  return new Uint8Array(await doc.save());
}

const comment: PdfAnnotation = {
  id: 'comment-1',
  type: 'comment',
  pageNumber: 1,
  rect: { x: 20, y: 30, width: 120, height: 40 },
  data: {
    text: 'Keep this editable',
    review: {
      author: 'Reviewer',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100,
      status: 'open',
      replies: [],
    },
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_100,
};

describe('commit pipeline save semantics', () => {
  it('composeEditablePdf preserves annotations as native PDF objects', async () => {
    const baseBytes = await createPdf();

    const result = await composeEditablePdf({
      baseBytes,
      annotations: [comment],
      writerElements: [],
    });

    const imported = await readNativePdfAnnotations(result.bytes);

    expect(result.committedAnnotationCount).toBe(1);
    expect(imported.annotations).toHaveLength(1);
    expect(imported.annotations[0]).toMatchObject({
      id: 'comment-1',
      type: 'comment',
      data: {
        text: 'Keep this editable',
      },
    });
  });

  it('composeCommittedPdf remains the explicit flattened-export path', async () => {
    const baseBytes = await createPdf();

    const result = await composeCommittedPdf({
      baseBytes,
      annotations: [comment],
      writerElements: [],
    });

    const imported = await readNativePdfAnnotations(result.bytes);

    expect(result.committedAnnotationCount).toBe(1);
    expect(imported.annotations).toEqual([]);
  });
});
