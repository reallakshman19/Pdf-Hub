import { describe, expect, it } from 'vitest';

import { createPageGraph } from './pageGraph';
import {
  createBlankPageNode,
  createDuplicatePageId,
  importedPageNodes,
  movePageGraphBeforeOriginalTarget,
  pageIdsAtIndices,
  reorderPageGraphByOrder,
  replacePageGraphContent,
} from './structuralPageGraph';
import type { PageNode } from './types';

function page(pageId: string, currentIndex: number, overrides: Partial<PageNode> = {}): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
    ...overrides,
  };
}

describe('structural PageGraph transforms', () => {
  it('maps physical indices to stable PageIds', () => {
    const graph = createPageGraph([
      page('a', 0),
      page('b', 1),
      page('c', 2),
    ]);

    expect(pageIdsAtIndices(graph, [2, 0, 99])).toEqual(['c', 'a']);
  });

  it('reorders by the same old-index permutation used by PDF byte mutation', () => {
    const graph = createPageGraph([
      page('a', 0),
      page('b', 1),
      page('c', 2),
    ]);

    const next = reorderPageGraphByOrder(graph, [2, 0, 1]);

    expect(next.pages.map((item) => item.pageId)).toEqual(['c', 'a', 'b']);
    expect(next.pages.map((item) => item.currentIndex)).toEqual([0, 1, 2]);
  });

  it('mirrors movePage before-original-target semantics', () => {
    const graph = createPageGraph([
      page('a', 0),
      page('b', 1),
      page('c', 2),
      page('d', 3),
    ]);

    const next = movePageGraphBeforeOriginalTarget(graph, 0, 2);

    expect(next.pages.map((item) => item.pageId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps target identity while replacing physical page content metrics', () => {
    const graph = createPageGraph([
      page('target', 0, { logicalLabel: 'i' }),
      page('other', 1),
    ]);
    const replacement = page('donor-page', 0, {
      width: 700,
      height: 900,
      rotation: 90,
      logicalLabel: 'donor-label',
    });

    const next = replacePageGraphContent(graph, 0, replacement);

    expect(next.pages[0]).toMatchObject({
      pageId: 'target',
      originalPageNumber: 1,
      logicalLabel: 'i',
      width: 700,
      height: 900,
      rotation: 90,
    });
  });

  it('creates destination-owned imported identities without reusing donor PageIds', () => {
    const imported = importedPageNodes(
      [
        page('donor-a', 0),
        page('donor-b', 1),
      ],
      {
        documentKey: 'destination',
        commandId: 'command-1',
        kind: 'insert',
      },
    );

    expect(imported.map((item) => item.pageId)).toEqual([
      'command-1::insert::1',
      'command-1::insert::2',
    ]);
    expect(imported.every((item) => item.documentKey === 'destination')).toBe(true);
  });

  it('creates deterministic new identities for blank and duplicate pages', () => {
    expect(createDuplicatePageId('command-2', 0)).toBe('command-2::duplicate::1');
    expect(createBlankPageNode({
      documentKey: 'doc',
      commandId: 'command-3',
      width: 612,
      height: 792,
    })).toMatchObject({
      pageId: 'command-3::blank::1',
      originalPageNumber: 0,
      width: 612,
      height: 792,
      rotation: 0,
    });
  });

  it('rejects invalid full permutations', () => {
    const graph = createPageGraph([
      page('a', 0),
      page('b', 1),
      page('c', 2),
    ]);

    expect(() => reorderPageGraphByOrder(graph, [0, 0, 2])).toThrow(/valid page permutation/i);
    expect(() => reorderPageGraphByOrder(graph, [0, 1])).toThrow(/every page/i);
  });
});
