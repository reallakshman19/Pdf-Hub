import { describe, expect, it } from 'vitest';

import {
  clonePageGraph,
  createPageGraph,
  duplicatePagesInGraph,
  insertPagesIntoGraph,
  pageAtPhysicalIndex,
  pageById,
  pageIdAtPhysicalIndex,
  physicalIndexForPageId,
  removePagesFromGraph,
  rekeyPageGraph,
  reorderPageGraph,
  rotatePagesInGraph,
  validatePageGraph,
} from './pageGraph';
import type { PageNode } from './types';

function page(
  pageId: string,
  currentIndex: number,
  overrides: Partial<PageNode> = {},
): PageNode {
  return {
    pageId,
    documentKey: 'doc-1',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
    ...overrides,
  };
}

describe('PageGraph', () => {
  it('normalizes physical indices without changing identity', () => {
    const graph = createPageGraph([
      page('page-a', 99),
      page('page-b', 99),
      page('page-c', 99),
    ]);

    expect(graph.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'page-b',
      'page-c',
    ]);
    expect(graph.pages.map((item) => item.currentIndex)).toEqual([0, 1, 2]);
    expect(validatePageGraph(graph)).toEqual({ valid: true, errors: [] });
  });

  it('resolves PageId and physical-index lookups independently', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
      page('page-c', 2),
    ]);

    expect(pageById(graph, 'page-b')?.originalPageNumber).toBe(2);
    expect(physicalIndexForPageId(graph, 'page-b')).toBe(1);
    expect(pageAtPhysicalIndex(graph, 2)?.pageId).toBe('page-c');
    expect(pageIdAtPhysicalIndex(graph, 0)).toBe('page-a');
    expect(pageAtPhysicalIndex(graph, 99)).toBeNull();
    expect(pageIdAtPhysicalIndex(graph, -1)).toBeNull();
  });

  it('reorders pages while preserving unaffected and moved PageIds', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
      page('page-c', 2),
      page('page-d', 3),
      page('page-e', 4),
    ]);

    const next = reorderPageGraph(graph, ['page-b', 'page-d'], 3);

    expect(next.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'page-c',
      'page-e',
      'page-b',
      'page-d',
    ]);
    expect(next.pages.map((item) => item.currentIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(graph.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'page-b',
      'page-c',
      'page-d',
      'page-e',
    ]);
  });

  it('inserts new pages with new identities and keeps existing identities stable', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
      page('page-c', 2),
    ]);

    const inserted = page('inserted-1', 99, {
      documentKey: 'doc-1',
      originalPageNumber: 0,
      width: 612,
      height: 792,
    });

    const next = insertPagesIntoGraph(graph, 1, [inserted]);

    expect(next.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'inserted-1',
      'page-b',
      'page-c',
    ]);
    expect(next.pages[2]?.pageId).toBe('page-b');
    expect(next.pages[2]?.currentIndex).toBe(2);
  });

  it('rejects inserted PageId collisions', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
    ]);

    expect(() =>
      insertPagesIntoGraph(graph, 1, [
        page('page-a', 99, { originalPageNumber: 0 }),
      ]),
    ).toThrow(/already exists/i);
  });

  it('removes pages by PageId and reindexes only physical position', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
      page('page-c', 2),
      page('page-d', 3),
    ]);

    const next = removePagesFromGraph(graph, ['page-b', 'page-d']);

    expect(next.pages.map((item) => item.pageId)).toEqual(['page-a', 'page-c']);
    expect(next.pages.map((item) => item.currentIndex)).toEqual([0, 1]);
    expect(next.pages[1]?.originalPageNumber).toBe(3);
  });

  it('duplicates pages with caller-supplied new PageIds', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1),
      page('page-c', 2),
    ]);

    const next = duplicatePagesInGraph(
      graph,
      ['page-b'],
      (source, ordinal) => `${source.pageId}:copy:${ordinal + 1}`,
    );

    expect(next.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'page-b',
      'page-b:copy:1',
      'page-c',
    ]);
    expect(next.pages[2]?.originalPageNumber).toBe(2);
    expect(new Set(next.pages.map((item) => item.pageId)).size).toBe(4);
  });

  it('rotates by PageId without changing physical order or identity', () => {
    const graph = createPageGraph([
      page('page-a', 0),
      page('page-b', 1, { rotation: 90 }),
      page('page-c', 2),
    ]);

    const next = rotatePagesInGraph(graph, ['page-b'], 90);

    expect(next.pages.map((item) => item.pageId)).toEqual([
      'page-a',
      'page-b',
      'page-c',
    ]);
    expect(next.pages[1]?.rotation).toBe(180);
    expect(next.pages.map((item) => item.currentIndex)).toEqual([0, 1, 2]);
  });

  it('keeps logicalLabel distinct from identity and physical position', () => {
    const graph = createPageGraph([
      page('cover-id', 0, { logicalLabel: 'Cover' }),
      page('front-1', 1, { logicalLabel: 'i' }),
      page('body-1', 2, { logicalLabel: '1' }),
    ]);

    const next = reorderPageGraph(graph, ['body-1'], 0);

    expect(next.pages[0]).toMatchObject({
      pageId: 'body-1',
      currentIndex: 0,
      logicalLabel: '1',
    });
    expect(pageById(next, 'cover-id')).toMatchObject({
      currentIndex: 1,
      logicalLabel: 'Cover',
    });
  });

  it('preserves canonical PageLabel ranges through clone, rekey and neutral transforms', () => {
    const graph = createPageGraph(
      [
        page('page-a', 0),
        page('page-b', 1),
        page('page-c', 2),
      ],
      [
        { startPageId: 'page-a', prefix: 'Cover' },
        { startPageId: 'page-b', style: 'decimal' },
      ],
    );

    const cloned = clonePageGraph(graph);
    const rekeyed = rekeyPageGraph(cloned, 'doc-2');
    const rotated = rotatePagesInGraph(rekeyed, ['page-b'], 90);

    expect(rotated.pageLabelRanges).toEqual([
      { startPageId: 'page-a', prefix: 'Cover' },
      { startPageId: 'page-b', style: 'decimal' },
    ]);
    expect(rotated.pageLabelRanges).not.toBe(graph.pageLabelRanges);
    expect(rotated.pages.every((item) => item.documentKey === 'doc-2')).toBe(true);
  });

  it('reports duplicate IDs and broken physical-index invariants', () => {
    const invalid = {
      pages: [
        page('duplicate', 0),
        page('duplicate', 7),
      ],
    };

    const result = validatePageGraph(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.some((message) => message.includes('duplicate pageId'))).toBe(true);
    expect(result.errors.some((message) => message.includes('expected 1'))).toBe(true);
  });
});
