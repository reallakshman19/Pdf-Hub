import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';

import type {
  PageTextItem,
  SearchHit,
  SearchIndexProgress,
  SearchOptions,
  SearchPageIndexStatus,
} from './types';

export interface SearchIndexPageRecord {
  revisionId: string;
  pageId: PageId;
  status: SearchPageIndexStatus;
  items: PageTextItem[];
  error: string | null;
  ownerToken: string | null;
}

export interface SearchPageScheduleInput {
  pageCount: number;
  currentPage: number;
  nearbyRadius?: number;
  requestedPageNumbers?: readonly number[];
}

const revisionIndexes =
  new Map<
    string,
    Map<PageId, SearchIndexPageRecord>
  >();

let activeRevisionId: string | null = null;

function createRecord(
  revisionId: string,
  pageId: PageId,
): SearchIndexPageRecord {
  return {
    revisionId,
    pageId,
    status: 'unindexed',
    items: [],
    error: null,
    ownerToken: null,
  };
}

function revisionIndex(
  revisionId: string,
): Map<PageId, SearchIndexPageRecord> {
  let index = revisionIndexes.get(revisionId);
  if (!index) {
    index =
      new Map<PageId, SearchIndexPageRecord>();
    revisionIndexes.set(revisionId, index);
  }
  return index;
}

function normalizePageNumber(
  value: number,
  pageCount: number,
): number | null {
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > pageCount) {
    return null;
  }
  return value;
}

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^$(){}|[\]\\]/g,
    '\\$&',
  );
}

function matcherFor(
  query: string,
  options: SearchOptions,
): RegExp | null {
  if (!query) return null;

  try {
    let pattern =
      options.useRegex
        ? query
        : escapeRegExp(query);

    if (
      options.wholeWord
      && !options.useRegex
    ) {
      pattern = '\\b(?:' + pattern + ')\\b';
    }

    return new RegExp(
      pattern,
      options.caseSensitive ? 'g' : 'gi',
    );
  } catch {
    return null;
  }
}

function pageTextSearchHits(
  revisionId: string,
  pageId: PageId,
  pageNumber: number,
  items: readonly PageTextItem[],
  query: string,
  options: SearchOptions,
): SearchHit[] {
  const regex = matcherFor(
    query,
    options,
  );
  if (!regex) return [];

  let fullText = '';
  const spans: Array<{
    start: number;
    end: number;
    item: PageTextItem;
  }> = [];

  for (const item of items) {
    const start = fullText.length;
    fullText += item.str;
    const end = fullText.length;
    spans.push({
      start,
      end,
      item,
    });
    fullText += ' ';
  }

  const hits: SearchHit[] = [];
  let match: RegExpExecArray | null;
  let ordinal = 0;

  while (
    (match = regex.exec(fullText)) !== null
  ) {
    const start = match.index;
    const matchedText = match[0];
    const end =
      start + matchedText.length;

    const matchingItems =
      spans.filter(
        (span) =>
          span.start < end
          && span.end > start,
      );

    const snippetStart =
      Math.max(0, start - 20);
    const snippetEnd =
      Math.min(
        fullText.length,
        end + 20,
      );
    let snippet =
      fullText
        .slice(
          snippetStart,
          snippetEnd,
        )
        .trim();

    if (snippetStart > 0) {
      snippet = '...' + snippet;
    }
    if (snippetEnd < fullText.length) {
      snippet = snippet + '...';
    }

    hits.push({
      id:
        'hit:'
        + revisionId
        + ':'
        + pageId
        + ':'
        + start
        + ':'
        + ordinal,
      pageNumber,
      snippet,
      rects:
        matchingItems.map(
          ({ item }) => ({
            ...item.rect,
          }),
        ),
    });
    ordinal += 1;

    if (matchedText.length === 0) {
      regex.lastIndex += 1;
    }
  }

  return hits;
}

export class SearchIndexer {
  static prepareRevision(
    revisionId: string,
    pageGraph: PageGraph<PageNode>,
  ): SearchIndexProgress {
    if (
      activeRevisionId
      && activeRevisionId !== revisionId
    ) {
      revisionIndexes.clear();
    }
    activeRevisionId = revisionId;

    const index =
      revisionIndex(revisionId);
    const livePageIds =
      new Set(
        pageGraph.pages.map(
          (page) => page.pageId,
        ),
      );

    for (const pageId of index.keys()) {
      if (!livePageIds.has(pageId)) {
        index.delete(pageId);
      }
    }

    for (const page of pageGraph.pages) {
      if (!index.has(page.pageId)) {
        index.set(
          page.pageId,
          createRecord(
            revisionId,
            page.pageId,
          ),
        );
      }
    }

    return this.getProgress(
      revisionId,
      pageGraph,
    );
  }

  static clearRevision(
    revisionId: string,
  ): void {
    revisionIndexes.delete(revisionId);
    if (activeRevisionId === revisionId) {
      activeRevisionId = null;
    }
  }

  static clearAll(): void {
    revisionIndexes.clear();
    activeRevisionId = null;
  }

  static getPageRecord(
    revisionId: string,
    pageId: PageId,
  ): SearchIndexPageRecord | null {
    const record =
      revisionIndexes
        .get(revisionId)
        ?.get(pageId);
    if (!record) return null;

    return {
      ...record,
      items:
        record.items.map(
          (item) => ({
            ...item,
            rect: { ...item.rect },
          }),
        ),
    };
  }

