import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { validateEmittedBatchPdf } from './batchRunner';

/**
 * Unlike batchRunner.test.ts, this file never mocks the PDF adapter:
 * these are actual PDF object graphs parsed through production pdf-lib.
 */
async function nativePdf(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage([612, 792]);
  }
  return new Uint8Array(await document.save());
}

describe('WP07 R5 native emitted PDF validation (real parser)', () => {
  it('accepts a genuine native two-page PDF and retains its real page count', async () => {
    const value = await validateEmittedBatchPdf(await nativePdf(2), 1);
    expect(value).toEqual({ valid: true, pageCount: 2 });
  });

  it('rejects a fake PDF header without a valid PDF object graph', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj garbage endobj\n%%EOF');
    const value = await validateEmittedBatchPdf(bytes, 1);
    expect(value).toMatchObject({
      valid: false,
      error: expect.stringContaining('BATCH_AUXILIARY_PDF_INVALID'),
    });
  });

  it('rejects an actual syntactically loadable zero-page PDF', async () => {
    const value = await validateEmittedBatchPdf(await nativePdf(0), 0);
    expect(value).toMatchObject({
      valid: false,
      error: expect.stringContaining('BATCH_PRIMARY_PDF_INVALID'),
    });
  });

  it('rejects a file that has no PDF signature before attempting PDF loading', async () => {
    const bytes = new TextEncoder().encode('not even a PDF');
    const value = await validateEmittedBatchPdf(bytes, 0);
    expect(value).toMatchObject({
      valid: false,
      error: expect.stringContaining('lacks a PDF header'),
    });
  });

  it('honors pre-aborted cancellation without reclassifying as PDF corruption', async () => {
    const controller = new AbortController();
    controller.abort('Canceled for R5 negative control');
    await expect(validateEmittedBatchPdf(await nativePdf(1), 1, controller.signal))
      .rejects.toThrow();
  });
});
