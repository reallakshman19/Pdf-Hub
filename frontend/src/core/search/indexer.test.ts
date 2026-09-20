import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import {
  SearchIndexer,
} from './indexer';

const OPTIONS = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

function graph(
  revisionId: string,
  pageIds: string[],
): PageGraph<PageNode> {
  return {
    pages: pageIds.map(
      (pageId, index) => ({
        pageId,
        documentKey: revisionId,
        originalPageNumber:
          index + 1,
        currentIndex: index,
        width: 600,
        height: 800,
        rotation: 0,
      }),
    ),
  };
}

function indexPage(
  revisionId: string,
  pageGraph: PageGraph<PageNode>,
  pageId: string,
  text: string,
  token = 'test-owner',
): void {
  SearchIndexer.prepareRevision(
    revisionId,
    pageGraph,
  );
  SearchIndexer.markQueued(
    revisionId,
    pageId,
    token,
  );
  SearchIndexer.markIndexing(
    revisionId,
    pageId,
    token,
  );
  SearchIndexer.setPageText(
    revisionId,
    pageId,
    token,
    [{
      str: text,
      rect: {
        x: 10,
        y: 20,
        width: 100,
        height: 12,
      },
    }],
  );
}

describe(
  'SearchIndexer incremental revision index',
  () => {
    beforeEach(() => {
      SearchIndexer.clearAll();
    });

    it('prioritizes current, nearby, requested, then remaining pages', () => {
      expect(
        SearchIndexer.createPageSchedule({
          pageCount: 7,
          currentPage: 4,
          nearbyRadius: 2,
          requestedPageNumbers: [
            7,
            1,
          ],
        }),
      ).toEqual([
        4,
        3,
        5,
        2,
        6,
        7,
        1,
      ]);
    });

    it('searches only indexed pages and exposes partial progress', () => {
      const pageGraph =
        graph(
          'rev-a',
          [
            'page-a',
            'page-b',
            'page-c',
          ],
        );

      indexPage(
        'rev-a',
        pageGraph,
        'page-b',
        'Pump station valve',
      );

      expect(
        SearchIndexer.getProgress(
          'rev-a',
          pageGraph,
        ),
      ).toEqual({
        revisionId: 'rev-a',
        indexedPages: 1,
        failedPages: 0,
        pendingPages: 0,
        totalPages: 3,
        complete: false,
      });

      const hits =
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'valve',
          OPTIONS,
        );
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        pageNumber: 2,
        snippet:
          'Pump station valve',
      });
    });

    it('reuses PageId text after same-revision reorder and remaps result page numbers', () => {
      const original =
        graph(
          'rev-a',
          [
            'page-a',
            'page-b',
          ],
        );
      indexPage(
        'rev-a',
        original,
        'page-b',
        'stable identity',
      );

      const reordered =
        graph(
          'rev-a',
          [
            'page-b',
            'page-a',
          ],
        );
      SearchIndexer.prepareRevision(
        'rev-a',
        reordered,
      );

      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          reordered,
          'identity',
          OPTIONS,
        )[0]?.pageNumber,
      ).toBe(1);
      expect(
        SearchIndexer.getPageRecord(
          'rev-a',
          'page-b',
        )?.status,
      ).toBe('indexed');
    });

    it('invalidates stale page text when the active revision changes', () => {
      const first =
        graph(
          'rev-a',
          ['page-a'],
        );
      indexPage(
        'rev-a',
        first,
        'page-a',
        'old revision text',
      );

      const second =
        graph(
          'rev-b',
          ['page-a'],
        );
      SearchIndexer.prepareRevision(
        'rev-b',
        second,
      );

      expect(
        SearchIndexer.searchRevision(
          'rev-b',
          second,
          'old',
          OPTIONS,
        ),
      ).toEqual([]);
      expect(
        SearchIndexer.getPageRecord(
          'rev-b',
          'page-a',
        )?.status,
      ).toBe('unindexed');
      expect(
        SearchIndexer.getPageRecord(
          'rev-a',
          'page-a',
        ),
      ).toBeNull();
    });

    it('prevents a superseded task token from publishing page text', () => {
      const pageGraph =
        graph(
          'rev-a',
          ['page-a'],
        );
      SearchIndexer.prepareRevision(
        'rev-a',
        pageGraph,
      );

      SearchIndexer.markQueued(
        'rev-a',
        'page-a',
        'old-owner',
      );
      SearchIndexer.markQueued(
        'rev-a',
        'page-a',
        'new-owner',
      );
      SearchIndexer.markIndexing(
        'rev-a',
        'page-a',
        'old-owner',
      );
      SearchIndexer.setPageText(
        'rev-a',
        'page-a',
        'old-owner',
        [{
          str: 'stale',
          rect: {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        }],
      );

      expect(
        SearchIndexer.getPageRecord(
          'rev-a',
          'page-a',
        ),
      ).toMatchObject({
        status: 'queued',
        ownerToken: 'new-owner',
      });

      SearchIndexer.markIndexing(
        'rev-a',
        'page-a',
        'new-owner',
      );
      SearchIndexer.setPageText(
        'rev-a',
        'page-a',
        'new-owner',
        [{
          str: 'fresh',
          rect: {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        }],
      );

      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'fresh',
          OPTIONS,
        ),
      ).toHaveLength(1);
      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'stale',
          OPTIONS,
        ),
      ).toHaveLength(0);
    });

    it('supports case, whole-word and regex query options without reindexing', () => {
      const pageGraph =
        graph(
          'rev-a',
          ['page-a'],
        );
      indexPage(
        'rev-a',
        pageGraph,
        'page-a',
        'Valve VALVE valves',
      );

      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'VALVE',
          {
            caseSensitive: true,
            wholeWord: true,
            useRegex: false,
          },
        ),
      ).toHaveLength(1);

      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'valve',
          {
            caseSensitive: false,
            wholeWord: true,
            useRegex: false,
          },
        ),
      ).toHaveLength(2);

      expect(
        SearchIndexer.searchRevision(
          'rev-a',
          pageGraph,
          'V[a-z]+e',
          {
            caseSensitive: true,
            wholeWord: false,
            useRegex: true,
          },
        ),
      ).toHaveLength(1);
    });
  },
);
