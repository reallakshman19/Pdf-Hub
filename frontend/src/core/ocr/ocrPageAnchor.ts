import type { PageGraph, PageId, PageNode, PageRotation } from '../pages/types';
import type { PdfRect } from '../writer-v2/types';
import type { OcrCorrection } from './ocrCorrections';
import type { OcrRegion } from './ocrRegionModel';
import type {
  OcrAnyBlock,
  OcrDiagnostic,
  OcrDocumentResult,
  OcrPageResult,
  OcrReviewFocus,
} from './types';

export interface OcrPageAnchoredState {
  documentFingerprint: string | null;
  result: OcrDocumentResult | null;
  corrections: OcrCorrection[];
  regions: OcrRegion[];
  selectedPageIndexes: number[];
  reviewFocus: OcrReviewFocus | null;
}

export interface OcrPageGraphChangeOptions {
  /**
   * Drop OCR state on these pages even if the PageId survives.
   * Used when REPLACE_PAGE swaps the underlying content.
   */
  dropPageIds?: readonly PageId[];
}

export function pageIdForOcrPageIndex(
  graph: PageGraph<PageNode> | null,
  pageIndex: number,
): PageId | undefined {
  if (!graph || !Number.isInteger(pageIndex) || pageIndex < 0) return undefined;
  return graph.pages[pageIndex]?.pageId;
}

export function pageIndexForOcrPageId(
  graph: PageGraph<PageNode> | null,
  pageId: PageId | undefined,
): number | undefined {
  if (!graph || !pageId) return undefined;
  const index = graph.pages.findIndex((page) => page.pageId === pageId);
  return index >= 0 ? index : undefined;
}

export function normalizeOcrPageAnchoredState(
  state: OcrPageAnchoredState,
  graph: PageGraph<PageNode> | null,
): OcrPageAnchoredState {
  if (!graph) return cloneOcrPageAnchoredState(state);

  const result = state.result
    ? normalizeOcrDocumentResultPageAnchors(state.result, graph)
    : null;

  const corrections = state.corrections.flatMap((correction) => {
    const anchored = normalizePageIndexAnchor(
      correction.pageId,
      correction.pageIndex,
      graph,
    );
    if (!anchored) return [];
    return [{
      ...correction,
      pageId: anchored.pageId,
      pageIndex: anchored.pageIndex,
      bbox: { ...correction.bbox },
    }];
  });

  const regions = state.regions.flatMap((region) => {
    const anchored = normalizePageIndexAnchor(
      region.pageId,
      region.pageIndex,
      graph,
    );
    if (!anchored) return [];
    return [{
      ...region,
      pageId: anchored.pageId,
      pageIndex: anchored.pageIndex,
      bbox: { ...region.bbox },
    }];
  });

  const reviewFocus = state.reviewFocus
    ? normalizeOcrReviewFocus(state.reviewFocus, graph)
    : null;

  const selectedPageIds = state.selectedPageIndexes.flatMap((pageIndex) => {
    const pageId = pageIdForOcrPageIndex(graph, pageIndex);
    return pageId ? [pageId] : [];
  });

  return {
    documentFingerprint: state.documentFingerprint,
    result,
    corrections,
    regions,
    selectedPageIndexes: pageIndexesForIds(graph, selectedPageIds),
    reviewFocus,
  };
}

export function normalizeOcrDocumentResultPageAnchors(
  document: OcrDocumentResult,
  graph: PageGraph<PageNode>,
): OcrDocumentResult {
  const pages = document.pages.flatMap((page) => {
    const fallbackIndex = page.pageIndex ?? page.pageNumber - 1;
    const anchored = normalizePageIndexAnchor(page.pageId, fallbackIndex, graph);
    if (!anchored) return [];

    return [cloneOcrPageResult(page, {
      pageId: anchored.pageId,
      pageIndex: anchored.pageIndex,
      pageNumber: anchored.pageIndex + 1,
    })];
  });

  return {
    ...document,
    pages,
    diagnostics: document.diagnostics.map((diagnostic) =>
      normalizeDiagnosticAnchor(diagnostic, graph),
    ),
  };
}

