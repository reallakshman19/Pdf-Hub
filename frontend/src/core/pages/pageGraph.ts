import type {
  PageGraph,
  PageId,
  PageLabelRange,
  PageLabelRange,
  PageNode,
  PageRotation,
} from './types';

export interface PageGraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Creates a normalized immutable-style PageGraph snapshot.
 *
 * Input nodes are cloned and currentIndex is rewritten from array order.
 * Extra fields on PageNode subtypes are preserved.
 */
export function createPageGraph<TPage extends PageNode>(
  pages: readonly TPage[],
  pageLabelRanges?: readonly PageLabelRange[],
): PageGraph<TPage> {
  return {
    pages: normalizePhysicalIndices(pages),
    ...(pageLabelRanges !== undefined
      ? { pageLabelRanges: pageLabelRanges.map((range) => ({ ...range })) }
      : {}),
  };
}

export function clonePageGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
): PageGraph<TPage> {
  return createPageGraph(graph.pages, graph.pageLabelRanges);
}

export function rekeyPageGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  documentKey: string,
): PageGraph<TPage> {
  return createPageGraph(
    graph.pages.map((page) => ({
      ...page,
      documentKey,
    } as TPage)),
    graph.pageLabelRanges,
  );
}

export function validatePageGraph(
  graph: PageGraph<PageNode>,
): PageGraphValidationResult {
  const errors: string[] = [];
  const ids = new Set<PageId>();

  graph.pages.forEach((page, index) => {
    if (!page.pageId.trim()) {
      errors.push(`page at index ${index} has an empty pageId`);
    } else if (ids.has(page.pageId)) {
      errors.push(`duplicate pageId: ${page.pageId}`);
    } else {
      ids.add(page.pageId);
    }

    if (page.currentIndex !== index) {
      errors.push(
        `page ${page.pageId || index} has currentIndex ${page.currentIndex}; expected ${index}`,
      );
    }

    if (!Number.isFinite(page.width) || page.width <= 0) {
      errors.push(`page ${page.pageId || index} has invalid width`);
    }
    if (!Number.isFinite(page.height) || page.height <= 0) {
      errors.push(`page ${page.pageId || index} has invalid height`);
    }
    if (!isPageRotation(page.rotation)) {
      errors.push(`page ${page.pageId || index} has invalid rotation`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function pageAtPhysicalIndex<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  index: number,
): TPage | null {
  if (!Number.isInteger(index) || index < 0 || index >= graph.pages.length) {
    return null;
  }
  return graph.pages[index] ?? null;
}

export function pageById<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pageId: PageId,
): TPage | null {
  return graph.pages.find((page) => page.pageId === pageId) ?? null;
}

export function physicalIndexForPageId<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pageId: PageId,
): number {
  return graph.pages.findIndex((page) => page.pageId === pageId);
}

export function pageIdAtPhysicalIndex<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  index: number,
): PageId | null {
  return pageAtPhysicalIndex(graph, index)?.pageId ?? null;
}

/**
 * Reorders selected pages while preserving every PageId.
 *
 * targetIndex is interpreted in the list AFTER moving pages have been removed.
 * The relative order of moving pages follows their current document order,
 * not the order supplied in movingPageIds.
 */
export function reorderPageGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  movingPageIds: readonly PageId[],
  targetIndex: number,
): PageGraph<TPage> {
  const movingSet = new Set(movingPageIds);
  if (movingSet.size === 0) return clonePageGraph(graph);

  const moving = graph.pages.filter((page) => movingSet.has(page.pageId));
  if (moving.length === 0) return clonePageGraph(graph);

  const remaining = graph.pages.filter((page) => !movingSet.has(page.pageId));
  const insertionIndex = clampInteger(targetIndex, 0, remaining.length);

  return createPageGraph([
    ...remaining.slice(0, insertionIndex),
    ...moving,
    ...remaining.slice(insertionIndex),
  ], graph.pageLabelRanges);
}

export function removePagesFromGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pageIds: readonly PageId[],
): PageGraph<TPage> {
  const removeSet = new Set(pageIds);
  return createPageGraph(
    graph.pages.filter((page) => !removeSet.has(page.pageId)),
    graph.pageLabelRanges,
  );
}

/**
 * Inserts new page nodes at a physical position.
 *
 * IDs must already be assigned by the caller.  ID generation belongs to the
 * admission/command layer so this pure domain function is deterministic.
 */
export function insertPagesIntoGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  targetIndex: number,
  pagesToInsert: readonly TPage[],
): PageGraph<TPage> {
  assertInsertIdsAreUnique(graph, pagesToInsert);

  const insertionIndex = clampInteger(targetIndex, 0, graph.pages.length);

  return createPageGraph([
    ...graph.pages.slice(0, insertionIndex),
    ...pagesToInsert,
    ...graph.pages.slice(insertionIndex),
  ], graph.pageLabelRanges);
}

/**
 * Duplicates selected pages in current document order.
 *
 * Each duplicate receives a new PageId from createDuplicateId.  The duplicate
 * is placed immediately after its source page.  Extra PageNode subtype fields
 * are preserved.
 */
export function duplicatePagesInGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pageIds: readonly PageId[],
  createDuplicateId: (source: TPage, duplicateOrdinal: number) => PageId,
): PageGraph<TPage> {
  const selected = new Set(pageIds);
  if (selected.size === 0) return clonePageGraph(graph);

  const existingIds = new Set(graph.pages.map((page) => page.pageId));
  let ordinal = 0;
  const next: TPage[] = [];

  for (const page of graph.pages) {
    next.push({ ...page });

    if (!selected.has(page.pageId)) continue;

    const duplicateId = createDuplicateId(page, ordinal);
    ordinal += 1;

    if (!duplicateId.trim()) {
      throw new Error('duplicate PageId must not be empty');
    }
    if (existingIds.has(duplicateId)) {
      throw new Error(`duplicate PageId already exists: ${duplicateId}`);
    }
    existingIds.add(duplicateId);

    next.push({
      ...page,
      pageId: duplicateId,
      originalPageNumber: page.originalPageNumber,
    } as TPage);
  }

  return createPageGraph(next, graph.pageLabelRanges);
}

export function rotatePagesInGraph<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pageIds: readonly PageId[],
  angle: number,
): PageGraph<TPage> {
  const normalizedAngle = normalizeRotation(angle);
  if (normalizedAngle === null) return clonePageGraph(graph);

  const selected = new Set(pageIds);
  return createPageGraph(
    graph.pages.map((page) => ({
      ...page,
      rotation: selected.has(page.pageId)
        ? normalizePageRotation(page.rotation + normalizedAngle)
        : page.rotation,
    } as TPage)),
    graph.pageLabelRanges,
  );
}

export function normalizePhysicalIndices<TPage extends PageNode>(
  pages: readonly TPage[],
): TPage[] {
  return pages.map((page, currentIndex) => ({
    ...page,
    currentIndex,
  }));
}

export function isPageRotation(value: number): value is PageRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function normalizeRotation(angle: number): PageRotation | null {
  if (!Number.isFinite(angle) || angle % 90 !== 0) return null;
  return normalizePageRotation(angle);
}

function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized as PageRotation;
}

function assertInsertIdsAreUnique<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  pagesToInsert: readonly TPage[],
): void {
  const seen = new Set(graph.pages.map((page) => page.pageId));

  for (const page of pagesToInsert) {
    if (!page.pageId.trim()) {
      throw new Error('inserted PageId must not be empty');
    }
    if (seen.has(page.pageId)) {
      throw new Error(`inserted PageId already exists: ${page.pageId}`);
    }
    seen.add(page.pageId);
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
