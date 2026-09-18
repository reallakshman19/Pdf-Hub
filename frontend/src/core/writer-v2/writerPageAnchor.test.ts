import { describe, expect, it } from 'vitest';

import { createPageGraph } from '../pages/pageGraph';
import type { PageGraph, PageNode } from '../pages/types';
import type { WriterElementV2 } from './types';
import {
  duplicateWriterElementsByPageGraph,
  normalizeWriterPageAnchors,
  reanchorWriterElementsAfterPageGraphChange,
  rebindWriterElementsByPageIndex,
  removeWriterElementsAnchoredToPageIds,
  writerElementForTargetPage,
} from './writerPageAnchor';

function graph(ids: string[]): PageGraph<PageNode> {
  return createPageGraph(ids.map((pageId, index) => ({
    pageId,
    documentKey: 'doc',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: 595,
    height: 842,
    rotation: 0 as const,
  })));
}

function element(
  id: string,
  pageIndex: number,
  pageId?: string,
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc',
    ...(pageId ? { pageId } : {}),
    pageIndex,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: id,
    style: { zIndex: 1 },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('Writer PageId anchors', () => {
  it('upgrades legacy pageIndex-only elements to PageId', () => {
    const anchored = normalizeWriterPageAnchors(
      [element('writer-1', 1)],
      graph(['p1', 'p2', 'p3']),
    );

    expect(anchored[0]).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
  });

  it('derives pageIndex from PageId after reorder', () => {
    const remapped = reanchorWriterElementsAfterPageGraphChange(
      [element('writer-1', 0, 'p1')],
      graph(['p1', 'p2', 'p3']),
      graph(['p3', 'p2', 'p1']),
    );

    expect(remapped[0]).toMatchObject({
      pageId: 'p1',
      pageIndex: 2,
    });
  });

  it('drops Writer elements when their PageId disappears', () => {
    const remapped = reanchorWriterElementsAfterPageGraphChange(
      [
        element('delete-me', 1, 'p2'),
        element('keep-me', 2, 'p3'),
      ],
      graph(['p1', 'p2', 'p3']),
      graph(['p1', 'p3']),
    );

    expect(remapped.map((item) => item.id)).toEqual(['keep-me']);
    expect(remapped[0]).toMatchObject({ pageId: 'p3', pageIndex: 1 });
  });

  it('duplicates Writer elements onto the duplicate PageId', () => {
    const remapped = duplicateWriterElementsByPageGraph(
      [element('writer-1', 0, 'p1')],
      graph(['p1', 'p2']),
      graph(['p1', 'p1-copy', 'p2']),
      ['p1'],
      {
        createId: () => 'writer-copy',
        now: '2026-09-18T01:00:00.000Z',
      },
    );

    expect(remapped).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'writer-1',
        pageId: 'p1',
        pageIndex: 0,
      }),
      expect.objectContaining({
        id: 'writer-copy',
        pageId: 'p1-copy',
        pageIndex: 1,
        createdAt: '2026-09-18T01:00:00.000Z',
      }),
    ]));
  });

  it('removes content on a replaced PageId', () => {
    const remapped = removeWriterElementsAnchoredToPageIds(
      [
        element('replace-me', 0, 'p1'),
        element('keep-me', 1, 'p2'),
      ],
      graph(['p1', 'p2']),
      graph(['p1', 'p2']),
      ['p1'],
    );

    expect(remapped.map((item) => item.id)).toEqual(['keep-me']);
  });

  it('rebinds opaque document replacement by current pageIndex', () => {
    const rebound = rebindWriterElementsByPageIndex(
      [element('writer-1', 1, 'old-id')],
      graph(['new-1', 'new-2']),
    );

    expect(rebound[0]).toMatchObject({
      pageId: 'new-2',
      pageIndex: 1,
    });
  });

  it('retargets a Writer element to the selected PageId', () => {
    const retargeted = writerElementForTargetPage(
      element('writer-1', 0, 'p1'),
      graph(['p1', 'p2']),
      1,
    );

    expect(retargeted).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
  });
});
