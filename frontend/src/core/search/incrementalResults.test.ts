import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import { SearchIndexer } from './indexer';
import {
  IncrementalSearchResults,
} from './incrementalResults';

const OPTIONS = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

function graph(
  revisionId: string,
  count: number,
): PageGraph<PageNode> {
  return {
    pages: Array.from(
      { length: count },
      (_, index) => ({
        pageId: 'page-' + (index + 1),
        documentKey: revisionId,
        originalPageNumber: index + 1,
        currentIndex: index,
        width: 600,
        height: 800,
        rotation: 0,
      }),
    ),
  };
}

describe(
  'IncrementalSearchResults',
  () => {
    beforeEach(() => {
      SearchIndexer.clearAll();
      vi.restoreAllMocks();
    });

    it('matches exactly one newly indexed page per active-query arrival across 1000 pages', () => {
      const revisionId = 'rev-1000';
      const pageGraph =
        graph(revisionId, 1000);
      SearchIndexer.prepareRevision(
        revisionId,
        pageGraph,
      );

      const results =
        new IncrementalSearchResults();
      results.rebuild(
        revisionId,
        pageGraph,
        'needle',
        OPTIONS,
      );

      const searchPage =
        vi.spyOn(
          SearchIndexer,
          'searchPage',
        );
      searchPage.mockClear();

      let finalHits = null;

      for (
        let index = 0;
        index < pageGraph.pages.length;
        index += 1
      ) {
        const page =
          pageGraph.pages[index];
        const owner =
          'owner-' + index;
        SearchIndexer.markQueued(
          revisionId,
          page.pageId,
          owner,
        );
        SearchIndexer.markIndexing(
          revisionId,
          page.pageId,
          owner,
        );
        SearchIndexer.setPageText(
          revisionId,
          page.pageId,
          owner,
          [{
            str:
              'needle page '
              + (index + 1),
            rect: {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
            },
          }],
        );

        const hits =
          results.updatePage(
            revisionId,
            pageGraph,
            page.pageId,
            index + 1,
            'needle',
            OPTIONS,
          );
        expect(hits)
          .not.toBeNull();
        finalHits = hits;
      }

      expect(searchPage)
        .toHaveBeenCalledTimes(1000);
      expect(finalHits)
        .toHaveLength(1000);
      expect(
        finalHits?.[999],
      ).toMatchObject({
        pageNumber: 1000,
        snippet: 'needle page 1000',
      });
    });

    it('requires rebuild after a query or PageGraph signature changes', () => {
      const revisionId = 'rev-a';
      const pageGraph =
        graph(revisionId, 1);
      SearchIndexer.prepareRevision(
        revisionId,
        pageGraph,
      );

      const results =
        new IncrementalSearchResults();
      results.rebuild(
        revisionId,
        pageGraph,
        'needle',
        OPTIONS,
      );

      expect(
        results.updatePage(
          revisionId,
          pageGraph,
          pageGraph.pages[0].pageId,
          1,
          'different',
          OPTIONS,
        ),
      ).toBeNull();

      const reordered = {
        pages: [
          ...pageGraph.pages,
        ].reverse(),
      };
      expect(
        results.updatePage(
          revisionId,
          reordered,
          reordered.pages[0].pageId,
          1,
          'needle',
          OPTIONS,
        ),
      ).toBeNull();
    });
  },
);
