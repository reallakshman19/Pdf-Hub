import { describe, expect, it } from 'vitest';

import { planPdfPageLabelEntries } from './pageLabelMutationPlan';
import type { PageGraph, PageNode } from './types';

function graph(): PageGraph<PageNode> {
  return {
    pages: [
      {
        pageId: 'page-a',
        documentKey: 'doc',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
      },
      {
        pageId: 'page-b',
        documentKey: 'doc',
        originalPageNumber: 2,
        currentIndex: 1,
        width: 595,
        height: 842,
        rotation: 0,
      },
      {
        pageId: 'page-c',
        documentKey: 'doc',
        originalPageNumber: 3,
        currentIndex: 2,
        width: 595,
        height: 842,
        rotation: 0,
      },
    ],
  };
}

describe('PageLabel mutation plan', () => {
  it('converts stable PageId ranges to physical engine entries in range order', () => {
    const result = planPdfPageLabelEntries(
      graph(),
      [
        {
          startPageId: 'page-c',
          style: 'decimal',
          startNumber: 5,
        },
        {
          startPageId: 'page-a',
          prefix: 'Cover',
        },
        {
          startPageId: 'page-b',
          style: 'roman-lower',
        },
      ],
    );

    expect(result).toEqual({
      ok: true,
      entries: [
        {
          startPageIndex: 0,
          prefix: 'Cover',
        },
        {
          startPageIndex: 1,
          style: 'roman-lower',
        },
        {
          startPageIndex: 2,
          style: 'decimal',
          startNumber: 5,
        },
      ],
    });
  });

  it('rejects a range whose stable PageId is not in the graph', () => {
    const result = planPdfPageLabelEntries(
      graph(),
      [
        {
          startPageId: 'missing-page',
          style: 'decimal',
        },
      ],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(
      /missing-page|PageId/i,
    );
  });

  it('produces an empty engine plan when labels are cleared', () => {
    expect(
      planPdfPageLabelEntries(graph(), []),
    ).toEqual({
      ok: true,
      entries: [],
    });
  });
});
