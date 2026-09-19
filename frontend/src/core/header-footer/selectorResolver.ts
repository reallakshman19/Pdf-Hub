import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterPageSelector } from './types';

export interface HeaderFooterSection {
  startIndex: number;
  endExclusive: number;
}

export function matchesHeaderFooterSelector(
  selector: HeaderFooterPageSelector,
  pageGraph: PageGraph<PageNode>,
  pageIndex: number,
): boolean {
  const page = pageGraph.pages[pageIndex];
  if (!page) return false;

  if (selector.excludeFirstPhysicalPage && pageIndex === 0) return false;
  if (
    selector.excludeLastPhysicalPage
    && pageIndex === pageGraph.pages.length - 1
  ) {
    return false;
  }

  const physicalPageNumber = pageIndex + 1;
  if (selector.parity === 'odd' && physicalPageNumber % 2 === 0) return false;
  if (selector.parity === 'even' && physicalPageNumber % 2 !== 0) return false;

  switch (selector.include.mode) {
    case 'all':
      return true;

    case 'pageIds':
      return selector.include.pageIds.includes(page.pageId);

    case 'range': {
      const start = pageGraph.pages.findIndex(
        (candidate) => candidate.pageId === selector.include.startPageId,
      );
      const end = pageGraph.pages.findIndex(
        (candidate) => candidate.pageId === selector.include.endPageId,
      );
      if (start < 0 || end < 0) return false;
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      return pageIndex >= low && pageIndex <= high;
    }

    case 'pageLabelRange': {
      const section = sectionForPageLabelRange(
        pageGraph,
        selector.include.startPageId,
      );
      if (!section) return false;
      return pageIndex >= section.startIndex && pageIndex < section.endExclusive;
    }

    default:
      return assertNever(selector.include);
  }
}

export function sectionForPage(
  pageGraph: PageGraph<PageNode>,
  pageIndex: number,
): HeaderFooterSection {
  const ranges = canonicalLabelSections(pageGraph);

  if (ranges.length === 0) {
    return {
      startIndex: 0,
      endExclusive: pageGraph.pages.length,
    };
  }

  let selected = ranges[0];
  for (const range of ranges) {
    if (range.startIndex > pageIndex) break;
    selected = range;
  }

  return selected ?? {
    startIndex: 0,
    endExclusive: pageGraph.pages.length,
  };
}

function sectionForPageLabelRange(
  pageGraph: PageGraph<PageNode>,
  startPageId: string,
): HeaderFooterSection | null {
  return (
    canonicalLabelSections(pageGraph).find(
      (section) => pageGraph.pages[section.startIndex]?.pageId === startPageId,
    ) ?? null
  );
}

function canonicalLabelSections(
  pageGraph: PageGraph<PageNode>,
): HeaderFooterSection[] {
  const starts = (pageGraph.pageLabelRanges ?? [])
    .map((range) => {
      const startIndex = pageGraph.pages.findIndex(
        (page) => page.pageId === range.startPageId,
      );
      return { startIndex };
    })
    .filter((entry) => entry.startIndex >= 0)
    .sort((left, right) => left.startIndex - right.startIndex);

  return starts.map((entry, index) => ({
    startIndex: entry.startIndex,
    endExclusive:
      starts[index + 1]?.startIndex ?? pageGraph.pages.length,
  }));
}

function assertNever(value: never): never {
  throw new Error(
    `Unsupported header/footer selector: ${JSON.stringify(value)}`,
  );
}
