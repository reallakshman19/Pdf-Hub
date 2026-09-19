import {
  clearPageLabelRanges,
  validatePageLabelRanges,
  withPageLabelRanges,
} from '@/core/pages/pageLabels';
import { writePdfPageLabels } from '@/core/pages/pdfPageLabelWriter';
import { planPdfPageLabelEntries } from '@/core/pages/pageLabelMutationPlan';
import type { PdfMutationPageLabelEntry } from '@/core/pdf-mutation/types';
import type {
  PageGraph,
  PageLabelRange,
  PageNode,
} from '@/core/pages/types';

export type PageLabelCommandPlanResult =
  | {
      ok: true;
      pageGraph: PageGraph<PageNode>;
      entries: PdfMutationPageLabelEntry[];
    }
  | {
      ok: false;
      errors: string[];
    };

export function planPageLabelCommandMutation(
  pageGraph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
): PageLabelCommandPlanResult {
  const normalizedRanges = ranges.map(
    (range) => ({ ...range }),
  );
  const validation = validatePageLabelRanges(
    pageGraph,
    normalizedRanges,
  );

  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  const nextPageGraph =
    normalizedRanges.length === 0
      ? clearPageLabelRanges(pageGraph)
      : withPageLabelRanges(
          pageGraph,
          normalizedRanges,
        );

  const plan = planPdfPageLabelEntries(
    nextPageGraph,
    nextPageGraph.pageLabelRanges ?? [],
  );
  if (!plan.ok) {
    return plan;
  }

  return {
    ok: true,
    pageGraph: nextPageGraph,
    entries: plan.entries,
  };
}

export type PageLabelCommandMutationResult =
  | {
      ok: true;
      bytes: Uint8Array;
      pageGraph: PageGraph<PageNode>;
    }
  | {
      ok: false;
      errors: string[];
    };

/**
 * Shared mutation unit for the canonical SET_PAGE_LABELS payload.
 *
 * Session dispatch, structural PageLabels rewrites, and headless/API execution
 * all use this function so there is one validation/derivation/writer path.
 */
export async function executePageLabelCommandMutation(
  bytes: Uint8Array,
  pageGraph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
  signal?: AbortSignal,
): Promise<PageLabelCommandMutationResult> {
  const plan = planPageLabelCommandMutation(
    pageGraph,
    ranges,
  );

  if (!plan.ok) {
    return plan;
  }

  const writeResult = await writePdfPageLabels(
    bytes,
    plan.pageGraph,
    plan.pageGraph.pageLabelRanges ?? [],
    signal,
  );

  return {
    ok: true,
    bytes: writeResult.bytes,
    pageGraph: plan.pageGraph,
  };
}