export function reanchorOcrPageStateAfterPageGraphChange(
  state: OcrPageAnchoredState,
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  options: OcrPageGraphChangeOptions = {},
): OcrPageAnchoredState {
  const before = normalizeOcrPageAnchoredState(state, beforeGraph);
  const dropped = new Set(options.dropPageIds ?? []);
  const survivingPageIds = new Set(afterGraph.pages.map((page) => page.pageId));

  const result = before.result
    ? {
        ...before.result,
        pages: before.result.pages.flatMap((page) => {
          if (!page.pageId || dropped.has(page.pageId) || !survivingPageIds.has(page.pageId)) {
            return [];
          }

          const nextIndex = pageIndexForOcrPageId(afterGraph, page.pageId);
          if (nextIndex === undefined) return [];

          const beforeNode = pageNodeById(beforeGraph, page.pageId);
          const afterNode = pageNodeById(afterGraph, page.pageId);
          if (!beforeNode || !afterNode) return [];

          const rotationDelta = rotationDeltaDegrees(
            beforeNode.rotation,
            afterNode.rotation,
          );

          return [
            transformOcrPageResult(
              page,
              page.pageId,
              nextIndex,
              rotationDelta,
              effectivePageWidth(beforeNode),
              effectivePageHeight(beforeNode),
            ),
          ];
        }),
        diagnostics: before.result.diagnostics.flatMap((diagnostic) => {
          if (!diagnostic.pageId) {
            return [{ ...diagnostic }];
          }
          if (dropped.has(diagnostic.pageId) || !survivingPageIds.has(diagnostic.pageId)) {
            return [];
          }
          const nextIndex = pageIndexForOcrPageId(afterGraph, diagnostic.pageId);
          return nextIndex === undefined
            ? []
            : [{ ...diagnostic, pageIndex: nextIndex }];
        }),
      }
    : null;

  const corrections = before.corrections.flatMap((correction) =>
    transformIndependentAnchor(
      correction,
      beforeGraph,
      afterGraph,
      dropped,
      (value, rotationDelta, beforePage) => ({
        ...value,
        bbox: transformRectForRotation(
          value.bbox,
          effectivePageWidth(beforePage),
          effectivePageHeight(beforePage),
          rotationDelta,
        ),
      }),
    ),
  );

  const regions = before.regions.flatMap((region) =>
    transformIndependentAnchor(
      region,
      beforeGraph,
      afterGraph,
      dropped,
      (value, rotationDelta, beforePage) => ({
        ...value,
        bbox: transformRectForRotation(
          value.bbox,
          effectivePageWidth(beforePage),
          effectivePageHeight(beforePage),
          rotationDelta,
        ),
      }),
    ),
  );

  const reviewFocus = before.reviewFocus
    ? transformReviewFocus(
        before.reviewFocus,
        beforeGraph,
        afterGraph,
        dropped,
      )
    : null;

  const selectedIds = before.selectedPageIndexes.flatMap((pageIndex) => {
    const pageId = pageIdForOcrPageIndex(beforeGraph, pageIndex);
    return pageId && !dropped.has(pageId) ? [pageId] : [];
  });

  return {
    documentFingerprint: before.documentFingerprint,
    result,
    corrections,
    regions,
    selectedPageIndexes: pageIndexesForIds(afterGraph, selectedIds),
    reviewFocus,
  };
}

export function rekeyOcrPageAnchoredState(
  state: OcrPageAnchoredState,
  documentFingerprint: string,
): OcrPageAnchoredState {
  return {
    documentFingerprint,
    result: state.result
      ? {
          ...state.result,
          documentFingerprint,
        }
      : null,
    corrections: state.corrections.map((correction) => ({
      ...correction,
      documentFingerprint,
      bbox: { ...correction.bbox },
    })),
    regions: state.regions.map((region) => ({
      ...region,
      documentFingerprint,
      bbox: { ...region.bbox },
    })),
    selectedPageIndexes: [...state.selectedPageIndexes],
    reviewFocus: state.reviewFocus
      ? {
          ...state.reviewFocus,
          documentFingerprint,
          bbox: { ...state.reviewFocus.bbox },
        }
      : null,
  };
}

export function cloneOcrPageAnchoredState(
  state: OcrPageAnchoredState,
): OcrPageAnchoredState {
  return {
    documentFingerprint: state.documentFingerprint,
    result: state.result ? cloneOcrDocumentResult(state.result) : null,
    corrections: state.corrections.map((correction) => ({
      ...correction,
      bbox: { ...correction.bbox },
    })),
    regions: state.regions.map((region) => ({
      ...region,
      bbox: { ...region.bbox },
    })),
    selectedPageIndexes: [...state.selectedPageIndexes],
    reviewFocus: state.reviewFocus
      ? {
          ...state.reviewFocus,
          bbox: { ...state.reviewFocus.bbox },
        }
      : null,
  };
}

