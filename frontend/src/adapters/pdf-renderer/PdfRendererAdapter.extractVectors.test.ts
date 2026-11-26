import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import { PdfRendererAdapter } from './PdfRendererAdapter';

const openedDocs: PDFDocumentProxy[] = [];

afterEach(async () => {
  while (openedDocs.length > 0) {
    const doc = openedDocs.pop();
    if (doc) {
      await doc.destroy();
    }
  }
});

async function openPdfWithPdfJs(pdfBytes: Uint8Array): Promise<PDFDocumentProxy> {
  const doc = await getDocument({ data: pdfBytes.slice(), verbosity: 0 }).promise;
  openedDocs.push(doc);
  return doc;
}

describe('PdfRendererAdapter.extractPageVectors (real pdf-lib + pdfjs-dist integration)', () => {
  it('extracts view-space vector lines, rectangles, and rotated text anchors from a vector PDF', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 300]);

    // Horizontal pipe run at y_pdf = 200 -> y_view = 300 - 200 = 100
    page.drawLine({
      start: { x: 50, y: 200 },
      end: { x: 250, y: 200 },
      thickness: 3,
      color: rgb(0.8, 0.1, 0.1),
    });

    // Vessel outline rectangle at bottom-left PDF (60, 40) size 80x40 -> view y = 300 - 80 = 220
    page.drawRectangle({
      x: 60,
      y: 40,
      width: 80,
      height: 40,
      borderColor: rgb(0, 0, 1),
      borderWidth: 2,
    });

    page.drawText('4"-P-101-CS', {
      x: 110,
      y: 212,
      size: 12,
      font,
    });

    page.drawText('VERT-90', {
      x: 320,
      y: 120,
      size: 10,
      font,
      rotate: degrees(90),
    });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdfWithPdfJs(bytes);
    const jsPage = await jsDoc.getPage(1);

    const extracted = await PdfRendererAdapter.extractPageVectors(jsPage);

    expect(extracted.isRasterOnlyLikely).toBe(false);
    expect(extracted.imageXObjectCount).toBe(0);
    expect(extracted.geometry.pageNumber).toBe(1);
    expect(extracted.geometry.pageWidth).toBe(400);
    expect(extracted.geometry.pageHeight).toBe(300);

    // At least the 1 standalone line + 4 rect edges = 5 segments
    expect(extracted.geometry.lines.length).toBeGreaterThanOrEqual(5);
    const horizontalPipe = extracted.geometry.lines.find(
      (l) =>
        Math.abs(l.start.y - 100) < 1 &&
        Math.abs(l.end.y - 100) < 1 &&
        Math.abs(l.length - 200) < 1,
    );
    expect(horizontalPipe).toBeDefined();
    expect(horizontalPipe?.strokeWidth).toBeCloseTo(3, 1);

    expect(extracted.geometry.rectangles).toHaveLength(1);
    expect(extracted.geometry.rectangles[0].x).toBeCloseTo(60, 1);
    expect(extracted.geometry.rectangles[0].y).toBeCloseTo(220, 1);
    expect(extracted.geometry.rectangles[0].width).toBeCloseTo(80, 1);
    expect(extracted.geometry.rectangles[0].height).toBeCloseTo(40, 1);

    const pipeTag = extracted.textAnchors.find((a) => a.text.includes('4"-P-101-CS'));
    expect(pipeTag).toBeDefined();
    expect(pipeTag?.fontSize).toBeCloseTo(12, 0.5);
    expect(pipeTag?.x).toBeCloseTo(110, 1);

    const rotatedTag = extracted.textAnchors.find((a) => a.text.includes('VERT-90'));
    expect(rotatedTag).toBeDefined();
    expect(Math.abs(rotatedTag?.angleRad ?? 0)).toBeGreaterThan(1.4);

    jsPage.cleanup();
  });

  it('normalizes 90-degree rotated pages and CropBox offsets into view space', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 300]);
    page.setRotation(degrees(90));
    page.setCropBox(20, 10, 360, 280);

    // Draw line inside the crop box
    page.drawLine({
      start: { x: 40, y: 50 },
      end: { x: 200, y: 50 },
      thickness: 2,
    });
    page.drawText('ROT-TAG', { x: 100, y: 120, size: 11, font });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdfWithPdfJs(bytes);
    const jsPage = await jsDoc.getPage(1);

    const extracted = await PdfRendererAdapter.extractPageVectors(jsPage);

    // After 90deg rotation of 360x280 cropbox, view size becomes width=280, height=360
    expect(extracted.geometry.pageWidth).toBeCloseTo(280, 1);
    expect(extracted.geometry.pageHeight).toBeCloseTo(360, 1);

    // Every extracted vertex and anchor must land cleanly inside [0..pageWidth] x [0..pageHeight]
    expect(extracted.geometry.lines.length).toBeGreaterThanOrEqual(1);
    const line = extracted.geometry.lines[0];
    expect(line.start.x).toBeGreaterThanOrEqual(0);
    expect(line.start.x).toBeLessThanOrEqual(extracted.geometry.pageWidth + 0.5);
    expect(line.start.y).toBeGreaterThanOrEqual(0);
    expect(line.start.y).toBeLessThanOrEqual(extracted.geometry.pageHeight + 0.5);
    // Horizontal line in PDF page becomes vertical line in 90-deg view space
    expect(Math.abs(line.start.x - line.end.x)).toBeLessThan(0.5);
    expect(line.length).toBeCloseTo(160, 1);

    const anchor = extracted.textAnchors.find((a) => a.text.includes('ROT-TAG'));
    expect(anchor).toBeDefined();
    expect(anchor!.x).toBeGreaterThanOrEqual(0);
    expect(anchor!.x).toBeLessThanOrEqual(extracted.geometry.pageWidth + 0.5);

    jsPage.cleanup();
  });

  it('respects regionRect ROI filtering, includeTextAnchors=false, and AbortSignal cancellation', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 300]);

    // Top-left line (view y=50)
    page.drawLine({ start: { x: 20, y: 250 }, end: { x: 80, y: 250 }, thickness: 2 });
    // Bottom-right line (view y=260)
    page.drawLine({ start: { x: 280, y: 40 }, end: { x: 350, y: 40 }, thickness: 2 });
    page.drawText('IN-ROI', { x: 25, y: 260, size: 10, font });
    page.drawText('OUT-ROI', { x: 290, y: 50, size: 10, font });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdfWithPdfJs(bytes);
    const jsPage = await jsDoc.getPage(1);

    const roiOnly = await PdfRendererAdapter.extractPageVectors(jsPage, {
      regionRect: { x: 0, y: 0, width: 150, height: 120 },
    });

    expect(roiOnly.geometry.lines).toHaveLength(1);
    expect(roiOnly.skippedOutOfRegionCount).toBe(1);
    expect(roiOnly.textAnchors.map((a) => a.text)).toEqual(['IN-ROI']);

    const noText = await PdfRendererAdapter.extractPageVectors(jsPage, {
      includeTextAnchors: false,
    });
    expect(noText.textAnchors).toHaveLength(0);
    expect(noText.geometry.lines).toHaveLength(2);

    const controller = new AbortController();
    controller.abort();
    await expect(
      PdfRendererAdapter.extractPageVectors(jsPage, {}, controller.signal),
    ).rejects.toThrow(/cancel|abort/i);

    jsPage.cleanup();
  });

  it('flags raster-only scanned PDFs with isRasterOnlyLikely = true', async () => {
    // Minimal 1x1 transparent PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    const embedded = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embedded, { x: 0, y: 0, width: 200, height: 200 });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdfWithPdfJs(bytes);
    const jsPage = await jsDoc.getPage(1);

    const extracted = await PdfRendererAdapter.extractPageVectors(jsPage);
    expect(extracted.imageXObjectCount).toBe(1);
    expect(extracted.geometry.lines).toHaveLength(0);
    expect(extracted.isRasterOnlyLikely).toBe(true);

    jsPage.cleanup();
  });
});
