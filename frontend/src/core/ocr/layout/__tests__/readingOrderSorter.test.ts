import { describe, it, expect } from 'vitest';
import {
  sortOcrBlocksInReadingOrder,
  sortPageBlocksInReadingOrder,
} from '../readingOrderSorter';
import type { OcrBlock, OcrPageResult } from '../../types';

function createBlock(id: string, x: number, y: number, width: number, height: number, text?: string): OcrBlock {
  return {
    id,
    type: 'paragraph',
    rect: { x, y, width, height },
    bbox: { x, y, width, height },
    text: text ?? id,
  };
}

describe('readingOrderSorter', () => {
  it('handles empty and single-block inputs gracefully', () => {
    expect(sortOcrBlocksInReadingOrder([])).toEqual([]);
    const single = [createBlock('b1', 50, 50, 200, 20)];
    expect(sortOcrBlocksInReadingOrder(single)).toEqual(single);
  });

  it('preserves single-column top-to-bottom ordering', () => {
    const b1 = createBlock('p1', 50, 50, 400, 30);
    const b2 = createBlock('p2', 50, 100, 400, 40);
    const b3 = createBlock('p3', 50, 160, 400, 30);

    const shuffled = [b2, b3, b1];
    const sorted = sortOcrBlocksInReadingOrder(shuffled);
    expect(sorted.map((b) => b.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('correctly sorts 2-column documents without horizontal interleaving', () => {
    // Column 1 (x: 50 to 250)
    const c1_top = createBlock('c1_top', 50, 100, 200, 50);
    const c1_bottom = createBlock('c1_bottom', 50, 170, 200, 50);

    // Column 2 (x: 300 to 500)
    const c2_top = createBlock('c2_top', 300, 100, 200, 50);
    const c2_bottom = createBlock('c2_bottom', 300, 170, 200, 50);

    // Naive Y-sort would produce c1_top, c2_top, c1_bottom, c2_bottom
    // Reading order sort must read entire Column 1 first, then Column 2
    const input = [c2_bottom, c1_top, c2_top, c1_bottom];
    const sorted = sortOcrBlocksInReadingOrder(input, { minColumnGutterPt: 15 });

    expect(sorted.map((b) => b.id)).toEqual(['c1_top', 'c1_bottom', 'c2_top', 'c2_bottom']);
  });

  it('handles full-width header above 2-column content and full-width footer below', () => {
    const header = createBlock('header', 50, 20, 500, 40);
    const col1_1 = createBlock('c1_1', 50, 100, 220, 60);
    const col1_2 = createBlock('c1_2', 50, 180, 220, 60);
    const col2_1 = createBlock('c2_1', 320, 100, 220, 60);
    const col2_2 = createBlock('c2_2', 320, 180, 220, 60);
    const footer = createBlock('footer', 50, 280, 500, 30);

    const input = [col2_2, footer, col1_2, header, col2_1, col1_1];
    const sorted = sortOcrBlocksInReadingOrder(input);

    expect(sorted.map((b) => b.id)).toEqual([
      'header',
      'c1_1',
      'c1_2',
      'c2_1',
      'c2_2',
      'footer',
    ]);
  });

  it('correctly sorts 3-column layout left-to-right across columns', () => {
    const c1 = createBlock('c1', 50, 100, 100, 100);
    const c2 = createBlock('c2', 200, 100, 100, 100);
    const c3 = createBlock('c3', 350, 100, 100, 100);

    const input = [c3, c1, c2];
    const sorted = sortOcrBlocksInReadingOrder(input, { minColumnGutterPt: 10 });
    expect(sorted.map((b) => b.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('sorts page blocks using sortPageBlocksInReadingOrder helper', () => {
    const page: OcrPageResult = {
      status: 'complete',
      pageIndex: 0,
      pageNumber: 1,
      width: 612,
      height: 792,
      blocks: [
        createBlock('b_right', 320, 100, 200, 50),
        createBlock('b_left', 50, 100, 200, 50),
      ],
    };

    const sortedPage = sortPageBlocksInReadingOrder(page);
    expect(sortedPage.blocks?.map((b) => b.id)).toEqual(['b_left', 'b_right']);
  });
});
