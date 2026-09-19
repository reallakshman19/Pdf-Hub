import { describe, expect, it } from 'vitest';

import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  matchesHeaderFooterSelector,
  sectionForPage,
} from './selectorResolver';

function page(pageId: string, currentIndex: number): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
  };
}

function graph(): PageGraph<PageNode> {
  return {
    pages: [
      page('cover', 0),
      page('front-1', 1),
      page('front-2', 2),
      page('body-1', 3),
      page('body-2', 4),
      page('appendix-1', 5),
    ],
    pageLabelRanges: [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
      { startPageId: 'appendix-1', style: 'decimal', prefix: 'A-' },
    ],
  };
}

describe('header/footer selector resolution', () => {
  it('matches reversed PageId ranges by current physical bounds', () => {
    const selector = {
      include: {
        mode: 'range' as const,
        startPageId: 'body-2',
        endPageId: 'front-1',
      },
    };

    expect(
      graph().pages.map((_page, index) =>
        matchesHeaderFooterSelector(selector, graph(), index),
      ),
    ).toEqual([false, true, true, true, true, false]);
  });

  it('matches a canonical PageLabel range only until the next range start', () => {
    const selector = {
      include: {
        mode: 'pageLabelRange' as const,
        startPageId: 'front-1',
      },
    };

    expect(
      graph().pages.map((_page, index) =>
        matchesHeaderFooterSelector(selector, graph(), index),
      ),
    ).toEqual([false, true, true, false, false, false]);
  });

  it('applies physical parity and first/last exclusions after include matching', () => {
    const selector = {
      include: { mode: 'all' as const },
      parity: 'odd' as const,
      excludeFirstPhysicalPage: true,
      excludeLastPhysicalPage: true,
    };

    expect(
      graph().pages.map((_page, index) =>
        matchesHeaderFooterSelector(selector, graph(), index),
      ),
    ).toEqual([false, false, true, false, true, false]);
  });

  it('uses canonical PageLabel ranges to calculate section bounds', () => {
    expect(sectionForPage(graph(), 0)).toEqual({
      startIndex: 0,
      endExclusive: 1,
    });
    expect(sectionForPage(graph(), 2)).toEqual({
      startIndex: 1,
      endExclusive: 3,
    });
    expect(sectionForPage(graph(), 4)).toEqual({
      startIndex: 3,
      endExclusive: 5,
    });
    expect(sectionForPage(graph(), 5)).toEqual({
      startIndex: 5,
      endExclusive: 6,
    });
  });

  it('falls back to the whole document when no canonical PageLabel ranges exist', () => {
    const noLabels: PageGraph<PageNode> = {
      pages: [page('a', 0), page('b', 1), page('c', 2)],
    };

    expect(sectionForPage(noLabels, 1)).toEqual({
      startIndex: 0,
      endExclusive: 3,
    });
  });
});
