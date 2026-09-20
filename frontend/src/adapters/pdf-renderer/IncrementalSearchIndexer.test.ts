import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  PdfRendererAdapter,
} from './PdfRendererAdapter';
import {
  indexPdfDocumentIncrementally,
} from './IncrementalSearchIndexer';
import {
  SearchIndexer,
} from '@/core/search/indexer';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';

function graph(
  revisionId: string,
  count: number,
): PageGraph<PageNode> {
  return {
    pages: Array.from(
      { length: count },
      (_, index) => ({
        pageId:
          'page-' + (index + 1),
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

function fakeDocument(
  count: number,
) {
  const cleanupByPage =
    new Map<number, ReturnType<typeof vi.fn>>();
  const getPage = vi.fn(
    async (pageNumber: number) => {
      const cleanup = vi.fn();
      cleanupByPage.set(
        pageNumber,
        cleanup,
      );
      return {
        pageNumber,
        cleanup,
      } as unknown as PDFPageProxy;
    },
  );

  return {
    doc: {
      numPages: count,
      getPage,
    } as unknown as PDFDocumentProxy,
    getPage,
    cleanupByPage,
  };
}

describe(
  'IncrementalSearchIndexer',
  () => {
    beforeEach(() => {
      SearchIndexer.clearAll();
      vi.restoreAllMocks();
    });

    it('indexes current and nearby pages before distant background pages and publishes partial hits', async () => {
      const pageGraph =
        graph('rev-a', 5);
      const fake =
        fakeDocument(5);
      vi.spyOn(
        PdfRendererAdapter,
        'getPageTextItems',
      ).mockImplementation(
        async (page) => [{
          id:
            'text-'
            + page.pageNumber,
          text:
            page.pageNumber === 3
              ? 'needle current page'
              : 'page '
                + page.pageNumber,
          x: 10,
          y: 20,
          width: 100,
          height: 12,
          fontSize: 12,
        }],
      );

      const observed: number[] = [];
      let partialHitCount = 0;

      await indexPdfDocumentIncrementally({
        doc: fake.doc,
        revisionId: 'rev-a',
        pageGraph,
        currentPage: 3,
        nearbyRadius: 1,
        batchSize: 2,
        ownerToken: 'owner-a',
        onPageIndexed: ({
          pageNumber,
        }) => {
          observed.push(pageNumber);
          if (pageNumber === 3) {
            partialHitCount =
              SearchIndexer
                .searchRevision(
                  'rev-a',
                  pageGraph,
                  'needle',
                  {
                    caseSensitive: false,
                    wholeWord: false,
                    useRegex: false,
                  },
                )
                .length;
          }
        },
      });

      expect(observed).toEqual([
        3,
        2,
        4,
        1,
        5,
      ]);
      expect(
        fake.getPage.mock.calls.map(
          ([pageNumber]) =>
            pageNumber,
        ),
      ).toEqual([
        3,
        2,
        4,
        1,
        5,
      ]);
      expect(partialHitCount)
        .toBe(1);
      expect(
        SearchIndexer.getProgress(
          'rev-a',
          pageGraph,
        ),
      ).toMatchObject({
        indexedPages: 5,
        totalPages: 5,
        complete: true,
      });

      for (
        const cleanup of
          fake.cleanupByPage.values()
      ) {
        expect(cleanup)
          .toHaveBeenCalled();
      }
    });

    it('yields between bounded batches so cancellation prevents distant page extraction', async () => {
      const pageGraph =
        graph('rev-a', 5);
      const fake =
        fakeDocument(5);
      vi.spyOn(
        PdfRendererAdapter,
        'getPageTextItems',
      ).mockImplementation(
        async (page) => [{
          id:
            'text-'
            + page.pageNumber,
          text:
            'page '
            + page.pageNumber,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fontSize: 10,
        }],
      );

      const controller =
        new AbortController();

      await expect(
        indexPdfDocumentIncrementally({
          doc: fake.doc,
          revisionId: 'rev-a',
          pageGraph,
          currentPage: 3,
          nearbyRadius: 1,
          batchSize: 1,
          ownerToken:
            'owner-cancel',
          signal:
            controller.signal,
          onPageIndexed: ({
            pageNumber,
          }) => {
            if (pageNumber === 3) {
              controller.abort(
                'test cancellation',
              );
            }
          },
        }),
      ).rejects.toBeTruthy();

      expect(
        fake.getPage.mock.calls.map(
          ([pageNumber]) =>
            pageNumber,
        ),
      ).toEqual([3]);
      expect(
        SearchIndexer.getPageRecord(
          'rev-a',
          'page-3',
        )?.status,
      ).toBe('indexed');
      expect(
        SearchIndexer.getPageRecord(
          'rev-a',
          'page-2',
        )?.status,
      ).toBe('unindexed');
    });

    it('does not reacquire text for pages already indexed in the same revision', async () => {
      const pageGraph =
        graph('rev-a', 2);
      const first =
        fakeDocument(2);
      const textSpy =
        vi.spyOn(
          PdfRendererAdapter,
          'getPageTextItems',
        )
          .mockImplementation(
            async (page) => [{
              id:
                'text-'
                + page.pageNumber,
              text:
                'indexed '
                + page.pageNumber,
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              fontSize: 10,
            }],
          );

      await indexPdfDocumentIncrementally({
        doc: first.doc,
        revisionId: 'rev-a',
        pageGraph,
        currentPage: 1,
        ownerToken: 'owner-first',
      });

      const second =
        fakeDocument(2);
      await indexPdfDocumentIncrementally({
        doc: second.doc,
        revisionId: 'rev-a',
        pageGraph,
        currentPage: 2,
        ownerToken:
          'owner-second',
      });

      expect(textSpy)
        .toHaveBeenCalledTimes(2);
      expect(second.getPage)
        .not.toHaveBeenCalled();
    });
  },
);
