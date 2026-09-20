import React, { useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSearchStore } from '@/core/search/store';
import { useSessionStore } from '@/core/session/store';
import {
  indexPdfDocumentIncrementally,
} from '@/adapters/pdf-renderer/IncrementalSearchIndexer';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import { SearchIndexer } from '@/core/search/indexer';
import {
  EMPTY_SEARCH_INDEX_PROGRESS,
  type SearchOptions,
} from '@/core/search/types';
import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';

export const SearchPanel: React.FC = () => {
  const {
    documentKey,
    workingBytes,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    pageGraph,
    currentPage,
    setPage,
  } = useSessionStore(useShallow((state) => ({
    documentKey: state.documentKey,
    workingBytes: state.workingBytes,
    revisionStoreId: state.revisionStoreId,
    originalRevisionId: state.originalRevisionId,
    activeRevisionId: state.activeRevisionId,
    pageGraph: state.pageGraph,
    currentPage: state.viewState.currentPage,
    setPage: state.setPage,
  })));
  const {
    query,
    setQuery,
    hits,
    setHits,
    activeHitId,
    setActiveHit,
    clearSearch,
    nextHit,
    prevHit,
    isSearching,
    setIsSearching,
    error,
    setError,
    indexProgress,
    setIndexProgress,
  } = useSearchStore(useShallow((state) => ({
    query: state.query,
    setQuery: state.setQuery,
    hits: state.hits,
    setHits: state.setHits,
    activeHitId: state.activeHitId,
    setActiveHit: state.setActiveHit,
    clearSearch: state.clearSearch,
    nextHit: state.nextHit,
    prevHit: state.prevHit,
    isSearching: state.isSearching,
    setIsSearching: state.setIsSearching,
    error: state.error,
    setError: state.setError,
    indexProgress: state.indexProgress,
    setIndexProgress: state.setIndexProgress,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const indexAbortControllerRef = React.useRef<AbortController | null>(null);

  const [localQuery, setLocalQuery] = useState(query);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });

  const hasActiveDocument = Boolean(
    workingBytes || activeRevisionId,
  );

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setLocalQuery(query);
  }

  const searchOptionsRef = React.useRef(searchOptions);
  searchOptionsRef.current = searchOptions;

  const publishSearchResults = useCallback((
    searchQuery: string,
    options: SearchOptions = searchOptionsRef.current,
  ) => {
    if (!activeRevisionId || !pageGraph) {
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

    if (!searchQuery.trim()) {
      setHits([]);
      setIsSearching(false);
      return;
    }

    setHits(
      SearchIndexer.searchRevision(
        activeRevisionId,
        pageGraph,
        searchQuery,
        options,
      ),
    );
    setIsSearching(!progress.complete);
  }, [
    activeRevisionId,
    pageGraph,
    setHits,
    setIndexProgress,
    setIsSearching,
  ]);

  React.useEffect(() => {
    if (
      !hasActiveDocument
      || !documentKey
      || !activeRevisionId
      || !pageGraph
    ) {
      setIndexProgress({
        ...EMPTY_SEARCH_INDEX_PROGRESS,
      });
      return;
    }

    const controller =
      new AbortController();
    indexAbortControllerRef.current
      ?.abort(
        'Search index priority changed',
      );
    indexAbortControllerRef.current =
      controller;

    setError(null);
    SearchIndexer.prepareRevision(
      activeRevisionId,
      pageGraph,
    );
    publishSearchResults(
      useSearchStore.getState().query,
    );

    let lease:
      Awaited<
        ReturnType<
          typeof acquireActivePdfDocumentLease
        >
      > = null;

    const run = async () => {
      try {
        lease =
          await acquireActivePdfDocumentLease(
            {
              documentKey,
              workingBytes,
              revisionStoreId,
              originalRevisionId,
              activeRevisionId,
            },
            controller.signal,
          );
        if (!lease) return;

        await indexPdfDocumentIncrementally({
          doc: lease.doc,
          revisionId:
            activeRevisionId,
          pageGraph,
          currentPage,
          nearbyRadius: 2,
          batchSize: 2,
          signal: controller.signal,
          onPageIndexed: () => {
            publishSearchResults(
              useSearchStore
                .getState()
                .query,
            );
          },
          onProgress: (
            progress,
          ) => {
            setIndexProgress(progress);
          },
        });
      } catch (indexError) {
        if (
          isOperationCancelledError(
            indexError,
          )
          || controller.signal.aborted
        ) {
          return;
        }
        const message =
          indexError instanceof Error
            ? indexError.message
            : String(indexError);
        setError(message);
        logError(
          'pdf-renderer',
          'Incremental search indexing failed',
          { error: message },
        );
        addToast({
          type: 'error',
          title: 'Search Index Failed',
          message,
        });
      } finally {
        await lease?.release();
        if (
          indexAbortControllerRef.current
          === controller
        ) {
          indexAbortControllerRef.current =
            null;
          publishSearchResults(
            useSearchStore
              .getState()
              .query,
          );
        }
      }
    };

    void run();

    return () => {
      controller.abort(
        'Search panel revision or priority changed',
      );
    };
  }, [
    hasActiveDocument,
    documentKey,
    workingBytes,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    pageGraph,
    currentPage,
    publishSearchResults,
    setError,
    setIndexProgress,
    addToast,
  ]);

  React.useEffect(() => {
    publishSearchResults(
      query,
      searchOptions,
    );
  }, [
    query,
    searchOptions,
    publishSearchResults,
  ]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalQuery(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (localQuery === query) {
        // If query hasn't changed, Enter should go to next hit
        nextHit();
      } else {
        setQuery(localQuery);
        publishSearchResults(
          localQuery,
          searchOptions,
        );
      }
    }
  };

  const handleClear = () => {
    setLocalQuery('');
    clearSearch();
  };

  const handleHitClick = (hitId: string, pageNumber: number) => {
    setActiveHit(hitId);
    setPage(pageNumber);
  };

  const toggleOption = (key: keyof SearchOptions) => {
    setSearchOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (localQuery) {
        setQuery(localQuery);
        publishSearchResults(
          localQuery,
          next,
        );
      }
      return next;
    });
  };

  const groupedHits = hits.reduce((acc, hit) => {
    if (!acc[hit.pageNumber]) acc[hit.pageNumber] = [];
    acc[hit.pageNumber].push(hit);
    return acc;
  }, {} as Record<number, typeof hits>);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={localQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search in document..."
            className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {localQuery && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={searchOptions.caseSensitive ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => toggleOption('caseSensitive')}
            className="flex-1 text-xs"
          >
            [Aa] Case
          </Button>
          <Button
            variant={searchOptions.wholeWord ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => toggleOption('wholeWord')}
            className="flex-1 text-xs"
          >
            [\b] Word
          </Button>
          <Button
            variant={searchOptions.useRegex ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => toggleOption('useRegex')}
            className="flex-1 text-xs"
          >
            [.*] Regex
          </Button>
        </div>

        {query && indexProgress.totalPages > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {hits.length} result{hits.length !== 1 ? 's' : ''}
              {' · '}
              {indexProgress.indexedPages}/{indexProgress.totalPages} pages indexed
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevHit}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextHit}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {isSearching && (
          <div className="text-sm text-slate-500 text-center py-4">
            Searching indexed pages while background indexing continues ({indexProgress.indexedPages}/{indexProgress.totalPages})...
          </div>
        )}

        {indexProgress.failedPages > 0 && (
          <div className="text-xs text-amber-600 dark:text-amber-400 text-center">
            {indexProgress.failedPages} page{indexProgress.failedPages === 1 ? '' : 's'} could not be indexed.
          </div>
        )}

        {!isSearching && query && hits.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-4">No results found.</div>
        )}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 text-center py-4">{error}</div>
        )}

        {Object.entries(groupedHits).map(([pageStr, pageHits]) => {
          const pageNum = parseInt(pageStr, 10);
          return (
            <div key={pageNum} className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 pl-2">
                Page {pageNum}
              </div>
              {pageHits.map((hit) => {
                const isActive = hit.id === activeHitId;
                return (
                  <button
                    key={hit.id}
                    onClick={() => handleHitClick(hit.id, pageNum)}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800'
                        : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent'
                    }`}
                  >
                    {hit.snippet}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
