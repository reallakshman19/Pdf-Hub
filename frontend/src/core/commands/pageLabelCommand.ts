import {
  clearPageLabelRanges,
  validatePageLabelRanges,
  withPageLabelRanges,
} from '@/core/pages/pageLabels';
import { writePdfPageLabels } from '@/core/pages/pdfPageLabelWriter';
import type {
  PageGraph,
  PageLabelRange,
  PageNode,
} from '@/core/pages/types';

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
  const normalizedRanges = ranges.map((range) => ({ ...range }));
  const validation = validatePageLabelRanges(pageGraph, normalizedRanges);

  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  const nextPageGraph =
    normalizedRanges.length === 0
      ? clearPageLabelRanges(pageGraph)
      : withPageLabelRanges(pageGraph, normalizedRanges);

  const writeResult = await writePdfPageLabels(
    bytes,
    nextPageGraph,
    nextPageGraph.pageLabelRanges ?? [],
    signal,
  );

  return {
    ok: true,
    bytes: writeResult.bytes,
    pageGraph: nextPageGraph,
  };
}
