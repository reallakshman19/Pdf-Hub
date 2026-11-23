import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createSplitPagesZipBundle } from './pdfSplitBundle';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('createSplitPagesZipBundle', () => {
  it('splits pages into individual PDFs and bundles into a zip archive', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([100, 100]);
    doc.addPage([200, 200]);
    doc.addPage([300, 300]);
    const sourceBytes = await doc.save();

    const result = await createSplitPagesZipBundle(
      sourceBytes,
      [0, 2],
      'invoice_march.pdf',
    );

    expect(result.fileCount).toBe(2);
    expect(result.entryNames).toEqual([
      'invoice_march_page_001.pdf',
      'invoice_march_page_003.pdf',
    ]);
    expect(result.zipBytes.byteLength).toBeGreaterThan(0);

    // Verify zip contents using JSZip
    const loadedZip = await JSZip.loadAsync(result.zipBytes);
    const file1 = loadedZip.file('invoice_march_page_001.pdf');
    const file2 = loadedZip.file('invoice_march_page_003.pdf');
    expect(file1).not.toBeNull();
    expect(file2).not.toBeNull();

    const pdf1Bytes = await file1!.async('uint8array');
    const doc1 = await lib.PDFDocument.load(pdf1Bytes);
    expect(doc1.getPageCount()).toBe(1);
    expect(doc1.getPage(0).getWidth()).toBe(100);

    const pdf2Bytes = await file2!.async('uint8array');
    const doc2 = await lib.PDFDocument.load(pdf2Bytes);
    expect(doc2.getPageCount()).toBe(1);
    expect(doc2.getPage(0).getWidth()).toBe(300);
  });

  it('throws when page indices are out of bounds or empty', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    doc.addPage([100, 100]);
    const sourceBytes = await doc.save();

    await expect(
      createSplitPagesZipBundle(sourceBytes, [], 'doc.pdf'),
    ).rejects.toThrow(/cannot create split zip bundle with empty page indices/i);

    await expect(
      createSplitPagesZipBundle(sourceBytes, [5], 'doc.pdf'),
    ).rejects.toThrow(/out of bounds/i);
  });
});
