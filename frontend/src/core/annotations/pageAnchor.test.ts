import { describe, expect, it } from 'vitest';

import { createPageGraph, insertPagesIntoGraph, removePagesFromGraph } from '../pages/pageGraph';
import type { PageGraph, PageNode } from '../pages/types';
import {
  annotationForTargetPage,
  duplicateAnnotationsByPageGraph,
  normalizeAnnotationPageAnchors,
  reanchorAnnotationsAfterPageGraphChange,
  rebindAnnotationsByPageNumber,
  removeAnnotationsAnchoredToPageIds,
} from './pageAnchor';
import type { PdfAnnotation } from './types';

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

function annotation(
  id: string,
  pageNumber: number,
  pageId?: string,
): PdfAnnotation {
  return {
    id,
    type: 'highlight',
    ...(pageId ? { pageId } : {}),
    pageNumber,
    rect: { x: 10, y: 20, width: 30, height: 10 },
    data: {},
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('annotation PageId anchors', () => {
  it('upgrades legacy pageNumber-only annotations to PageId', () => {
    const anchored = normalizeAnnotationPageAnchors(
      [annotation('a1', 2)],
      graph(['p1', 'p2', 'p3']),
    );

    expect(anchored[0]).toMatchObject({
      pageId: 'p2',
      pageNumber: 2,
    });
  });

  it('derives pageNumber from PageId after reorder', () => {
    const before = graph(['p1', 'p2', 'p3']);
    const after = graph(['p3', 'p1', 'p2']);

    const remapped = reanchorAnnotationsAfterPageGraphChange(
      [annotation('a1', 2, 'p2')],
      before,
      after,
    );

    expect(remapped[0]).toMatchObject({
      pageId: 'p2',
      pageNumber: 3,
    });
  });

  it('drops annotations when their PageId is deleted', () => {
    const before = graph(['p1', 'p2', 'p3']);
    const after = removePagesFromGraph(before, ['p2']);

    const remapped = reanchorAnnotationsAfterPageGraphChange(
      [annotation('a1', 2, 'p2'), annotation('a2', 3, 'p3')],
      before,
      after,
    );

    expect(remapped.map((item) => item.id)).toEqual(['a2']);
    expect(remapped[0]).toMatchObject({ pageId: 'p3', pageNumber: 2 });
  });

  it('keeps identity and updates physical pageNumber after insertion', () => {
    const before = graph(['p1', 'p2']);
    const inserted = graph(['new']).pages[0];
    const after = insertPagesIntoGraph(before, 0, [inserted]);

    const remapped = reanchorAnnotationsAfterPageGraphChange(
      [annotation('a1', 2, 'p2')],
      before,
      after,
    );

    expect(remapped[0]).toMatchObject({ pageId: 'p2', pageNumber: 3 });
  });

  it('duplicates annotations onto the duplicate PageId', () => {
    const before = graph(['p1', 'p2']);
    const after = graph(['p1', 'p1-copy', 'p2']);

    const remapped = duplicateAnnotationsByPageGraph(
      [annotation('a1', 1, 'p1'), annotation('a2', 2, 'p2')],
      before,
      after,
      ['p1'],
      {
        createId: () => 'a1-copy',
        now: 100,
      },
    );

    expect(remapped).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'a1',
        pageId: 'p1',
        pageNumber: 1,
      }),
      expect.objectContaining({
        id: 'a1-copy',
        pageId: 'p1-copy',
        pageNumber: 2,
        createdAt: 100,
        updatedAt: 100,
      }),
      expect.objectContaining({
        id: 'a2',
        pageId: 'p2',
        pageNumber: 3,
      }),
    ]));
  });

  it('can explicitly remove annotations from a replaced page while preserving target PageId', () => {
    const before = graph(['p1', 'p2']);
    const after = graph(['p1', 'p2']);

    const remapped = removeAnnotationsAnchoredToPageIds(
      [annotation('replace-me', 1, 'p1'), annotation('keep-me', 2, 'p2')],
      before,
      after,
      ['p1'],
    );

    expect(remapped.map((item) => item.id)).toEqual(['keep-me']);
  });

  it('rebinds opaque working-copy output by current physical page number', () => {
    const after = graph(['new-1', 'new-2']);

    const rebound = rebindAnnotationsByPageNumber(
      [annotation('a1', 2, 'old-page-id')],
      after,
    );

    expect(rebound[0]).toMatchObject({
      pageId: 'new-2',
      pageNumber: 2,
    });
  });

  it('retargets pasted annotations to the selected PageId', () => {
    const retargeted = annotationForTargetPage(
      annotation('a1', 1, 'p1'),
      graph(['p1', 'p2']),
      2,
    );

    expect(retargeted).toMatchObject({
      pageId: 'p2',
      pageNumber: 2,
    });
  });
});