  static markQueued(
    revisionId: string,
    pageId: PageId,
    ownerToken: string,
  ): void {
    if (
      activeRevisionId !== revisionId
    ) {
      return;
    }

    const index =
      revisionIndex(revisionId);
    const record =
      index.get(pageId)
      ?? createRecord(
        revisionId,
        pageId,
      );

    if (record.status === 'indexed') {
      return;
    }

    index.set(
      pageId,
      {
        ...record,
        status: 'queued',
        error: null,
        ownerToken,
      },
    );
  }

  static markIndexing(
    revisionId: string,
    pageId: PageId,
    ownerToken: string,
  ): void {
    if (
      activeRevisionId !== revisionId
    ) {
      return;
    }

    const index =
      revisionIndex(revisionId);
    const record =
      index.get(pageId);
    if (
      !record
      || record.status === 'indexed'
      || record.ownerToken !== ownerToken
    ) {
      return;
    }

    index.set(
      pageId,
      {
        ...record,
        status: 'indexing',
        error: null,
        ownerToken,
      },
    );
  }

  static setPageText(
    revisionId: string,
    pageId: PageId,
    ownerToken: string,
    items: readonly PageTextItem[],
  ): void {
    if (
      activeRevisionId !== revisionId
    ) {
      return;
    }

    const index =
      revisionIndex(revisionId);
    const record =
      index.get(pageId);
    if (
      !record
      || record.ownerToken !== ownerToken
    ) {
      return;
    }

    index.set(
      pageId,
      {
        ...record,
        status: 'indexed',
        items:
          items.map(
            (item) => ({
              ...item,
              rect: { ...item.rect },
            }),
          ),
        error: null,
        ownerToken: null,
      },
    );
  }

  static markFailed(
    revisionId: string,
    pageId: PageId,
    ownerToken: string,
    message: string,
  ): void {
    if (
      activeRevisionId !== revisionId
    ) {
      return;
    }

    const index =
      revisionIndex(revisionId);
    const record =
      index.get(pageId);
    if (
      !record
      || record.ownerToken !== ownerToken
    ) {
      return;
    }

    index.set(
      pageId,
      {
        ...record,
        status: 'failed',
        items: [],
        error: message,
        ownerToken: null,
      },
    );
  }

  static releaseOwner(
    revisionId: string,
    ownerToken: string,
  ): void {
    const index =
      revisionIndexes.get(revisionId);
    if (!index) return;

    for (
      const [pageId, record]
      of index.entries()
    ) {
      if (
        record.ownerToken !== ownerToken
      ) {
        continue;
      }
      index.set(
        pageId,
        {
          ...record,
          status: 'unindexed',
          error: null,
          ownerToken: null,
        },
      );
    }
  }

  static getProgress(
    revisionId: string,
    pageGraph: PageGraph<PageNode>,
  ): SearchIndexProgress {
    const index =
      revisionIndexes.get(revisionId);

    let indexedPages = 0;
    let failedPages = 0;
    let pendingPages = 0;

    for (const page of pageGraph.pages) {
      const status =
        index?.get(page.pageId)
          ?.status
        ?? 'unindexed';

      if (status === 'indexed') {
        indexedPages += 1;
      } else if (status === 'failed') {
        failedPages += 1;
      } else if (
        status === 'queued'
        || status === 'indexing'
      ) {
        pendingPages += 1;
      }
    }

    const totalPages =
      pageGraph.pages.length;

    return {
      revisionId,
      indexedPages,
      failedPages,
      pendingPages,
      totalPages,
      complete:
        totalPages > 0
        && indexedPages + failedPages
          === totalPages,
    };
  }

  static searchRevision(
    revisionId: string,
    pageGraph: PageGraph<PageNode>,
    query: string,
    options: SearchOptions,
  ): SearchHit[] {
    if (!query.trim()) return [];

    const index =
      revisionIndexes.get(revisionId);
    if (!index) return [];

    return pageGraph.pages.flatMap(
      (page, pageIndex) => {
        const record =
          index.get(page.pageId);
        if (
          !record
          || record.status !== 'indexed'
        ) {
          return [];
        }

        return pageTextSearchHits(
          revisionId,
          page.pageId,
          pageIndex + 1,
          record.items,
          query,
          options,
        );
      },
    );
  }

  static createPageSchedule(
    input: SearchPageScheduleInput,
  ): number[] {
    const pageCount =
      Math.max(
        0,
        Math.floor(input.pageCount),
      );
    if (pageCount === 0) return [];

    const currentPage =
      normalizePageNumber(
        input.currentPage,
        pageCount,
      )
      ?? 1;
    const nearbyRadius =
      Math.max(
        0,
        Math.floor(
          input.nearbyRadius ?? 2,
        ),
      );

    const order: number[] = [];
    const seen = new Set<number>();
    const push = (value: number) => {
      const pageNumber =
        normalizePageNumber(
          value,
          pageCount,
        );
      if (
        pageNumber === null
        || seen.has(pageNumber)
      ) {
        return;
      }
      seen.add(pageNumber);
      order.push(pageNumber);
    };

    push(currentPage);

    for (
      let distance = 1;
      distance <= nearbyRadius;
      distance += 1
    ) {
      push(currentPage - distance);
      push(currentPage + distance);
    }

    for (
      const requested of
        input.requestedPageNumbers ?? []
    ) {
      push(requested);
    }

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber += 1
    ) {
      push(pageNumber);
    }

    return order;
  }
}
