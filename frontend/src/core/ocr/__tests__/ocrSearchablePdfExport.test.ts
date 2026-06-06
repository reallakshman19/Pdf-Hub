import {
  PDFDocument,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { createOcrCorrection } from '../ocrCorrections';
import {
  exportSearchableOcrPdf,
  mapOcrRectToPdfPageRect,
  ocrLinesToTextItems,
  ocrWordsToTextItems,
} from '../ocrSearchablePdfExport';

describe('ocrSearchablePdfExport', () => {
  it('maps OCR rect to PDF page rect with scaling', () => {
    const rect = mapOcrRectToPdfPageRect({
      rect: {
        x: 100,
        y: 200,
        width: 50,
        height: 20,
      },
      ocrPageSize: {
        width: 500,
        height: 1000,
      },
      pdfPageSize: {
        width: 250,
        height: 500,
      },
    });

    expect(rect).toEqual({
      x: 50,
      y: 100,
      width: 25,
      height: 10,
    });
  });

  it('converts OCR words to text items', async () => {
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const items = ocrWordsToTextItems(page);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.text).toBe('Writer');
    expect(items[0]!.bbox.width).toBeGreaterThan(0);
  });

  it('converts OCR lines to text items', async () => {
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const items = ocrLinesToTextItems(page);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.text).toContain('Writer OCR Demo');
  });

  it('exports searchable OCR PDF with word layer', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult,
      layerMode: 'word',
      visibilityMode: 'invisible',
      disableObjectStreams: true,
    });

    expect(exported.pageCount).toBe(1);
    expect(exported.embeddedTextItemCount).toBe(page.words!.length);
    expect(exported.skippedTextItemCount).toBe(0);
    expect(exported.bytes.length).toBeGreaterThan(pdfBytes.length);
    expect(exported.diagnostics.some((item) => item.code === 'OCR_TEXT_LAYER_ADDED')).toBe(true);

    const loaded = await PDFDocument.load(exported.bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('exports searchable OCR PDF with line layer', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult,
      layerMode: 'line',
      visibilityMode: 'invisible',
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBe(page.lines!.length);
    expect(exported.bytes.length).toBeGreaterThan(pdfBytes.length);
  });

  it('applies correction text before embedding OCR layer', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const targetWord = page.words!.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock OCR word P1pe.');
    }

    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: ocrResult.documentFingerprint,
      pageIndex: 0,
      targetId: targetWord.id,
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: targetWord.bbox,
      now: '2026-01-01T00:00:00.000Z',
    });

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult,
      corrections: [correction],
      useCorrections: true,
      layerMode: 'word',
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBe(page.words!.length);
    expect(exported.diagnostics.some((item) => item.code === 'OCR_TEXT_LAYER_ADDED')).toBe(true);
  });

  it('skips low-confidence OCR words when threshold is set', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult,
      layerMode: 'word',
      minConfidence: 0.7,
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBeLessThan(page.words!.length);
    expect(exported.skippedTextItemCount).toBeGreaterThan(0);
    expect(exported.diagnostics.some((item) => item.code === 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE')).toBe(true);
  });

  it('handles page-size scaling diagnostics', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);
    const pdfBytes = await pdf.save();

    const ocrResult = await createMockOcrResult();

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult,
      disableObjectStreams: true,
    });

    expect(exported.diagnostics.some((item) => item.code === 'OCR_PAGE_SIZE_SCALED')).toBe(true);
  });

  it('warns when no OCR text is embedded', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();

    const emptyResult = {
      ...ocrResult,
      pages: [
        {
          ...ocrResult.pages[0]!,
          words: [],
          lines: [],
        },
      ],
    };

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult: emptyResult,
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBe(0);
    expect(exported.diagnostics.some((item) => item.code === 'NO_OCR_TEXT_EMBEDDED')).toBe(true);
  });

  it('skips OCR page when matching PDF page is missing', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    const page = ocrResult.pages[0]!;

    const missingPageResult = {
      ...ocrResult,
      pages: [
        {
          ...page,
          pageIndex: 5,
          words: page.words!.map((word) => ({
            ...word,
            pageIndex: 5,
          })),
          lines: page.lines!.map((line) => ({
            ...line,
            pageIndex: 5,
          })),
        },
      ],
    };

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult: missingPageResult,
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBe(0);
    expect(exported.diagnostics.some((item) => item.code === 'PDF_PAGE_NOT_FOUND')).toBe(true);
  });
});

async function createBlankPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);

  return pdf.save({
    useObjectStreams: false,
  });
}

async function createMockOcrResult() {
  return mockOcrEngine.recognize({
    documentFingerprint: 'doc-searchable-pdf',
    profile: getOcrProfile('clean-scan'),
    pages: [
      {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
    ],
  });
}
