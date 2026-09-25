import { v4 as uuidv4 } from 'uuid';

import type { PageGraph, PageId, PageNode } from '../pages/types';
import type { WriterElementV2 } from './types';

export function pageIdForWriterPageIndex(
  graph: PageGraph<PageNode> | null,
  pageIndex: number,
): PageId | undefined {
  if (!graph || !Number.isInteger(pageIndex) || pageIndex < 0) return undefined;
  return graph.pages[pageIndex]?.pageId;
}

export function pageIndexForWriterPageId(
  graph: PageGraph<PageNode> | null,
  pageId: PageId | undefined,
): number | undefined {
  if (!graph || !pageId) return undefined;
  const index = graph.pages.findIndex((page) => page.pageId === pageId);
  return index >= 0 ? index : undefined;
}

export function normalizeWriterPageAnchors(
  elements: readonly WriterElementV2[],
  graph: PageGraph<PageNode> | null,
): WriterElementV2[] {
  if (!graph) return elements.map((element) => cloneElement(element));

  return elements.map((element) => {
    const pageIndex = pageIndexForWriterPageId(graph, element.pageId);
    if (pageIndex !== undefined) {
      return cloneElement(element, { pageIndex });
    }

    const pageId = pageIdForWriterPageIndex(graph, element.pageIndex);
    return cloneElement(element, pageId ? { pageId } : undefined);
  });
}

export function reanchorWriterElementsAfterPageGraphChange(
  elements: readonly WriterElementV2[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
): WriterElementV2[] {
  const anchored = normalizeWriterPageAnchors(elements, beforeGraph);

  return anchored.flatMap((element) => {
    if (!element.pageId) {
      const pageId = pageIdForWriterPageIndex(afterGraph, element.pageIndex);
      return pageId ? [cloneElement(element, { pageId })] : [];
    }

    const pageIndex = pageIndexForWriterPageId(afterGraph, element.pageId);
    return pageIndex === undefined
      ? []
      : [cloneElement(element, { pageIndex })];
  });
}

export function removeWriterElementsAnchoredToPageIds(
  elements: readonly WriterElementV2[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  removedPageIds: readonly PageId[],
): WriterElementV2[] {
  const removed = new Set(removedPageIds);
  return reanchorWriterElementsAfterPageGraphChange(
    normalizeWriterPageAnchors(elements, beforeGraph).filter(
      (element) => !element.pageId || !removed.has(element.pageId),
    ),
    beforeGraph,
    afterGraph,
  );
}

export function duplicateWriterElementsByPageGraph(
  elements: readonly WriterElementV2[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  duplicatedSourcePageIds: readonly PageId[],
  options: {
    createId?: () => string;
    now?: string;
  } = {},
): WriterElementV2[] {
  const createId = options.createId ?? uuidv4;
  const now = options.now ?? new Date().toISOString();
  const anchored = normalizeWriterPageAnchors(elements, beforeGraph);
  const duplicated = new Set(duplicatedSourcePageIds);

  const duplicatePageBySource = new Map<PageId, PageId>();
  for (const sourcePageId of duplicated) {
    const sourceIndex = afterGraph.pages.findIndex(
      (page) => page.pageId === sourcePageId,
    );
    if (sourceIndex < 0) continue;

    const candidate = afterGraph.pages[sourceIndex + 1];
    if (
      candidate
      && !beforeGraph.pages.some((page) => page.pageId === candidate.pageId)
    ) {
      duplicatePageBySource.set(sourcePageId, candidate.pageId);
    }
  }

  const originals = reanchorWriterElementsAfterPageGraphChange(
    anchored,
    beforeGraph,
    afterGraph,
  );
  const copies: WriterElementV2[] = [];

  for (const element of anchored) {
    if (!element.pageId || !duplicated.has(element.pageId)) continue;
    const duplicatePageId = duplicatePageBySource.get(element.pageId);
    if (!duplicatePageId) continue;
    const pageIndex = pageIndexForWriterPageId(afterGraph, duplicatePageId);
    if (pageIndex === undefined) continue;

    copies.push(cloneElement(element, {
      id: createId(),
      pageId: duplicatePageId,
      pageIndex,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return [...originals, ...copies];
}

export function rebindWriterElementsByPageIndex(
  elements: readonly WriterElementV2[],
  graph: PageGraph<PageNode>,
): WriterElementV2[] {
  return elements.flatMap((element) => {
    const pageId = pageIdForWriterPageIndex(graph, element.pageIndex);
    if (!pageId) return [];

    const next = cloneElement(element, { pageIndex: element.pageIndex });
    next.pageId = pageId;
    return [next];
  });
}

export function writerElementForTargetPage(
  element: WriterElementV2,
  graph: PageGraph<PageNode> | null,
  pageIndex: number,
): WriterElementV2 {
  const pageId = pageIdForWriterPageIndex(graph, pageIndex);
  const next = cloneElement(element, { pageIndex });
  if (pageId) {
    next.pageId = pageId;
  } else {
    delete next.pageId;
  }
  return next;
}

function cloneElement(
  element: WriterElementV2,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    ...element,
    ...patch,
    rect: {
      ...element.rect,
      ...(patch.rect ?? {}),
    },
    style: {
      ...element.style,
      ...(patch.style ?? {}),
    },
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        }
      : undefined,
    review: element.review ? { ...element.review } : undefined,
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
  };
}
