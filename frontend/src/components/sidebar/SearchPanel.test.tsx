import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  SearchPanel,
} from './SearchPanel';
import {
  useSessionStore,
} from '@/core/session/store';
import {
  useSearchStore,
} from '@/core/search/store';
import {
  SearchIndexer,
} from '@/core/search/indexer';
import {
  EMPTY_SEARCH_INDEX_PROGRESS,
} from '@/core/search/types';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import {
  indexPdfDocumentIncrementally,
} from '@/adapters/pdf-renderer/IncrementalSearchIndexer';

vi.mock(
  '@/adapters/pdf-renderer/activePdfDocumentLease',
  () => ({
    acquireActivePdfDocumentLease:
      vi.fn(),
  }),
);

vi.mock(
  '@/adapters/pdf-renderer/IncrementalSearchIndexer',
  () => ({
    indexPdfDocumentIncrementally:
      vi.fn(),
  }),
);

const PAGE_GRAPH = {
  pages: [{
    pageId: 'page-a',
    documentKey: 'sha256:active',
    originalPageNumber: 1,
    currentIndex: 0,
    width: 600,
    height: 800,
    rotation: 0 as const,
  }, {
    pageId: 'page-b',
    documentKey: 'sha256:active',
    originalPageNumber: 2,
    currentIndex: 1,
    width: 600,
    height: 800,
    rotation: 0 as const,
  }],
};

function seedOneIndexedPage(): void {
  SearchIndexer.prepareRevision(
    'sha256:active',
    PAGE_GRAPH,
  );
  SearchIndexer.markQueued(
    'sha256:active',
    'page-a',
    'mock-indexer',
  );
  SearchIndexer.markIndexing(
    'sha256:active',
    'page-a',
    'mock-indexer',
  );
  SearchIndexer.setPageText(
    'sha256:active',
    'page-a',
    'mock-indexer',
    [{
      str: 'needle cached valve',
      rect: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
    }],
  );
}

describe(
  'SearchPanel incremental active revision indexing',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      SearchIndexer.clearAll();

      useSearchStore.setState({
        query: '',
        isSearching: false,
        hits: [],
        activeHitId: null,
        error: null,
        indexProgress: {
          ...EMPTY_SEARCH_INDEX_PROGRESS,
        },
      });

      useSessionStore.setState({
        documentKey: 'sha256:active',
        revisionStoreId: 'store-1',
        originalRevisionId:
          'sha256:original',
        activeRevisionId:
          'sha256:active',
        workingBytes:
          Uint8Array.from([9, 9]),
        pageCount: 2,
        pageGraph: PAGE_GRAPH,
        viewState: {
          ...useSessionStore
            .getState()
            .viewState,
          currentPage: 1,
          currentPageId: 'page-a',
        },
      });

      vi.mocked(
        acquireActivePdfDocumentLease,
      ).mockResolvedValue({
        doc: {
          numPages: 2,
        } as never,
        cacheKey:
          'sha256:active',
        release:
          vi.fn()
            .mockResolvedValue(
              undefined,
            ),
      });

      vi.mocked(
        indexPdfDocumentIncrementally,
      ).mockImplementation(
        async (input) => {
          seedOneIndexedPage();
          const progress =
            SearchIndexer.getProgress(
              'sha256:active',
              PAGE_GRAPH,
            );
          input.onProgress?.(
            progress,
          );
          input.onPageIndexed?.({
            revisionId:
              'sha256:active',
            pageId: 'page-a',
            pageNumber: 1,
            progress,
          });
          return {
            ownerToken:
              'mock-indexer',
            progress,
          };
        },
      );
    });

    it('uses the active revision lease and incremental indexer without a query-triggered full-document scan', async () => {
      render(<SearchPanel />);

      await vi.waitFor(() => {
        expect(
          acquireActivePdfDocumentLease,
        ).toHaveBeenCalled();
      });
      await vi.waitFor(() => {
        expect(
          indexPdfDocumentIncrementally,
        ).toHaveBeenCalled();
      });

      expect(
        vi.mocked(
          acquireActivePdfDocumentLease,
        ).mock.calls[0]?.[0],
      ).toMatchObject({
        documentKey:
          'sha256:active',
        revisionStoreId:
          'store-1',
        originalRevisionId:
          'sha256:original',
        activeRevisionId:
          'sha256:active',
      });

      expect(
        vi.mocked(
          indexPdfDocumentIncrementally,
        ).mock.calls[0]?.[0],
      ).toMatchObject({
        revisionId:
          'sha256:active',
        currentPage: 1,
        nearbyRadius: 2,
        batchSize: 2,
      });
    });

    it('publishes partial hits while background indexing remains incomplete', async () => {
      render(<SearchPanel />);

      await vi.waitFor(() => {
        expect(
          indexPdfDocumentIncrementally,
        ).toHaveBeenCalled();
      });

      const input =
        screen.getByPlaceholderText(
          'Search in document...',
        );
      fireEvent.change(input, {
        target: {
          value: 'needle',
        },
      });
      fireEvent.keyDown(input, {
        key: 'Enter',
      });

      expect(
        await screen.findByText(
          'needle cached valve',
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          /1\/2 pages indexed/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /background indexing continues/i,
        ),
      ).toBeInTheDocument();
      expect(
        useSearchStore
          .getState()
          .indexProgress,
      ).toMatchObject({
        revisionId:
          'sha256:active',
        indexedPages: 1,
        totalPages: 2,
        complete: false,
      });
    });

    it('reuses indexed text across query changes without restarting extraction', async () => {
      render(<SearchPanel />);

      await vi.waitFor(() => {
        expect(
          indexPdfDocumentIncrementally,
        ).toHaveBeenCalledTimes(1);
      });

      const input =
        screen.getByPlaceholderText(
          'Search in document...',
        );

      fireEvent.change(input, {
        target: {
          value: 'needle',
        },
      });
      fireEvent.keyDown(input, {
        key: 'Enter',
      });

      expect(
        await screen.findByText(
          'needle cached valve',
        ),
      ).toBeInTheDocument();

      fireEvent.change(input, {
        target: {
          value: 'valve',
        },
      });
      fireEvent.keyDown(input, {
        key: 'Enter',
      });

      expect(
        await screen.findByText(
          'needle cached valve',
        ),
      ).toBeInTheDocument();
      expect(
        indexPdfDocumentIncrementally,
      ).toHaveBeenCalledTimes(1);
    });
  },
);