function normalizeOcrReviewFocus(
  focus: OcrReviewFocus,
  graph: PageGraph<PageNode>,
): OcrReviewFocus | null {
  const anchored = normalizePageIndexAnchor(focus.pageId, focus.pageIndex, graph);
  if (!anchored) return null;

  return {
    ...focus,
    pageId: anchored.pageId,
    pageIndex: anchored.pageIndex,
    bbox: { ...focus.bbox },
  };
}

function transformReviewFocus(
  focus: OcrReviewFocus,
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  dropped: ReadonlySet<PageId>,
): OcrReviewFocus | null {
  if (!focus.pageId || dropped.has(focus.pageId)) return null;
  const beforePage = pageNodeById(beforeGraph, focus.pageId);
  const afterPage = pageNodeById(afterGraph, focus.pageId);
  if (!beforePage || !afterPage) return null;

  const nextIndex = pageIndexForOcrPageId(afterGraph, focus.pageId);
  if (nextIndex === undefined) return null;

  const delta = rotationDeltaDegrees(beforePage.rotation, afterPage.rotation);
  return {
    ...focus,
    pageIndex: nextIndex,
    bbox: transformRectForRotation(
      focus.bbox,
      effectivePageWidth(beforePage),
      effectivePageHeight(beforePage),
      delta,
    ),
  };
}

function transformOcrPageResult(
  page: OcrPageResult,
  pageId: PageId,
  pageIndex: number,
  rotationDelta: number,
  fallbackWidth = 0,
  fallbackHeight = 0,
): OcrPageResult {
  const width =
    typeof page.width === 'number' && page.width > 0
      ? page.width
      : fallbackWidth;
  const height =
    typeof page.height === 'number' && page.height > 0
      ? page.height
      : fallbackHeight;
  const rotateRect = (rect: PdfRect) =>
    transformRectForRotation(rect, width, height, rotationDelta);
  const swapsDimensions = rotationDelta === 90 || rotationDelta === 270;

  const words = page.words?.map((word) => ({
    ...word,
    pageId,
    pageIndex,
    bbox: rotateRect(word.bbox),
  }));

  const lines = page.lines?.map((line) => ({
    ...line,
    pageId,
    pageIndex,
    bbox: rotateRect(line.bbox),
    rect: line.rect ? rotateRect(line.rect) : undefined,
    wordIds: [...line.wordIds],
  }));

  const blocks = page.blocks.map((block) => {
    const common = {
      ...block,
      pageId,
      pageIndex,
      bbox: block.bbox ? rotateRect(block.bbox) : undefined,
      rect: rotateRect(block.rect),
      lineIds: block.lineIds ? [...block.lineIds] : undefined,
      wordIds: block.wordIds ? [...block.wordIds] : undefined,
    };

    if (block.type !== 'table') {
      return common;
    }

    return {
      ...common,
      rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({
          ...cell,
          bbox: rotateRect(cell.bbox),
        })),
      })),
    };
  }) as OcrAnyBlock[];

  return {
    ...page,
    pageId,
    pageIndex,
    pageNumber: pageIndex + 1,
    width: swapsDimensions ? height : width,
    height: swapsDimensions ? width : height,
    orientationDeg: page.orientationDeg,
    words,
    lines,
    blocks,
    diagnostics: page.diagnostics?.map((diagnostic) => ({
      ...diagnostic,
      pageId,
      pageIndex,
    })),
  };
}

function cloneOcrPageResult(
  page: OcrPageResult,
  patch: Pick<OcrPageResult, 'pageId' | 'pageIndex' | 'pageNumber'>,
): OcrPageResult {
  return transformOcrPageResult(
    {
      ...page,
      pageId: patch.pageId,
      pageIndex: patch.pageIndex,
      pageNumber: patch.pageNumber,
    },
    patch.pageId as PageId,
    patch.pageIndex ?? patch.pageNumber - 1,
    0,
  );
}

