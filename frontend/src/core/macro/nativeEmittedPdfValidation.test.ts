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

/** A correctly indexed, directly authored PDF with an empty /Pages tree. */
function nativeZeroPagePdf(): Uint8Array {
  let pdf = '%PDF-1.4\\n';
  const offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>',
  ];
  for (const [index, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\\n${body}\\nendobj\\n`;
  }
  const xref = pdf.length;
  pdf += 'xref\\n0 3\\n0000000000 65535 f \\n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \\n`;
  }
  pdf += `trailer\\n<< /Root 1 0 R /Size 3 >>\\nstartxref\\n${xref}\\n%%EOF\\n`;
  return new TextEncoder().encode(pdf);
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

  it('rejects a directly authored zero-page PDF with a valid page-tree and xref', async () => {
    const value = await validateEmittedBatchPdf(nativeZeroPagePdf(), 0);
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

  it('demonstrates known limitation: accepts valid PDF with tampered note /NM and /Contents (structural check only)', async () => {
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const cleanBytes = new Uint8Array(await document.save());

    // Inject a valid annotation dictionary with tampered /NM and /Contents
    const tamperedPdf = await PDFDocument.load(cleanBytes);
    const firstPage = tamperedPdf.getPage(0);
    const { PDFName, PDFString } = await import('pdf-lib');
    const annotDict = tamperedPdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [100, 100, 200, 200],
      NM: PDFString.of('TAMPERED_NM_IDENTITY'),
      Contents: PDFString.of('TAMPERED_CRITICAL_NOTE_TEXT'),
    });
    const annotRef = tamperedPdf.context.register(annotDict);
    firstPage.node.set(PDFName.of('Annots'), tamperedPdf.context.obj([annotRef]));
    const tamperedBytes = new Uint8Array(await tamperedPdf.save());

    // Product-level structural validator checks parseability and page count;
    // it accepts this semantically compromised PDF because page count is intact.
    const validation = await validateEmittedBatchPdf(tamperedBytes, 0);
    expect(validation).toEqual({ valid: true, pageCount: 1 });
  });

  it('honors pre-aborted cancellation without reclassifying as PDF corruption', async () => {
    const controller = new AbortController();
    controller.abort('Canceled for R5 negative control');
    await expect(validateEmittedBatchPdf(await nativePdf(1), 1, controller.signal))
      .rejects.toThrow();
  });
});
