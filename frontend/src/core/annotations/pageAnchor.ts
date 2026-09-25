import { v4 as uuidv4 } from 'uuid';

import type { PageGraph, PageId, PageNode } from '../pages/types';
import type { PdfAnnotation } from './types';

export function pageIdForAnnotationPageNumber(
  graph: PageGraph<PageNode> | null,
  pageNumber: number,
): PageId | undefined {
  if (!graph || !Number.isInteger(pageNumber) || pageNumber < 1) return undefined;
  return graph.pages[pageNumber - 1]?.pageId;
}

export function pageNumberForAnnotationPageId(
  graph: PageGraph<PageNode> | null,
  pageId: PageId | undefined,
): number | undefined {
  if (!graph || !pageId) return undefined;
  const index = graph.pages.findIndex((page) => page.pageId === pageId);
  return index >= 0 ? index + 1 : undefined;
}

/**
 * Upgrades legacy pageNumber-only annotations and keeps pageNumber derived from
 * PageId when a valid anchor already exists.
 */
export function normalizeAnnotationPageAnchors(
  annotations: readonly PdfAnnotation[],
  graph: PageGraph<PageNode> | null,
): PdfAnnotation[] {
  if (!graph) return annotations.map((annotation) => cloneAnnotation(annotation));

  return annotations.map((annotation) => {
    const pageNumber = pageNumberForAnnotationPageId(graph, annotation.pageId);
    if (pageNumber !== undefined) {
      return cloneAnnotation(annotation, {
        pageNumber,
      });
    }

    const pageId = pageIdForAnnotationPageNumber(graph, annotation.pageNumber);
    return cloneAnnotation(annotation, pageId ? { pageId } : undefined);
  });
}

/**
 * Re-resolves physical pageNumber after a structural PageGraph mutation.
 * Canonically anchored annotations whose PageId disappeared are removed.
 */
export function rebindAnnotationsByPageNumber(
  annotations: readonly PdfAnnotation[],
  graph: PageGraph<PageNode>,
): PdfAnnotation[] {
  return annotations.flatMap((annotation) => {
    const pageId = pageIdForAnnotationPageNumber(graph, annotation.pageNumber);
    if (!pageId) return [];

    const next = cloneAnnotation(annotation, {
      pageNumber: annotation.pageNumber,
    });
    next.pageId = pageId;
    return [next];
  });
}

export function reanchorAnnotationsAfterPageGraphChange(
  annotations: readonly PdfAnnotation[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
): PdfAnnotation[] {
  const anchored = normalizeAnnotationPageAnchors(annotations, beforeGraph);

  return anchored.flatMap((annotation) => {
    if (!annotation.pageId) {
      const pageId = pageIdForAnnotationPageNumber(afterGraph, annotation.pageNumber);
      return pageId
        ? [cloneAnnotation(annotation, { pageId })]
        : [];
    }

    const pageNumber = pageNumberForAnnotationPageId(afterGraph, annotation.pageId);
    return pageNumber === undefined
      ? []
      : [cloneAnnotation(annotation, { pageNumber })];
  });
}

export function removeAnnotationsAnchoredToPageIds(
  annotations: readonly PdfAnnotation[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  removedPageIds: readonly PageId[],
): PdfAnnotation[] {
  const removed = new Set(removedPageIds);
  return reanchorAnnotationsAfterPageGraphChange(
    normalizeAnnotationPageAnchors(annotations, beforeGraph).filter(
      (annotation) => !annotation.pageId || !removed.has(annotation.pageId),
    ),
    beforeGraph,
    afterGraph,
  );
}

export function duplicateAnnotationsByPageGraph(
  annotations: readonly PdfAnnotation[],
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  duplicatedSourcePageIds: readonly PageId[],
  options: {
    createId?: () => string;
    now?: number;
  } = {},
): PdfAnnotation[] {
  const createId = options.createId ?? uuidv4;
  const now = options.now ?? Date.now();
  const anchored = normalizeAnnotationPageAnchors(annotations, beforeGraph);
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

  const originals = reanchorAnnotationsAfterPageGraphChange(
    anchored,
    beforeGraph,
    afterGraph,
  );
  const copies: PdfAnnotation[] = [];

  for (const annotation of anchored) {
    if (!annotation.pageId || !duplicated.has(annotation.pageId)) continue;
    const duplicatePageId = duplicatePageBySource.get(annotation.pageId);
    if (!duplicatePageId) continue;
    const pageNumber = pageNumberForAnnotationPageId(afterGraph, duplicatePageId);
    if (pageNumber === undefined) continue;

    copies.push(cloneAnnotation(annotation, {
      id: createId(),
      pageId: duplicatePageId,
      pageNumber,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return [...originals, ...copies];
}

export function annotationForTargetPage(
  annotation: PdfAnnotation,
  graph: PageGraph<PageNode> | null,
  pageNumber: number,
): PdfAnnotation {
  const pageId = pageIdForAnnotationPageNumber(graph, pageNumber);
  const next = cloneAnnotation(annotation, { pageNumber });
  if (pageId) {
    next.pageId = pageId;
  } else {
    delete next.pageId;
  }
  return next;
}

function cloneAnnotation(
  annotation: PdfAnnotation,
  patch: Partial<PdfAnnotation> = {},
): PdfAnnotation {
  return {
    ...annotation,
    ...patch,
    rect: { ...annotation.rect },
    data: { ...annotation.data },
  };
}
