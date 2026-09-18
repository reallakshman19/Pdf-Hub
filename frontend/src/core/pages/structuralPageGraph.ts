import {
  clonePageGraph,
  createPageGraph,
} from './pageGraph';
import type {
  PageGraph,
  PageId,
  PageNode,
} from './types';

export type ImportedPageKind = 'insert' | 'blank' | 'duplicate' | 'merge';

export function pageIdsAtIndices(
  graph: PageGraph<PageNode>,
  indices: readonly number[],
): PageId[] {
  return indices.flatMap((index) => {
    const page = graph.pages[index];
    return page ? [page.pageId] : [];
  });
}

export function reorderPageGraphByOrder(
  graph: PageGraph<PageNode>,
  order: readonly number[],
): PageGraph<PageNode> {
  if (order.length !== graph.pages.length) {
    throw new Error('PageGraph reorder must include every page exactly once');
  }

  const sorted = [...order].sort((a, b) => a - b);
  for (let index = 0; index < graph.pages.length; index += 1) {
    if (sorted[index] !== index) {
      throw new Error('PageGraph reorder is not a valid page permutation');
    }
  }

  const reordered = order.map((oldIndex) => {
    const page = graph.pages[oldIndex];
    if (!page) {
      throw new Error(`PageGraph reorder references missing page index ${oldIndex}`);
    }
    return page;
  });

  return createPageGraph(reordered, graph.pageLabelRanges);
}

/**
 * Mirrors PdfEditAdapter.movePage(): move one page immediately before the
 * page that occupied targetIndex in the original document. If the target is
 * the moving page itself, the adapter appends it.
 */
export function movePageGraphBeforeOriginalTarget(
  graph: PageGraph<PageNode>,
  fromIndex: number,
  targetIndex: number,
): PageGraph<PageNode> {
  const moving = graph.pages[fromIndex];
  if (!moving) return clonePageGraph(graph);

  const target = graph.pages[targetIndex];
  const remaining = graph.pages.filter((_, index) => index !== fromIndex);
  const insertionIndex = target
    ? remaining.findIndex((page) => page.pageId === target.pageId)
    : -1;
  const at = insertionIndex >= 0 ? insertionIndex : remaining.length;

  return createPageGraph([
    ...remaining.slice(0, at),
    moving,
    ...remaining.slice(at),
  ], graph.pageLabelRanges);
}

export function importedPageNodes(
  sourcePages: readonly PageNode[],
  options: {
    documentKey: string;
    commandId: string;
    kind: Exclude<ImportedPageKind, 'blank' | 'duplicate'>;
    ordinalOffset?: number;
  },
): PageNode[] {
  const offset = options.ordinalOffset ?? 0;
  return sourcePages.map((source, index) => ({
    ...source,
    pageId: createStructuralPageId(
      options.commandId,
      options.kind,
      offset + index,
    ),
    documentKey: options.documentKey,
    currentIndex: index,
  }));
}

export function createBlankPageNode(
  options: {
    documentKey: string;
    commandId: string;
    width: number;
    height: number;
  },
): PageNode {
  return {
    pageId: createStructuralPageId(options.commandId, 'blank', 0),
    documentKey: options.documentKey,
    originalPageNumber: 0,
    currentIndex: 0,
    width: options.width,
    height: options.height,
    rotation: 0,
  };
}

export function replacePageGraphContent(
  graph: PageGraph<PageNode>,
  targetIndex: number,
  replacement: PageNode,
): PageGraph<PageNode> {
  const target = graph.pages[targetIndex];
  if (!target) return clonePageGraph(graph);

  return createPageGraph(
    graph.pages.map((page, index) =>
      index === targetIndex
        ? {
            ...page,
            width: replacement.width,
            height: replacement.height,
            rotation: replacement.rotation,
          }
        : page,
    ),
    graph.pageLabelRanges,
  );
}

export function createDuplicatePageId(
  commandId: string,
  ordinal: number,
): PageId {
  return createStructuralPageId(commandId, 'duplicate', ordinal);
}

export function createStructuralPageId(
  commandId: string,
  kind: ImportedPageKind,
  ordinal: number,
): PageId {
  if (!commandId.trim()) throw new Error('Structural PageId requires a command ID');
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new Error('Structural PageId ordinal must be a non-negative integer');
  }
  return `${commandId}::${kind}::${ordinal + 1}`;
}
