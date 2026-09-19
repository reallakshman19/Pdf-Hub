import type {
  PdfMutationPageLabelEntry,
} from '@/core/pdf-mutation/types';
import { physicalIndexForPageId } from './pageGraph';
import {
  sortPageLabelRanges,
  validatePageLabelRanges,
} from './pageLabels';
import type {
  PageGraph,
  PageLabelRange,
  PageNode,
} from './types';

export type PdfPageLabelPlanResult =
  | {
      ok: true;
      entries: PdfMutationPageLabelEntry[];
    }
  | {
      ok: false;
      errors: string[];
    };

export function planPdfPageLabelEntries(
  graph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
): PdfPageLabelPlanResult {
  const validation = validatePageLabelRanges(
    graph,
    ranges,
  );
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  const entries: PdfMutationPageLabelEntry[] = [];

  for (const range of sortPageLabelRanges(graph, ranges)) {
    const startPageIndex = physicalIndexForPageId(
      graph,
      range.startPageId,
    );
    if (startPageIndex < 0) {
      return {
        ok: false,
        errors: [
          `PageLabel start PageId is not in PageGraph: ${range.startPageId}`,
        ],
      };
    }

    entries.push({
      startPageIndex,
      ...(range.style !== undefined
        ? { style: range.style }
        : {}),
      ...(range.prefix !== undefined
        ? { prefix: range.prefix }
        : {}),
      ...(range.startNumber !== undefined
        ? { startNumber: range.startNumber }
        : {}),
    });
  }

  return {
    ok: true,
    entries,
  };
}
