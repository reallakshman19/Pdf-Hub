import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executePageLabelCommandMutation,
  planPageLabelCommandMutation,
} from './pageLabelCommand';

const writer = vi.hoisted(() => ({
  writePdfPageLabels: vi.fn(),
}));

vi.mock('@/core/pages/pdfPageLabelWriter', () => ({
  writePdfPageLabels: writer.writePdfPageLabels,
}));

function graph() {
  return {
    pages: [
      {
        pageId: 'p1',
        documentKey: 'doc',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0 as const,
      },
      {
        pageId: 'p2',
        documentKey: 'doc',
        originalPageNumber: 2,
        currentIndex: 1,
        width: 595,
        height: 842,
        rotation: 0 as const,
      },
    ],
  };
}

describe('canonical PageLabels command mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writer.writePdfPageLabels.mockResolvedValue({
      bytes: new Uint8Array([9]),
      rangeCount: 1,
    });
  });

  it('derives PageGraph labels and writes through one shared writer path', async () => {
    const result = await executePageLabelCommandMutation(
      new Uint8Array([1]),
      graph(),
      [{ startPageId: 'p1', style: 'roman-lower' }],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pageGraph.pages.map((page) => page.logicalLabel)).toEqual([
      'i',
      'ii',
    ]);
    expect(writer.writePdfPageLabels).toHaveBeenCalledWith(
      new Uint8Array([1]),
      expect.objectContaining({
        pageLabelRanges: [
          { startPageId: 'p1', style: 'roman-lower' },
        ],
      }),
      [{ startPageId: 'p1', style: 'roman-lower' }],
      undefined,
    );
    expect(result.bytes).toEqual(new Uint8Array([9]));
  });

  it('rejects invalid ranges before invoking the PDF writer', async () => {
    const result = await executePageLabelCommandMutation(
      new Uint8Array([1]),
      graph(),
      [{ startPageId: 'missing', style: 'decimal' }],
    );

    expect(result.ok).toBe(false);
    expect(writer.writePdfPageLabels).not.toHaveBeenCalled();
  });

  it('plans stable PageId ranges as physical engine entries without invoking the writer', () => {
    const result = planPageLabelCommandMutation(
      graph(),
      [
        {
          startPageId: 'p1',
          prefix: 'Cover',
        },
        {
          startPageId: 'p2',
          style: 'roman-lower',
          startNumber: 3,
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pageGraph.pages.map((page) => page.logicalLabel)).toEqual([
      'Cover',
      'iii',
    ]);
    expect(result.entries).toEqual([
      {
        startPageIndex: 0,
        prefix: 'Cover',
      },
      {
        startPageIndex: 1,
        style: 'roman-lower',
        startNumber: 3,
      },
    ]);
    expect(writer.writePdfPageLabels).not.toHaveBeenCalled();
  });

});
