import { describe, expect, it } from 'vitest';

import {
  insertPagesIntoGraph,
  removePagesFromGraph,
} from './pageGraph';
import {
  formatPageLabelNumber,
  reanchorPageLabelRangesAfterGraphChange,
  validatePageLabelRanges,
  withPageLabelRanges,
} from './pageLabels';
import { reorderPageGraphByOrder } from './structuralPageGraph';
import type { PageNode } from './types';

function page(pageId: string, index: number): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: 595,
    height: 842,
    rotation: 0,
  };
}

function baseGraph() {
  return {
    pages: [
      page('cover', 0),
      page('front-1', 1),
      page('front-2', 2),
      page('body-1', 3),
      page('body-2', 4),
      page('appendix-1', 5),
    ],
  };
}

describe('PageLabel ranges', () => {
  it('resolves cover, roman, decimal and prefixed restart ranges', () => {
    const graph = withPageLabelRanges(baseGraph(), [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
      {
        startPageId: 'appendix-1',
        style: 'decimal',
        prefix: 'A-',
        startNumber: 7,
      },
    ]);

    expect(graph.pages.map((item) => item.logicalLabel)).toEqual([
      'Cover',
      'i',
      'ii',
      '1',
      '2',
      'A-7',
    ]);
    expect(graph.pageLabelRanges?.map((range) => range.startPageId)).toEqual([
      'cover',
      'front-1',
      'body-1',
      'appendix-1',
    ]);
  });

  it('formats PDF alphabetic labels with repeated-letter blocks', () => {
    expect(formatPageLabelNumber('letters-lower', 1)).toBe('a');
    expect(formatPageLabelNumber('letters-lower', 26)).toBe('z');
    expect(formatPageLabelNumber('letters-lower', 27)).toBe('aa');
    expect(formatPageLabelNumber('letters-upper', 52)).toBe('ZZ');
    expect(formatPageLabelNumber('letters-upper', 53)).toBe('AAA');
  });

  it('rejects missing starts, duplicate starts and a first range after page 1', () => {
    const graph = baseGraph();

    expect(validatePageLabelRanges(graph, [
      { startPageId: 'front-1', style: 'roman-lower' },
    ]).valid).toBe(false);

    expect(validatePageLabelRanges(graph, [
      { startPageId: 'cover', style: 'decimal' },
      { startPageId: 'cover', style: 'roman-lower' },
    ]).valid).toBe(false);

    expect(validatePageLabelRanges(graph, [
      { startPageId: 'missing', style: 'decimal' },
    ]).valid).toBe(false);
  });

  it('lets an inserted page inherit the surrounding range and renumbers later pages', () => {
    const before = withPageLabelRanges(baseGraph(), [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
    ]);
    const inserted = page('inserted', 99);

    const rawAfter = insertPagesIntoGraph(before, 4, [inserted]);
    const after = reanchorPageLabelRangesAfterGraphChange(before, rawAfter);

    expect(after.pages.map((item) => item.logicalLabel)).toEqual([
      'Cover',
      'i',
      'ii',
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(after.pages[4]?.pageId).toBe('inserted');
  });

  it('moves a deleted range start to the first surviving page in that original range', () => {
    const before = withPageLabelRanges(baseGraph(), [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
    ]);

    const rawAfter = removePagesFromGraph(before, ['front-1']);
    const after = reanchorPageLabelRangesAfterGraphChange(before, rawAfter);

    expect(after.pageLabelRanges?.map((range) => range.startPageId)).toEqual([
      'cover',
      'front-2',
      'body-1',
    ]);
    expect(after.pages.map((item) => item.logicalLabel)).toEqual([
      'Cover',
      'i',
      '1',
      '2',
      '3',
    ]);
  });

  it('keeps range start identities through reorder and resolves labels in new physical order', () => {
    const before = withPageLabelRanges(baseGraph(), [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
    ]);

    const rawAfter = reorderPageGraphByOrder(before, [3, 4, 0, 1, 2, 5]);
    const after = reanchorPageLabelRangesAfterGraphChange(before, rawAfter);

    expect(after.pages.map((item) => item.pageId)).toEqual([
      'body-1',
      'body-2',
      'cover',
      'front-1',
      'front-2',
      'appendix-1',
    ]);
    expect(after.pageLabelRanges?.[0]?.startPageId).toBe('body-1');
    expect(after.pages[0]?.logicalLabel).toBe('1');
  });
});
