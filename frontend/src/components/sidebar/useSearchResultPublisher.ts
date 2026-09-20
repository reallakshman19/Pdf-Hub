import React from 'react';

import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import { SearchIndexer } from '@/core/search/indexer';
import {
  IncrementalSearchResults,
} from '@/core/search/incrementalResults';
import { useSearchStore } from '@/core/search/store';
import {
  EMPTY_SEARCH_INDEX_PROGRESS,
  type SearchHit,
  type SearchIndexProgress,
  type SearchOptions,
} from '@/core/search/types';

interface UseSearchResultPublisherInput {
  activeRevisionId: string | null;
  pageGraph: PageGraph<PageNode> | null;
  searchOptions: SearchOptions;
  setHits: (hits: SearchHit[]) => void;
  setIndexProgress:
    (progress: SearchIndexProgress) => void;
  setIsSearching:
    (isSearching: boolean) => void;
}

export function useSearchResultPublisher(
  input: UseSearchResultPublisherInput,
) {
  const incrementalResultsRef =
    React.useRef(
      new IncrementalSearchResults(),
    );
  const searchOptionsRef =
    React.useRef(input.searchOptions);
  searchOptionsRef.current =
    input.searchOptions;

  const publishSearchResults =
    React.useCallback((
      searchQuery: string,
      options:
        SearchOptions =
          searchOptionsRef.current,
    ) => {
      if (
        !input.activeRevisionId
        || !input.pageGraph
      ) {
        incrementalResultsRef
          .current
          .clear();
        input.setHits([]);
        input.setIndexProgress({
          ...EMPTY_SEARCH_INDEX_PROGRESS,
        });
        input.setIsSearching(false);
        return;
      }

      SearchIndexer.prepareRevision(
        input.activeRevisionId,
        input.pageGraph,
      );
      const progress =
        SearchIndexer.getProgress(
          input.activeRevisionId,
          input.pageGraph,
        );
      input.setIndexProgress(progress);

      input.setHits(
        incrementalResultsRef.current
          .rebuild(
            input.activeRevisionId,
            input.pageGraph,
            searchQuery,
            options,
          ),
      );
      input.setIsSearching(
        Boolean(searchQuery.trim())
        && !progress.complete,
      );
    }, [
      input.activeRevisionId,
      input.pageGraph,
      input.setHits,
      input.setIndexProgress,
      input.setIsSearching,
    ]);

  const publishIndexedPageResults =
    React.useCallback((
      pageId: PageId,
      pageNumber: number,
      progress: SearchIndexProgress,
    ) => {
      if (
        !input.activeRevisionId
        || !input.pageGraph
      ) {
        return;
      }

      const searchQuery =
        useSearchStore
          .getState()
          .query;
      if (!searchQuery.trim()) {
        input.setIsSearching(false);
        return;
      }

      const nextHits =
        incrementalResultsRef.current
          .updatePage(
            input.activeRevisionId,
            input.pageGraph,
            pageId,
            pageNumber,
            searchQuery,
            searchOptionsRef.current,
          );
      if (nextHits === null) {
        publishSearchResults(
          searchQuery,
        );
        return;
      }

      input.setHits(nextHits);
      input.setIsSearching(
        !progress.complete,
      );
    }, [
      input.activeRevisionId,
      input.pageGraph,
      input.setHits,
      input.setIsSearching,
      publishSearchResults,
    ]);

  return {
    publishSearchResults,
    publishIndexedPageResults,
  };
}
