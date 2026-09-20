import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';

import { SearchIndexer } from './indexer';
import type {
  SearchHit,
  SearchOptions,
} from './types';

function signatureFor(
  revisionId: string,
  query: string,
  options: SearchOptions,
): string {
  return [
    revisionId,
    query,
    options.caseSensitive ? '1' : '0',
    options.wholeWord ? '1' : '0',
    options.useRegex ? '1' : '0',
  ].join('\u0000');
}

export class IncrementalSearchResults {
  private signature: string | null = null;
  private pageGraph:
    PageGraph<PageNode> | null = null;
  private readonly hitsByPageId =
    new Map<PageId, SearchHit[]>();

  clear(): void {
    this.signature = null;
    this.pageGraph = null;
    this.hitsByPageId.clear();
  }

  rebuild(
    revisionId: string,
    pageGraph: PageGraph<PageNode>,
    query: string,
    options: SearchOptions,
  ): SearchHit[] {
    this.hitsByPageId.clear();
    this.pageGraph = pageGraph;
    this.signature =
      signatureFor(
        revisionId,
        query,
        options,
      );

    if (!query.trim()) return [];

    pageGraph.pages.forEach(
      (page, pageIndex) => {
        const hits =
          SearchIndexer.searchPage(
            revisionId,
            page.pageId,
            pageIndex + 1,
            query,
            options,
          );
        if (hits.length > 0) {
          this.hitsByPageId.set(
            page.pageId,
            hits,
          );
        }
      },
    );

    return this.flatten(pageGraph);
  }

  updatePage(
    revisionId: string,
    pageGraph: PageGraph<PageNode>,
    pageId: PageId,
    pageNumber: number,
    query: string,
    options: SearchOptions,
  ): SearchHit[] | null {
    if (
      this.pageGraph !== pageGraph
      || this.signature
        !== signatureFor(
          revisionId,
          query,
          options,
        )
    ) {
      return null;
    }

    const hits =
      SearchIndexer.searchPage(
        revisionId,
        pageId,
        pageNumber,
        query,
        options,
      );
    if (hits.length > 0) {
      this.hitsByPageId.set(
        pageId,
        hits,
      );
    } else {
      this.hitsByPageId.delete(
        pageId,
      );
    }

    return this.flatten(pageGraph);
  }

  private flatten(
    pageGraph: PageGraph<PageNode>,
  ): SearchHit[] {
    return pageGraph.pages.flatMap(
      (page) =>
        this.hitsByPageId
          .get(page.pageId)
        ?? [],
    );
  }
}
