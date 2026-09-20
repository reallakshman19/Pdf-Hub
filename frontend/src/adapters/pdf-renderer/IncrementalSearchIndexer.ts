import type {
  PDFDocumentProxy,
} from 'pdfjs-dist';

import {
  PdfRendererAdapter,
} from './PdfRendererAdapter';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  SearchIndexer,
} from '@/core/search/indexer';
import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import type {
  SearchIndexProgress,
} from '@/core/search/types';

export interface IncrementalPdfTextIndexInput {
  doc: PDFDocumentProxy;
  revisionId: string;
  pageGraph: PageGraph<PageNode>;
  currentPage: number;
  requestedPageNumbers?: readonly number[];
  nearbyRadius?: number;
  batchSize?: number;
  ownerToken?: string;
  signal?: AbortSignal;
  onProgress?: (
    progress: SearchIndexProgress,
  ) => void;
  onPageIndexed?: (input: {
    revisionId: string;
    pageId: PageId;
    pageNumber: number;
    progress: SearchIndexProgress;
  }) => void;
}

export interface IncrementalPdfTextIndexResult {
  ownerToken: string;
  progress: SearchIndexProgress;
}

function createOwnerToken(): string {
  const cryptoObject =
    globalThis.crypto;
  if (
    cryptoObject
    && typeof cryptoObject.randomUUID
      === 'function'
  ) {
    return (
      'search-index:'
      + cryptoObject.randomUUID()
    );
  }

  return (
    'search-index:'
    + Date.now()
    + ':'
    + Math.random()
      .toString(36)
      .slice(2, 10)
  );
}

async function yieldToBrowser(
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(
    signal,
    'yield incremental search indexing',
  );
  await raceWithAbort(
    new Promise<void>((resolve) => {
      globalThis.setTimeout(
        resolve,
        0,
      );
    }),
    signal,
    'yield incremental search indexing',
  );
}

function progressFor(
  revisionId: string,
  pageGraph: PageGraph<PageNode>,
): SearchIndexProgress {
  return SearchIndexer.getProgress(
    revisionId,
    pageGraph,
  );
}

export async function indexPdfDocumentIncrementally(
  input: IncrementalPdfTextIndexInput,
): Promise<IncrementalPdfTextIndexResult> {
  const ownerToken =
    input.ownerToken
    ?? createOwnerToken();
  const batchSize =
    Math.max(
      1,
      Math.floor(
        input.batchSize ?? 2,
      ),
    );

  SearchIndexer.prepareRevision(
    input.revisionId,
    input.pageGraph,
  );

  const schedule =
    SearchIndexer.createPageSchedule({
      pageCount:
        input.pageGraph.pages.length,
      currentPage:
        input.currentPage,
      nearbyRadius:
        input.nearbyRadius,
      requestedPageNumbers:
        input.requestedPageNumbers,
    });

  for (const pageNumber of schedule) {
    const pageNode =
      input.pageGraph
        .pages[pageNumber - 1];
    if (!pageNode) continue;

    const current =
      SearchIndexer.getPageRecord(
        input.revisionId,
        pageNode.pageId,
      );
    if (
      current?.status === 'indexed'
    ) {
      continue;
    }

    SearchIndexer.markQueued(
      input.revisionId,
      pageNode.pageId,
      ownerToken,
    );
  }

  input.onProgress?.(
    progressFor(
      input.revisionId,
      input.pageGraph,
    ),
  );

  let pagesSinceYield = 0;

  try {
    for (
      const pageNumber of schedule
    ) {
      throwIfAborted(
        input.signal,
        'index PDF search page',
      );

      const pageNode =
        input.pageGraph
          .pages[pageNumber - 1];
      if (!pageNode) continue;

      const current =
        SearchIndexer.getPageRecord(
          input.revisionId,
          pageNode.pageId,
        );
      if (
        current?.status === 'indexed'
      ) {
        continue;
      }

      SearchIndexer.markIndexing(
        input.revisionId,
        pageNode.pageId,
        ownerToken,
      );
      const owned =
        SearchIndexer.getPageRecord(
          input.revisionId,
          pageNode.pageId,
        );
      if (
        owned?.status !== 'indexing'
        || owned.ownerToken
          !== ownerToken
      ) {
        continue;
      }

      let page:
        Awaited<
          ReturnType<
            PDFDocumentProxy['getPage']
          >
        >
        | null = null;

      try {
        const pagePromise =
          input.doc.getPage(pageNumber);
        page = await raceWithAbort(
          pagePromise,
          input.signal,
          'load PDF page for incremental search indexing',
          () => {
            void pagePromise
              .then(
                (latePage) =>
                  latePage.cleanup(),
              )
              .catch(
                () => undefined,
              );
          },
        );

        const textItems =
          await PdfRendererAdapter
            .getPageTextItems(
              page,
              1,
              input.signal,
            );

        SearchIndexer.setPageText(
          input.revisionId,
          pageNode.pageId,
          ownerToken,
          textItems.map(
            (item) => ({
              str: item.text,
              rect: {
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              },
            }),
          ),
        );

        const progress =
          progressFor(
            input.revisionId,
            input.pageGraph,
          );
        input.onPageIndexed?.({
          revisionId:
            input.revisionId,
          pageId:
            pageNode.pageId,
          pageNumber,
          progress,
        });
        input.onProgress?.(progress);
      } catch (indexError) {
        if (
          isOperationCancelledError(
            indexError,
          )
          || input.signal?.aborted
        ) {
          throw indexError;
        }

        SearchIndexer.markFailed(
          input.revisionId,
          pageNode.pageId,
          ownerToken,
          indexError instanceof Error
            ? indexError.message
            : String(indexError),
        );
        input.onProgress?.(
          progressFor(
            input.revisionId,
            input.pageGraph,
          ),
        );
      } finally {
        page?.cleanup();
      }

      pagesSinceYield += 1;
      if (
        pagesSinceYield >= batchSize
      ) {
        pagesSinceYield = 0;
        await yieldToBrowser(
          input.signal,
        );
      }
    }
  } finally {
    SearchIndexer.releaseOwner(
      input.revisionId,
      ownerToken,
    );
  }

  const progress =
    progressFor(
      input.revisionId,
      input.pageGraph,
    );
  input.onProgress?.(progress);

  return {
    ownerToken,
    progress,
  };
}
