import { describe, it, expect, vi } from 'vitest';
import {
  findMatchesInSpan,
  scanDocumentForFindReplaceMatches,
} from '../batchFindReplace';
import { buildExistingTextSpan } from '../model';

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn().mockResolvedValue({
      doc: {
        getPage: vi.fn().mockImplementation((_pageNumber: number) => ({
          cleanup: vi.fn(),
        })),
      },
      release: vi.fn(),
    }),
    getPageExistingTextSourceItems: vi.fn().mockImplementation((_page: any) => [
      {
        sourceIndex: 0,
        text: 'Project Target on page',
        direction: 'ltr',
        width: 100,
        height: 12,
        transform: [12, 0, 0, 12, 72, 700],
        fontName: 'Helvetica',
        hasEol: false,
      },
    ]),
  },
}));

function createMockSpan(text: string, _id = 'span-1', pageIndex = 0): any {
  return buildExistingTextSpan(
    { revisionId: 'rev-1', pageId: `page-${pageIndex + 1}`, pageIndex },
    {
      sourceIndex: 0,
      text,
      transform: [12, 0, 0, 12, 72, 700],
      width: text.length * 6,
      height: 12,
      fontName: 'Helvetica',
      direction: 'ltr',
      hasEol: false,
    },
  );
}

describe('Batch Find and Replace Engine', () => {
  describe('findMatchesInSpan', () => {
    it('matches case-insensitively by default and computes replacementSpanText', () => {
      const span = createMockSpan('The Quick Brown Fox');
      const matches = findMatchesInSpan(span, {
        query: 'quick',
        replacement: 'Fast',
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].matchedSubstring).toBe('Quick');
      expect(matches[0].matchStartIndex).toBe(4);
      expect(matches[0].matchEndIndex).toBe(9);
      expect(matches[0].originalSpanText).toBe('The Quick Brown Fox');
      expect(matches[0].replacementSpanText).toBe('The Fast Brown Fox');
    });

    it('respects caseSensitive option', () => {
      const span = createMockSpan('Apple apple APPLE');
      const caseMatches = findMatchesInSpan(span, {
        query: 'apple',
        replacement: 'pear',
        caseSensitive: true,
      });

      expect(caseMatches).toHaveLength(1);
      expect(caseMatches[0].matchedSubstring).toBe('apple');
      expect(caseMatches[0].matchStartIndex).toBe(6);
    });

    it('matches whole words only when matchWholeWord is true', () => {
      const span = createMockSpan('cat catalog concatenate copycat cat');
      const matches = findMatchesInSpan(span, {
        query: 'cat',
        replacement: 'dog',
        matchWholeWord: true,
      });

      expect(matches).toHaveLength(2);
      expect(matches[0].matchStartIndex).toBe(0);
      expect(matches[1].matchStartIndex).toBe(32);
    });

    it('supports regular expressions when useRegex is true', () => {
      const span = createMockSpan('Project CODE-101 and CODE-202 completed.');
      const matches = findMatchesInSpan(span, {
        query: 'CODE-\\d+',
        replacement: 'SPEC-999',
        useRegex: true,
      });

      expect(matches).toHaveLength(2);
      expect(matches[0].matchedSubstring).toBe('CODE-101');
      expect(matches[1].matchedSubstring).toBe('CODE-202');
      expect(matches[0].replacementSpanText).toBe('Project SPEC-999 and CODE-202 completed.');
    });

    it('handles empty query gracefully returning no matches', () => {
      const span = createMockSpan('Hello World');
      const matches = findMatchesInSpan(span, {
        query: '',
        replacement: 'Test',
      });
      expect(matches).toHaveLength(0);
    });
  });

  describe('scanDocumentForFindReplaceMatches', () => {
    it('scans target pages and groups matches by pageIndex', async () => {
      const pageGraph = {
        pages: [
          { pageId: 'page-1', currentIndex: 0 },
          { pageId: 'page-2', currentIndex: 1 },
        ],
      };

      const scanResult = await scanDocumentForFindReplaceMatches(
        new Uint8Array([1, 2, 3]),
        'doc-1',
        pageGraph,
        {
          query: 'Target',
          replacement: 'Goal',
        },
      );

      expect(scanResult.totalMatches).toBe(2);
      expect(scanResult.matchesByPage[0]).toHaveLength(1);
      expect(scanResult.matchesByPage[1]).toHaveLength(1);
      expect(scanResult.allMatches[0].replacementSpanText).toBe('Project Goal on page');
    });
  });
});
