import { physicalIndexForPageId } from './pageGraph';
import { sortPageLabelRanges, withPageLabelRanges } from './pageLabels';
import type {
  PageGraph,
  PageId,
  PageLabelRange,
  PageLabelStyle,
  PageNode,
} from './types';

export interface PageLabelRestartDraft {
  style?: PageLabelStyle;
  prefix?: string;
  startNumber?: number;
}

/**
 * Builds the complete canonical PageLabel configuration after adding or
 * replacing a restart at a stable PageId.
 *
 * Existing later ranges are preserved. When no canonical configuration exists
 * and the restart begins after page 1, physical decimal numbering is seeded at
 * page 1 so the emitted PDF number tree remains valid and predictable.
 */
export function buildPageLabelRangesForRestart(
  graph: PageGraph<PageNode>,
  startPageId: PageId,
  draft: PageLabelRestartDraft,
): PageLabelRange[] {
  const startIndex = physicalIndexForPageId(graph, startPageId);
  if (startIndex < 0) {
    throw new Error(`PageLabel restart target is not in PageGraph: ${startPageId}`);
  }

  if (
    draft.startNumber !== undefined
    && (!Number.isInteger(draft.startNumber) || draft.startNumber < 1)
  ) {
    throw new Error('PageLabel start number must be an integer >= 1');
  }

  if (draft.startNumber !== undefined && draft.style === undefined) {
    throw new Error('PageLabel start number requires a numbering style');
  }

  if (
    draft.style === undefined
    && (!draft.prefix || draft.prefix.length === 0)
  ) {
    throw new Error('PageLabel restart requires a numbering style or prefix');
  }

  const ranges = (graph.pageLabelRanges ?? []).map((range) => ({ ...range }));

  if (ranges.length === 0 && startIndex > 0) {
    const firstPageId = graph.pages[0]?.pageId;
    if (!firstPageId) throw new Error('Cannot configure PageLabels on an empty document');
    ranges.push({
      startPageId: firstPageId,
      style: 'decimal',
      startNumber: 1,
    });
  }

  const withoutTarget = ranges.filter((range) => range.startPageId !== startPageId);
  withoutTarget.push({
    startPageId,
    ...(draft.style ? { style: draft.style } : {}),
    ...(draft.prefix !== undefined ? { prefix: draft.prefix } : {}),
    ...(draft.startNumber !== undefined ? { startNumber: draft.startNumber } : {}),
  });

  return sortPageLabelRanges(graph, withoutTarget);
}

export function previewPageLabelRestart(
  graph: PageGraph<PageNode>,
  startPageId: PageId,
  draft: PageLabelRestartDraft,
): PageGraph<PageNode> {
  return withPageLabelRanges(
    graph,
    buildPageLabelRangesForRestart(graph, startPageId, draft),
  );
}
