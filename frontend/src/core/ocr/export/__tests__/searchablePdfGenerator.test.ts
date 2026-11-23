import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type { OcrDocumentResult, OcrWord } from '../../types';
import { generateSearchablePdf } from '../searchablePdfGenerator';

function makeOcrWord(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  confidence = 95,
  pageIndex = 0,
): OcrWord {
  return {
    id: `w-${pageIndex}-${text}-${x}-${y}`,
    pageIndex,
    text,
    normalizedText: text.toLowerCase(),
    confidence,
    bbox: { x, y, width, height },
  };
}

async function createTestBlankPdf(pageCount = 1, width = 600, height = 800): Promise<Uint8Array> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

describe('searchablePdfGenerator', () => {
  it('generates searchable PDF with invisible text layer extractable by PDF.js', async () => {
    const pdfBytes = await createTestBlankPdf(1, 600, 800);

    const ocrResult: OcrDocumentResult = {
      documentFingerprint: 'doc-searchable-test-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [
            makeOcrWord('PRESSURE', 50, 700, 100, 14),
            makeOcrWord('VESSEL', 160, 700, 90, 14),
            makeOcrWord('100', 50, 660, 40, 14),
            makeOcrWord('BAR', 100, 660, 40, 14),
          ],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const result = await generateSearchablePdf({
      pdfBytes,
      ocrResult,
      options: {
        visibilityMode: 'invisible',
      },
    });

    expect(result.embeddedTextItemCount).toBe(4);
    expect(result.skippedTextItemCount).toBe(0);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === 'SEARCHABLE_PDF_GENERATED')).toBe(true);

    // Verify with PDF.js text extraction
    const loaded = await pdfjs.getDocument({ data: result.bytes }).promise;
    expect(loaded.numPages).toBe(1);

    const page = await loaded.getPage(1);
    const content = await page.getTextContent();
    const extractedStrings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);

    expect(extractedStrings).toContain('PRESSURE');
    expect(extractedStrings).toContain('VESSEL');
    expect(extractedStrings).toContain('100');
    expect(extractedStrings).toContain('BAR');
  });

  it('preserves horizontal scaling (Tz) matching target bounding box width', async () => {
    const pdfBytes = await createTestBlankPdf(1, 600, 800);

    // Provide a word stretched to 250pt width
    const ocrResult: OcrDocumentResult = {
      documentFingerprint: 'doc-searchable-tz',
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [
            makeOcrWord('STRETCHED', 72, 700, 250, 16),
          ],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const result = await generateSearchablePdf({
      pdfBytes,
      ocrResult,
      options: {
        visibilityMode: 'invisible',
      },
    });

    const loaded = await pdfjs.getDocument({ data: result.bytes }).promise;
    const page = await loaded.getPage(1);
    const content = await page.getTextContent();

    const stretchedItem = content.items.find((item) => 'str' in item && item.str === 'STRETCHED');
    expect(stretchedItem).toBeDefined();

    if (stretchedItem && 'width' in stretchedItem) {
      // PDF.js extracts the scaled width from the horizontal matrix/Tz
      expect(stretchedItem.width).toBeGreaterThanOrEqual(240);
      expect(stretchedItem.width).toBeLessThanOrEqual(260);
    }
  });

  it('handles multi-page documents with mixed pages', async () => {
    const pdfBytes = await createTestBlankPdf(3, 600, 800);

    const ocrResult: OcrDocumentResult = {
      documentFingerprint: 'doc-searchable-multipage',
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      pages: [
        // Page 1 has words
        {
          pageIndex: 0,
          pageNumber: 1,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [makeOcrWord('PAGE1', 50, 700, 60, 14, 95, 0)],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
        // Page 2 is blank (0 words)
        {
          pageIndex: 1,
          pageNumber: 2,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
        // Page 3 has words
        {
          pageIndex: 2,
          pageNumber: 3,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [makeOcrWord('PAGE3', 50, 700, 60, 14, 95, 2)],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const result = await generateSearchablePdf({
      pdfBytes,
      ocrResult,
    });

    expect(result.pageCount).toBe(3);
    expect(result.embeddedTextItemCount).toBe(2);

    const loaded = await pdfjs.getDocument({ data: result.bytes }).promise;
    expect(loaded.numPages).toBe(3);

    const page1 = await loaded.getPage(1);
    const c1 = await page1.getTextContent();
    expect(c1.items.map((i) => ('str' in i ? i.str : ''))).toContain('PAGE1');

    const page2 = await loaded.getPage(2);
    const c2 = await page2.getTextContent();
    expect(c2.items.length).toBe(0);

    const page3 = await loaded.getPage(3);
    const c3 = await page3.getTextContent();
    expect(c3.items.map((i) => ('str' in i ? i.str : ''))).toContain('PAGE3');
  });

  it('skips words below confidence threshold or with invalid boxes', async () => {
    const pdfBytes = await createTestBlankPdf(1, 600, 800);

    const ocrResult: OcrDocumentResult = {
      documentFingerprint: 'doc-searchable-skip',
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: 600,
          height: 800,
          words: [
            makeOcrWord('VALID', 50, 700, 60, 14, 95),
            makeOcrWord('LOW_CONF', 120, 700, 60, 14, 30), // below 70 threshold
            makeOcrWord('', 190, 700, 60, 14, 95), // empty
            makeOcrWord('INVALID_BOX', 260, 700, 0, 0, 95), // width/height 0
          ],
          lines: [],
          blocks: [],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const result = await generateSearchablePdf({
      pdfBytes,
      ocrResult,
      options: {
        minConfidence: 70,
      },
    });

    expect(result.embeddedTextItemCount).toBe(1);
    expect(result.skippedTextItemCount).toBe(3);
    expect(result.diagnostics.some((d) => d.code === 'OCR_ITEM_SKIPPED_LOW_CONFIDENCE')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'OCR_ITEM_SKIPPED_EMPTY')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'OCR_ITEM_SKIPPED_INVALID_BBOX')).toBe(true);
  });

  it('respects AbortSignal for cooperative cancellation', async () => {
    const pdfBytes = await createTestBlankPdf(1, 600, 800);
    const controller = new AbortController();
    controller.abort();

    const ocrResult: OcrDocumentResult = {
      documentFingerprint: 'doc-cancelled',
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      pages: [],
      diagnostics: [],
    };

    await expect(
      generateSearchablePdf({
        pdfBytes,
        ocrResult,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
