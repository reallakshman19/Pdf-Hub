import { describe, it, expect } from 'vitest';
import {
  searchOcrDocument,
  calculateLevenshteinDistance,
  unionBoundingBoxes,
  createSearchNavigation,
  nextSearchMatch,
  previousSearchMatch,
} from '../ocrSearchIndexEngine';
import type { OcrDocumentResult, OcrLine, OcrWord } from '../../types';

describe('ocrSearchIndexEngine', () => {
  it('calculates Levenshtein edit distance accurately', () => {
    expect(calculateLevenshteinDistance('cat', 'cat')).toBe(0);
    expect(calculateLevenshteinDistance('cat', 'hat')).toBe(1);
    expect(calculateLevenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(calculateLevenshteinDistance('', 'test')).toBe(4);
  });

  it('unions bounding boxes correctly', () => {
    const box1 = { x: 10, y: 20, width: 30, height: 10 };
    const box2 = { x: 50, y: 15, width: 20, height: 25 };
    const union = unionBoundingBoxes([box1, box2]);

    expect(union.x).toBe(10);
    expect(union.y).toBe(15);
    expect(union.width).toBe(60); // 10 to 70 = 60
    expect(union.height).toBe(25); // 15 to 40 = 25
  });

  const mockLines: OcrLine[] = [
    {
      id: 'l-1',
      pageIndex: 0,
      text: 'Total Amount Due: $1,450.00 immediately',
      confidence: 0.95,
      bbox: { x: 50, y: 100, width: 250, height: 14 },
      wordIds: ['w-1', 'w-2', 'w-3', 'w-4', 'w-5'],
    },
    {
      id: 'l-2',
      pageIndex: 0,
      text: 'Account Number: 987654321',
      confidence: 0.92,
      bbox: { x: 50, y: 120, width: 200, height: 14 },
      wordIds: ['w-6', 'w-7'],
    },
  ];

  const mockWords: OcrWord[] = [
    {
      id: 'w-1',
      lineId: 'l-1',
      pageIndex: 0,
      text: 'Total',
      normalizedText: 'total',
      confidence: 0.95,
      bbox: { x: 50, y: 100, width: 35, height: 14 },
    },
    {
      id: 'w-2',
      lineId: 'l-1',
      pageIndex: 0,
      text: 'Amount',
      normalizedText: 'amount',
      confidence: 0.95,
      bbox: { x: 88, y: 100, width: 45, height: 14 },
    },
    {
      id: 'w-3',
      lineId: 'l-1',
      pageIndex: 0,
      text: 'Due:',
      normalizedText: 'due:',
      confidence: 0.95,
      bbox: { x: 136, y: 100, width: 30, height: 14 },
    },
  ];

  const mockDoc: OcrDocumentResult = {
    documentFingerprint: 'doc-search-1',
    createdAt: '2026-11-23T08:00:00.000Z',
    engineId: 'tesseract-wasm',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        pageNumber: 1,
        pageIndex: 0,
        status: 'success',
        confidence: 0.94,
        blocks: [],
        lines: mockLines,
        words: mockWords,
      },
    ],
  };

  it('performs exact substring search and generates bounding boxes', () => {
    const results = searchOcrDocument(mockDoc, 'Amount Due');
    expect(results).toHaveLength(1);
    expect(results[0].lineId).toBe('l-1');
    expect(results[0].matchedText).toBe('Amount Due');
    expect(results[0].wordIds).toContain('w-2');
    expect(results[0].wordIds).toContain('w-3');
    expect(results[0].bbox.x).toBe(88);
  });

  it('performs case-insensitive and case-sensitive queries', () => {
    const caseInsensitive = searchOcrDocument(mockDoc, 'total', { caseSensitive: false });
    expect(caseInsensitive).toHaveLength(1);

    const caseSensitiveFail = searchOcrDocument(mockDoc, 'total', { caseSensitive: true });
    expect(caseSensitiveFail).toHaveLength(0);

    const caseSensitivePass = searchOcrDocument(mockDoc, 'Total', { caseSensitive: true });
    expect(caseSensitivePass).toHaveLength(1);
  });

  it('performs fuzzy search for scan inaccuracies', () => {
    // "Amont" has distance 1 from "Amount"
    const fuzzyHits = searchOcrDocument(mockDoc, 'Amont', { fuzzy: true, maxEditDistance: 1 });
    expect(fuzzyHits).toHaveLength(1);
    expect(fuzzyHits[0].isFuzzy).toBe(true);
    expect(fuzzyHits[0].matchedText).toBe('Amount');
  });

  it('navigates search matches cyclically', () => {
    const results = searchOcrDocument(mockDoc, 'o'); // matches 'Total' and 'Account'
    const nav0 = createSearchNavigation(results);
    expect(nav0.activeIndex).toBe(0);

    const nav1 = nextSearchMatch(nav0);
    expect(nav1.activeIndex).toBe(1);

    const navPrev = previousSearchMatch(nav1);
    expect(navPrev.activeIndex).toBe(0);

    const navWrap = previousSearchMatch(navPrev);
    expect(navWrap.activeIndex).toBe(results.length - 1);
  });
});
