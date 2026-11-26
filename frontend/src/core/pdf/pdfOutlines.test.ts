import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { AppBookmark } from '@/core/bookmarks/types';
import { composeCommittedPdf, composeEditablePdf } from '@/core/document/commitPipeline';
import { writeCustomBookmarksToPdfOutlines } from './pdfOutlines';

async function createBlankPagesPdf(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([400, 600]).drawText(`Page ${i + 1}`, { x: 24, y: 540, size: 12 });
  }
  return doc.save();
}

describe('writeCustomBookmarksToPdfOutlines', () => {
  it('writes custom bookmarks as PDF /Outlines readable via PDF.js getOutlineFlat', async () => {
    const baseBytes = await createBlankPagesPdf(3);
    const bookmarks: AppBookmark[] = [
      { id: 'b1', title: 'Cover Sheet', pageNumber: 1, createdAt: 100 },
      { id: 'b2', title: 'Section §2 — Notes', pageNumber: 3, createdAt: 200 },
    ];

    const outBytes = await writeCustomBookmarksToPdfOutlines(baseBytes, bookmarks);
    const lease = await PdfRendererAdapter.acquireDocument(outBytes);
    try {
      const outline = await PdfRendererAdapter.getOutlineFlat(lease.doc);
      expect(outline).toHaveLength(2);
      expect(outline[0]).toMatchObject({ title: 'Cover Sheet', pageNumber: 1, depth: 0 });
      expect(outline[1]).toMatchObject({ title: 'Section §2 — Notes', pageNumber: 3, depth: 0 });
    } finally {
      await lease.release();
    }
  });

  it('appends new bookmarks to existing outlines without duplicating matching titles', async () => {
    const baseBytes = await createBlankPagesPdf(3);
    const firstPass = await writeCustomBookmarksToPdfOutlines(baseBytes, [
      { id: 'b1', title: 'Existing Tab', pageNumber: 1, createdAt: 100 },
    ]);
    const secondPass = await writeCustomBookmarksToPdfOutlines(firstPass, [
      { id: 'b1-dup', title: 'Existing Tab', pageNumber: 1, createdAt: 200 },
      { id: 'b2', title: 'Appended Section', pageNumber: 2, createdAt: 300 },
    ]);

    const lease = await PdfRendererAdapter.acquireDocument(secondPass);
    try {
      const outline = await PdfRendererAdapter.getOutlineFlat(lease.doc);
      expect(outline).toHaveLength(2);
      expect(outline.map((item) => item.title)).toEqual([
        'Existing Tab',
        'Appended Section',
      ]);
      expect(outline.map((item) => item.pageNumber)).toEqual([1, 2]);
    } finally {
      await lease.release();
    }
  });

  it('embeds customBookmarks cleanly inside composeEditablePdf and composeCommittedPdf', async () => {
    const baseBytes = await createBlankPagesPdf(2);
    const bookmarks: AppBookmark[] = [
      { id: 'b1', title: 'Key Schedule', pageNumber: 2, createdAt: 1 },
    ];

    const editable = await composeEditablePdf({
      baseBytes,
      annotations: [],
      writerElements: [],
      customBookmarks: bookmarks,
    });
    const committed = await composeCommittedPdf({
      baseBytes,
      annotations: [],
      writerElements: [],
      customBookmarks: bookmarks,
    });

    for (const bytes of [editable.bytes, committed.bytes]) {
      const lease = await PdfRendererAdapter.acquireDocument(bytes);
      try {
        const outline = await PdfRendererAdapter.getOutlineFlat(lease.doc);
        expect(outline).toHaveLength(1);
        expect(outline[0]).toMatchObject({ title: 'Key Schedule', pageNumber: 2 });
      } finally {
        await lease.release();
      }
    }
  });
});
