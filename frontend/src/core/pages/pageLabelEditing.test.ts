import { describe, expect, it } from 'vitest';

import { createPageGraph } from './pageGraph';
import {
  buildPageLabelRangesForRestart,
  previewPageLabelRestart,
} from './pageLabelEditing';
import { withPageLabelRanges } from './pageLabels';
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

function graph() {
  return createPageGraph([
    page('p1', 0),
    page('p2', 1),
    page('p3', 2),
    page('p4', 3),
    page('p5', 4),
  ]);
}

describe('PageLabel editing model', () => {
  it('seeds page 1 decimal numbering when the first restart begins later', () => {
    const ranges = buildPageLabelRangesForRestart(
      graph(),
      'p3',
      { style: 'roman-lower', startNumber: 1 },
    );

    expect(ranges).toEqual([
      { startPageId: 'p1', style: 'decimal', startNumber: 1 },
      { startPageId: 'p3', style: 'roman-lower', startNumber: 1 },
    ]);

    const preview = previewPageLabelRestart(
      graph(),
      'p3',
      { style: 'roman-lower', startNumber: 1 },
    );
    expect(preview.pages.map((item) => item.logicalLabel)).toEqual([
      '1',
      '2',
      'i',
      'ii',
      'iii',
    ]);
  });

  it('replaces a restart at the same PageId while preserving later ranges', () => {
    const configured = withPageLabelRanges(graph(), [
      { startPageId: 'p1', prefix: 'Cover' },
      { startPageId: 'p2', style: 'roman-lower' },
      { startPageId: 'p4', style: 'decimal' },
    ]);

    const ranges = buildPageLabelRangesForRestart(
      configured,
      'p2',
      {
        style: 'roman-upper',
        prefix: 'FM-',
        startNumber: 3,
      },
    );

    expect(ranges).toEqual([
      { startPageId: 'p1', prefix: 'Cover' },
      {
        startPageId: 'p2',
        style: 'roman-upper',
        prefix: 'FM-',
        startNumber: 3,
      },
      { startPageId: 'p4', style: 'decimal' },
    ]);

    const preview = previewPageLabelRestart(
      configured,
      'p2',
      {
        style: 'roman-upper',
        prefix: 'FM-',
        startNumber: 3,
      },
    );
    expect(preview.pages.map((item) => item.logicalLabel)).toEqual([
      'Cover',
      'FM-III',
      'FM-IV',
      '1',
      '2',
    ]);
  });

  it('supports prefix-only labels', () => {
    const preview = previewPageLabelRestart(
      graph(),
      'p1',
      { prefix: 'Cover' },
    );

    expect(preview.pages.map((item) => item.logicalLabel)).toEqual([
      'Cover',
      'Cover',
      'Cover',
      'Cover',
      'Cover',
    ]);
  });

  it('rejects invalid restart targets and start numbers', () => {
    expect(() =>
      buildPageLabelRangesForRestart(graph(), 'missing', { style: 'decimal' }),
    ).toThrow(/not in PageGraph/);

    expect(() =>
      buildPageLabelRangesForRestart(graph(), 'p1', {
        prefix: 'SEC-',
        startNumber: 2,
      }),
    ).toThrow(/requires a numbering style/);
  });
});
