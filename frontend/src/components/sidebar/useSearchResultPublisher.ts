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
  const {
    activeRevisionId,
    pageGraph,
    searchOptions,
    setHits,
    setIndexProgress,
    setIsSearching,
  } = input;
  const incrementalResultsRef =
    React.useRef(
      new IncrementalSearchResults(),
    );
  const searchOptionsRef =
    React.useRef(searchOptions);
  searchOptionsRef.current =
    searchOptions;

  const publishSearchResults =
    React.useCallback((
      searchQuery: string,
      options:
        SearchOptions =
          searchOptionsRef.current,
    ) => {
      if (
        !activeRevisionId
        || !pageGraph
      ) {
        incrementalResultsRef
          .current
          .clear();
        setHits([]);
        setIndexProgress({
          ...EMPTY_SEARCH_INDEX_PROGRESS,
        });
        setIsSearching(false);
        return;
      }

      SearchIndexer.prepareRevision(
        activeRevisionId,
        pageGraph,
      );
      const progress =
        SearchIndexer.getProgress(
          activeRevisionId,
          pageGraph,
        );
      setIndexProgress(progress);

      setHits(
        incrementalResultsRef.current
          .rebuild(
            activeRevisionId,
            pageGraph,
            searchQuery,
            options,
          ),
      );
      setIsSearching(
        Boolean(searchQuery.trim())
        && !progress.complete,
      );
    }, [
      activeRevisionId,
      pageGraph,
      setHits,
      setIndexProgress,
      setIsSearching,
    ]);

  const publishIndexedPageResults =
    React.useCallback((
      pageId: PageId,
      pageNumber: number,
      progress: SearchIndexProgress,
    ) => {
      if (
        !activeRevisionId
        || !pageGraph
      ) {
        return;
      }

      const searchQuery =
        useSearchStore
          .getState()
          .query;
      if (!searchQuery.trim()) {
        setIsSearching(false);
        return;
      }

      const nextHits =
        incrementalResultsRef.current
          .updatePage(
            activeRevisionId,
            pageGraph,
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

      setHits(nextHits);
      setIsSearching(
        !progress.complete,
      );
    }, [
      activeRevisionId,
      pageGraph,
      setHits,
      setIsSearching,
      publishSearchResults,
    ]);

  return {
    publishSearchResults,
    publishIndexedPageResults,
  };
}
