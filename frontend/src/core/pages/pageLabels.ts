import {
  createPageGraph,
  physicalIndexForPageId,
} from './pageGraph';
import type {
  PageGraph,
  PageId,
  PageLabelRange,
  PageLabelStyle,
  PageNode,
} from './types';

export interface PageLabelValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePageLabelRanges(
  graph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
): PageLabelValidationResult {
  const errors: string[] = [];
  const starts = new Set<PageId>();

  for (const [index, range] of ranges.entries()) {
    if (!range.startPageId?.trim()) {
      errors.push(`range ${index + 1} has an empty startPageId`);
      continue;
    }
    if (starts.has(range.startPageId)) {
      errors.push(`duplicate PageLabel range start: ${range.startPageId}`);
    }
    starts.add(range.startPageId);

    if (physicalIndexForPageId(graph, range.startPageId) < 0) {
      errors.push(`PageLabel range start does not exist: ${range.startPageId}`);
    }

    if (
      range.startNumber !== undefined
      && (!Number.isInteger(range.startNumber) || range.startNumber < 1)
    ) {
      errors.push(`PageLabel range ${range.startPageId} has invalid startNumber`);
    }
    if (range.startNumber !== undefined && range.style === undefined) {
      errors.push(
        `PageLabel range ${range.startPageId} cannot set startNumber without a style`,
      );
    }

    if (
      range.style === undefined
      && (!range.prefix || range.prefix.length === 0)
    ) {
      errors.push(
        `PageLabel range ${range.startPageId} must have a style or non-empty prefix`,
      );
    }
  }

  if (ranges.length > 0) {
    const ordered = sortPageLabelRanges(graph, ranges);
    const firstIndex = physicalIndexForPageId(graph, ordered[0]!.startPageId);
    if (firstIndex !== 0) {
      errors.push('The first PageLabel range must start on physical page 1.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function sortPageLabelRanges(
  graph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
): PageLabelRange[] {
  return ranges
    .map((range) => ({ ...range }))
    .sort(
      (left, right) =>
        physicalIndexForPageId(graph, left.startPageId)
        - physicalIndexForPageId(graph, right.startPageId),
    );
}

export function withPageLabelRanges<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  ranges: readonly PageLabelRange[],
): PageGraph<TPage> {
  const validation = validatePageLabelRanges(
    graph as PageGraph<PageNode>,
    ranges,
  );
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const sorted = sortPageLabelRanges(
    graph as PageGraph<PageNode>,
    ranges,
  );
  const labels = resolveLogicalPageLabels(
    graph as PageGraph<PageNode>,
    sorted,
  );

  return createPageGraph(
    graph.pages.map((page, index) => {
      const next = { ...page };
      const label = labels[index];
      if (label === undefined) {
        delete next.logicalLabel;
      } else {
        next.logicalLabel = label;
      }
      return next;
    }),
    sorted,
  );
}

export function clearPageLabelRanges<TPage extends PageNode>(
  graph: PageGraph<TPage>,
): PageGraph<TPage> {
  return createPageGraph(
    graph.pages.map((page) => {
      const next = { ...page };
      delete next.logicalLabel;
      return next;
    }),
    [],
  );
}

/**
 * Attaches already-resolved labels read from an existing PDF without claiming
 * that PDF Hub knows the original PageLabels range structure.
 */
export function applyResolvedPageLabels<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  labels: readonly string[] | null,
): PageGraph<TPage> {
  if (!labels || labels.length !== graph.pages.length) {
    return createPageGraph(
      graph.pages.map((page) => {
        const next = { ...page };
        delete next.logicalLabel;
        return next;
      }),
      graph.pageLabelRanges,
    );
  }

  return createPageGraph(
    graph.pages.map((page, index) => ({
      ...page,
      logicalLabel: labels[index] ?? '',
    })),
    graph.pageLabelRanges,
  );
}

/**
 * 5E compatibility helper retained for callers that must discard unresolved
 * imported label metadata. Canonical 5F ranges should use clearPageLabelRanges.
 */
export function clearResolvedPageLabels<TPage extends PageNode>(
  graph: PageGraph<TPage>,
): PageGraph<TPage> {
  return createPageGraph(
    graph.pages.map((page) => {
      const next = { ...page };
      delete next.logicalLabel;
      return next;
    }),
    graph.pageLabelRanges,
  );
}

export function resolveLogicalPageLabels(
  graph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
): Array<string | undefined> {
  if (ranges.length === 0) {
    return graph.pages.map(() => undefined);
  }

  const sorted = sortPageLabelRanges(graph, ranges);
  const starts = sorted.map((range) =>
    physicalIndexForPageId(graph, range.startPageId),
  );

  return graph.pages.map((_, pageIndex) => {
    let activeIndex = -1;
    for (let index = 0; index < starts.length; index += 1) {
      if (starts[index]! <= pageIndex) activeIndex = index;
      else break;
    }
    if (activeIndex < 0) return undefined;

    const range = sorted[activeIndex]!;
    const offset = pageIndex - starts[activeIndex]!;
    const number = (range.startNumber ?? 1) + offset;
    return `${range.prefix ?? ''}${formatPageLabelNumber(range.style, number)}`;
  });
}

/**
 * Reanchors range starts after a structural transform.
 *
 * Surviving start PageIds remain stable. If a range-start page was deleted,
 * the range migrates to the first surviving page that originally belonged to
 * that range. If the whole original range was deleted, the range is dropped.
 */
export function reanchorPageLabelRangesAfterGraphChange<TPage extends PageNode>(
  beforeGraph: PageGraph<TPage>,
  afterGraph: PageGraph<TPage>,
): PageGraph<TPage> {
  const sourceRanges = beforeGraph.pageLabelRanges;
  if (!sourceRanges || sourceRanges.length === 0) {
    return clearResolvedPageLabels(
      createPageGraph(afterGraph.pages, afterGraph.pageLabelRanges),
    );
  }

  const sorted = sortPageLabelRanges(
    beforeGraph as PageGraph<PageNode>,
    sourceRanges,
  );
  const survivingIds = new Set(afterGraph.pages.map((page) => page.pageId));
  const nextRanges: PageLabelRange[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const range = sorted[index]!;
    if (survivingIds.has(range.startPageId)) {
      nextRanges.push({ ...range });
      continue;
    }

    const start = physicalIndexForPageId(beforeGraph, range.startPageId);
    const nextStart =
      index + 1 < sorted.length
        ? physicalIndexForPageId(beforeGraph, sorted[index + 1]!.startPageId)
        : beforeGraph.pages.length;

    const replacement = beforeGraph.pages
      .slice(Math.max(0, start), Math.max(0, nextStart))
      .find((page) => survivingIds.has(page.pageId));

    if (replacement) {
      nextRanges.push({
        ...range,
        startPageId: replacement.pageId,
      });
    }
  }

  if (nextRanges.length === 0) {
    return clearPageLabelRanges(afterGraph);
  }

  // If deletion removed the first range entirely, the earliest surviving range
  // may start after physical page 1. Promote it to page 1 so the emitted PDF
  // number tree remains valid and total over the document.
  const sortedAfter = sortPageLabelRanges(
    afterGraph as PageGraph<PageNode>,
    nextRanges,
  );
  if (
    physicalIndexForPageId(afterGraph, sortedAfter[0]!.startPageId) !== 0
    && afterGraph.pages[0]
  ) {
    sortedAfter[0] = {
      ...sortedAfter[0]!,
      startPageId: afterGraph.pages[0].pageId,
    };
  }

  return withPageLabelRanges(afterGraph, sortedAfter);
}

export function formatPageLabelNumber(
  style: PageLabelStyle | undefined,
  value: number,
): string {
  if (style === undefined) return '';
  if (style === 'decimal') return String(value);
  if (style === 'roman-lower') return toRoman(value).toLowerCase();
  if (style === 'roman-upper') return toRoman(value);
  if (style === 'letters-lower') return toAlphabetic(value).toLowerCase();
  return toAlphabetic(value);
}

function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) {
    return String(value);
  }

  const pairs: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remainder = value;
  let result = '';
  for (const [amount, symbol] of pairs) {
    while (remainder >= amount) {
      result += symbol;
      remainder -= amount;
    }
  }
  return result;
}

/**
 * PDF alphabetic PageLabels repeat one letter per 26-value block:
 * a..z, aa..zz, aaa..zzz, ...
 */
function toAlphabetic(value: number): string {
  if (!Number.isInteger(value) || value < 1) return String(value);
  const letter = String.fromCharCode(65 + ((value - 1) % 26));
  const repeats = Math.floor((value - 1) / 26) + 1;
  return letter.repeat(repeats);
}
