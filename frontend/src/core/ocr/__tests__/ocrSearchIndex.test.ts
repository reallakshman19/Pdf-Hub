import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  buildOcrSearchIndex,
  getLowConfidenceSearchItems,
  getOcrSearchItemsForPage,
  searchOcrIndex,
  type OcrSearchCorrection,
} from '../ocrSearchIndex';

describe('ocrSearchIndex', () => {
  it('builds a searchable index from OCR document result', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-search',
      profile: getOcrProfile('table-heavy'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const index = buildOcrSearchIndex({
      document,
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(index.documentFingerprint).toBe('doc-search');
    expect(index.builtAt).toBe('2026-01-01T00:00:00.000Z');
    expect(index.items.length).toBeGreaterThan(0);
    expect(index.items.some((item) => item.source === 'ocrWord')).toBe(true);
    expect(index.items.some((item) => item.source === 'ocrLine')).toBe(true);
    expect(index.items.some((item) => item.source === 'ocrBlock')).toBe(true);
    expect(index.items.some((item) => item.source === 'ocrTableCell')).toBe(true);
  });

  it('searches OCR text case-insensitively', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-search-case',
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

    const index = buildOcrSearchIndex({ document });
    const matches = searchOcrIndex(index, {
      text: 'writer ocr',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.item.text.toLowerCase()).toContain('writer');
  });

  it('searches table cell text', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-table-search',
      profile: getOcrProfile('table-heavy'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const index = buildOcrSearchIndex({ document });

    const matches = searchOcrIndex(index, {
      text: 'valve',
      source: 'ocrTableCell',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.item.text).toBe('Valve');
    expect(matches[0]!.item.source).toBe('ocrTableCell');
  });

  it('filters search by page and confidence range', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-filter',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const index = buildOcrSearchIndex({ document });

    const pageOneMatches = searchOcrIndex(index, {
      text: 'writer',
      pageIndex: 1,
    });

    expect(pageOneMatches.length).toBeGreaterThan(0);
    expect(pageOneMatches.every((match) => match.item.pageIndex === 1)).toBe(true);

    const lowConfidenceMatches = searchOcrIndex(index, {
      text: 'p1pe',
      maxConfidence: 0.7,
    });

    expect(lowConfidenceMatches.length).toBeGreaterThan(0);
    expect(lowConfidenceMatches.every((match) => (match.item.confidence ?? 1) <= 0.7)).toBe(true);
  });

  it('returns low-confidence search items', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-low-confidence-search',
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

    const index = buildOcrSearchIndex({ document });
    const lowConfidenceItems = getLowConfidenceSearchItems(index, 0.7);

    expect(lowConfidenceItems.length).toBeGreaterThan(0);
    expect(lowConfidenceItems.some((item) => item.text === 'P1pe')).toBe(true);
  });

  it('gets all OCR search items for a page', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-page-items',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const index = buildOcrSearchIndex({ document });
    const pageZeroItems = getOcrSearchItemsForPage(index, 0);

    expect(pageZeroItems.length).toBeGreaterThan(0);
    expect(pageZeroItems.every((item) => item.pageIndex === 0)).toBe(true);
  });

  it('uses correction text when correction is supplied', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-correction-search',
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

    const targetWord = document.pages[0]!.words!.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock low-confidence P1pe word.');
    }

    const corrections: OcrSearchCorrection[] = [
      {
        id: 'correction-1',
        documentFingerprint: document.documentFingerprint,
        pageIndex: 0,
        targetId: targetWord.id,
        targetType: 'word',
        originalText: 'P1pe',
        correctedText: 'Pipe',
        bbox: targetWord.bbox,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const index = buildOcrSearchIndex({
      document,
      corrections,
    });

    const matches = searchOcrIndex(index, {
      text: 'pipe',
      source: 'ocrCorrection',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.item.text === 'Pipe')).toBe(true);
  });

  it('respects result limit', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-limit',
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

    const index = buildOcrSearchIndex({ document });

    const matches = searchOcrIndex(index, {
      text: 'text',
      limit: 1,
    });

    expect(matches).toHaveLength(1);
  });
});
