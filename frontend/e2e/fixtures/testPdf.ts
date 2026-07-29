import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Builds a small, real (not mocked) PDF with embedded, extractable vector
 * text so PDF Hub's real text-search/annotation pipeline has something to
 * find. Used as the "open a PDF" input across the e2e journeys.
 */
export async function buildTestPdf(options: {
  /** Extra lines of searchable body text, e.g. a PS number for the PS→ISONOTE journey. */
  bodyLines?: string[];
} = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);

  page.drawText('Pdf-Hub E2E Fixture Document', {
    x: 72,
    y: 720,
    size: 20,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  const bodyLines = options.bodyLines ?? [
    'This is a real, generated PDF used for end-to-end testing.',
  ];

  bodyLines.forEach((line, index) => {
    page.drawText(line, {
      x: 72,
      y: 680 - index * 20,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  return doc.save();
}