function cloneOcrDocumentResult(document: OcrDocumentResult): OcrDocumentResult {
  return {
    ...document,
    pages: document.pages.map((page) => {
      const pageId = page.pageId;
      if (pageId) {
        return transformOcrPageResult(
          page,
          pageId,
          page.pageIndex ?? page.pageNumber - 1,
          0,
        );
      }

      return {
        ...page,
        words: page.words?.map((word) => ({
          ...word,
          bbox: { ...word.bbox },
        })),
        lines: page.lines?.map((line) => ({
          ...line,
          bbox: { ...line.bbox },
          rect: line.rect ? { ...line.rect } : undefined,
          wordIds: [...line.wordIds],
        })),
        blocks: page.blocks.map((block) => ({
          ...block,
          bbox: block.bbox ? { ...block.bbox } : undefined,
          rect: { ...block.rect },
          lineIds: block.lineIds ? [...block.lineIds] : undefined,
          wordIds: block.wordIds ? [...block.wordIds] : undefined,
          rows: block.rows?.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              bbox: { ...cell.bbox },
            })),
          })),
        })) as OcrAnyBlock[],
        diagnostics: page.diagnostics?.map((diagnostic) => ({ ...diagnostic })),
      };
    }),
    diagnostics: document.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

function normalizeDiagnosticAnchor(
  diagnostic: OcrDiagnostic,
  graph: PageGraph<PageNode>,
): OcrDiagnostic {
  const pageIndex =
    diagnostic.pageId
      ? pageIndexForOcrPageId(graph, diagnostic.pageId)
      : diagnostic.pageIndex;
  if (pageIndex === undefined) return { ...diagnostic };

  const pageId = pageIdForOcrPageIndex(graph, pageIndex);
  return {
    ...diagnostic,
    ...(pageId ? { pageId } : {}),
    pageIndex,
  };
}

function normalizePageIndexAnchor(
  pageId: PageId | undefined,
  pageIndex: number,
  graph: PageGraph<PageNode>,
): { pageId: PageId; pageIndex: number } | null {
  const resolvedIndex = pageIndexForOcrPageId(graph, pageId);
  if (resolvedIndex !== undefined && pageId) {
    return { pageId, pageIndex: resolvedIndex };
  }

  const resolvedPageId = pageIdForOcrPageIndex(graph, pageIndex);
  return resolvedPageId
    ? { pageId: resolvedPageId, pageIndex }
    : null;
}

function pageIndexesForIds(
  graph: PageGraph<PageNode>,
  pageIds: readonly PageId[],
): number[] {
  return Array.from(new Set(pageIds.flatMap((pageId) => {
    const pageIndex = pageIndexForOcrPageId(graph, pageId);
    return pageIndex === undefined ? [] : [pageIndex];
  }))).sort((a, b) => a - b);
}

function pageNodeById(
  graph: PageGraph<PageNode>,
  pageId: PageId,
): PageNode | null {
  return graph.pages.find((page) => page.pageId === pageId) ?? null;
}

function transformIndependentAnchor<T extends {
  pageId?: PageId;
  pageIndex: number;
}>(
  value: T,
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  dropped: ReadonlySet<PageId>,
  transform: (
    value: T,
    rotationDelta: number,
    beforePage: PageNode,
    afterPage: PageNode,
  ) => T,
): T[] {
  if (!value.pageId || dropped.has(value.pageId)) return [];
  const beforePage = pageNodeById(beforeGraph, value.pageId);
  const afterPage = pageNodeById(afterGraph, value.pageId);
  if (!beforePage || !afterPage) return [];

  const pageIndex = pageIndexForOcrPageId(afterGraph, value.pageId);
  if (pageIndex === undefined) return [];

  return [{
    ...transform(
      value,
      rotationDeltaDegrees(beforePage.rotation, afterPage.rotation),
      beforePage,
      afterPage,
    ),
    pageIndex,
  }];
}

function effectivePageWidth(page: PageNode): number {
  return page.rotation === 90 || page.rotation === 270
    ? page.height
    : page.width;
}

function effectivePageHeight(page: PageNode): number {
  return page.rotation === 90 || page.rotation === 270
    ? page.width
    : page.height;
}

function rotationDeltaDegrees(
  before: PageRotation,
  after: PageRotation,
): number {
  return normalizeDegrees(after - before);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Rotates a bottom-left-origin PDF rectangle clockwise by a page rotation delta.
 */
export function transformRectForRotation(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
  rotationDelta: number,
): PdfRect {
  const angle = normalizeDegrees(rotationDelta);

  if (angle === 90) {
    return {
      x: rect.y,
      y: pageWidth - rect.x - rect.width,
      width: rect.height,
      height: rect.width,
    };
  }

  if (angle === 180) {
    return {
      x: pageWidth - rect.x - rect.width,
      y: pageHeight - rect.y - rect.height,
      width: rect.width,
      height: rect.height,
    };
  }

  if (angle === 270) {
    return {
      x: pageHeight - rect.y - rect.height,
      y: rect.x,
      width: rect.height,
      height: rect.width,
    };
  }

  return { ...rect };
}
