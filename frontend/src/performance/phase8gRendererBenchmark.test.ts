import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  MemorySource,
} from '@/adapters/document-source/MemorySource';
import {
  indexPdfDocumentIncrementally,
} from '@/adapters/pdf-renderer/IncrementalSearchIndexer';
import {
  PdfRendererAdapter,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  IncrementalSearchResults,
} from '@/core/search/incrementalResults';
import {
  SearchIndexer,
} from '@/core/search/indexer';

import {
  PHASE8G_RUN,
  loadPhase8gFixtures,
  measurePhase8g,
  phase8gPageGraph,
  readPhase8gFixture,
  writePhase8gObservation,
  type Phase8gFixtureRecord,
  type Phase8gObservation,
} from './phase8gBenchmarkSupport';

const describeBenchmark =
  PHASE8G_RUN
    ? describe
    : describe.skip;
const OUTPUT =
  process.env
    .PHASE8G_RENDERER_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-renderer-observation.json';
const OPTIONS = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

function diagnostic(
  cacheKey: string,
) {
  return PdfRendererAdapter
    .getDocumentSourceCacheDiagnostics()
    .find(
      (entry) =>
        entry.cacheKey === cacheKey,
    );
}

async function rangeObservation(
  fixture: Phase8gFixtureRecord,
  bytes: Uint8Array,
): Promise<Phase8gObservation> {
  await PdfRendererAdapter
    .clearDocumentCache({
      force: true,
    });

  const cacheKey =
    'phase8g:'
    + fixture.sha256;
  const source =
    new MemorySource({
      id:
        'phase8g-source:'
        + fixture.sha256,
      bytes,
    });
  const measured =
    await measurePhase8g(
      async () => {
        const lease =
          await PdfRendererAdapter
            .acquireDocumentSource({
              source,
              cacheKey,
            });
        try {
          const page =
            await lease.doc
              .getPage(1);
          try {
            await page
              .getTextContent();
          } finally {
            page.cleanup();
          }
          return diagnostic(
            cacheKey,
          );
        } finally {
          await lease.release();
        }
      },
    );

  expect(measured.value)
    .toBeDefined();

  return {
    fixture_id:
      fixture.fixture_id,
    fixture_sha256:
      fixture.sha256,
    operation:
      'range_backed_first_page',
    page_count:
      fixture.page_count,
    elapsed_ms:
      measured.elapsedMs,
    metrics: {
      file_bytes:
        bytes.byteLength,
      range_bytes_before_first_page:
        measured.value
          ?.rangeBytesDelivered
        ?? 0,
      range_requests:
        measured.value
          ?.rangeRequests
        ?? 0,
      max_requested_range_bytes:
        measured.value
          ?.maxRequestedRangeBytes
        ?? 0,
      peak_memory_bytes:
        measured.peakMemoryBytes,
      source_materialization_excluded:
        true,
    },
  };
}

async function indexingObservations(
  fixture: Phase8gFixtureRecord,
  bytes: Uint8Array,
): Promise<Phase8gObservation[]> {
  SearchIndexer.clearAll();
  await PdfRendererAdapter
    .clearDocumentCache({
      force: true,
    });

  const revisionId =
    'phase8g-index:'
    + fixture.sha256;
  const graph =
    phase8gPageGraph(
      revisionId,
      fixture.page_count,
    );
  const lease =
    await PdfRendererAdapter
      .acquireDocumentSource({
        source:
          new MemorySource({
            id:
              'phase8g-index-source:'
              + fixture.sha256,
            bytes,
          }),
        cacheKey: revisionId,
      });

  try {
    const results =
      new IncrementalSearchResults();
    results.rebuild(
      revisionId,
      graph,
      'phase8g-needle',
      OPTIONS,
    );
    const pageMatchSpy =
      vi.spyOn(
        SearchIndexer,
        'searchPage',
      );
    pageMatchSpy.mockClear();

    let firstCurrentMs:
      number | null = null;
    let firstNearbyMs:
      number | null = null;
    const started =
      performance.now();

    const measured =
      await measurePhase8g(
        async () =>
          indexPdfDocumentIncrementally({
            doc: lease.doc,
            revisionId,
            pageGraph: graph,
            currentPage: 1,
            nearbyRadius: 2,
            batchSize: 2,
            onPageIndexed: ({
              pageId,
              pageNumber,
            }) => {
              const elapsed =
                performance.now()
                - started;
              if (
                pageNumber === 1
                && firstCurrentMs
                  === null
              ) {
                firstCurrentMs =
                  elapsed;
              }
              if (
                pageNumber > 1
                && pageNumber <= 3
                && firstNearbyMs
                  === null
              ) {
                firstNearbyMs =
                  elapsed;
              }
              results.updatePage(
                revisionId,
                graph,
                pageId,
                pageNumber,
                'phase8g-needle',
                OPTIONS,
              );
            },
          }),
      );

    const pageMatchCalls =
      pageMatchSpy.mock.calls.length;
    pageMatchSpy.mockRestore();
    const info =
      diagnostic(revisionId);
    const elapsedSeconds =
      Math.max(
        measured.elapsedMs
          / 1000,
        0.001,
      );

    const textSpy =
      vi.spyOn(
        PdfRendererAdapter,
        'getPageTextItems',
      );
    textSpy.mockClear();
    SearchIndexer.searchRevision(
      revisionId,
      graph,
      'phase8g-needle',
      OPTIONS,
    );
    SearchIndexer.searchRevision(
      revisionId,
      graph,
      'PHASE8G-NEEDLE',
      {
        ...OPTIONS,
        wholeWord: true,
      },
    );
    SearchIndexer.searchRevision(
      revisionId,
      graph,
      'phase8g-[a-z]+',
      {
        ...OPTIONS,
        useRegex: true,
      },
    );
    const reextractions =
      textSpy.mock.calls.length;
    textSpy.mockRestore();

    return [{
      fixture_id:
        fixture.fixture_id,
      fixture_sha256:
        fixture.sha256,
      operation:
        'incremental_indexing',
      page_count:
        fixture.page_count,
      elapsed_ms:
        measured.elapsedMs,
      metrics: {
        current_page_result_ms:
          firstCurrentMs,
        nearby_page_result_ms:
          firstNearbyMs,
        pages_per_second:
          fixture.page_count
          / elapsedSeconds,
        indexed_pages:
          measured.value
            .progress
            .indexedPages,
        failed_pages:
          measured.value
            .progress
            .failedPages,
        range_requests:
          info?.rangeRequests ?? 0,
        range_bytes:
          info?.rangeBytesDelivered
          ?? 0,
        max_requested_range_bytes:
          info?.maxRequestedRangeBytes
          ?? 0,
        peak_memory_bytes:
          measured.peakMemoryBytes,
      },
    }, {
      fixture_id:
        fixture.fixture_id,
      fixture_sha256:
        fixture.sha256,
      operation:
        'active_query_page_arrival_matching',
      page_count:
        fixture.page_count,
      elapsed_ms:
        measured.elapsedMs,
      metrics: {
        newly_indexed_pages:
          measured.value
            .progress
            .indexedPages,
        page_match_calls:
          pageMatchCalls,
      },
    }, {
      fixture_id:
        fixture.fixture_id,
      fixture_sha256:
        fixture.sha256,
      operation:
        'query_change_reextraction',
      page_count:
        fixture.page_count,
      elapsed_ms: 0,
      metrics: {
        pdf_text_extractions:
          reextractions,
      },
    }];
  } finally {
    await lease.release();
    SearchIndexer.clearAll();
    await PdfRendererAdapter
      .clearDocumentCache({
        force: true,
      });
  }
}

async function reprioritizationObservation(
  fixture: Phase8gFixtureRecord,
  bytes: Uint8Array,
): Promise<Phase8gObservation> {
  const revisionId =
    'phase8g-reprioritize:'
    + fixture.sha256;
  const graph =
    phase8gPageGraph(
      revisionId,
      fixture.page_count,
    );
  const lease =
    await PdfRendererAdapter
      .acquireDocumentSource({
        source:
          new MemorySource({
            id:
              revisionId,
            bytes,
          }),
        cacheKey: revisionId,
      });

  try {
    const first =
      new AbortController();
    let arrivals = 0;
    try {
      await indexPdfDocumentIncrementally({
        doc: lease.doc,
        revisionId,
        pageGraph: graph,
        currentPage: 1,
        batchSize: 1,
        signal: first.signal,
        onPageIndexed: () => {
          arrivals += 1;
          if (arrivals >= 2) {
            first.abort(
              'reprioritize',
            );
          }
        },
      });
    } catch (error) {
      if (!first.signal.aborted) {
        throw error;
      }
    }

    const second =
      new AbortController();
    let latency:
      number | null = null;
    const started =
      performance.now();
    try {
      await indexPdfDocumentIncrementally({
        doc: lease.doc,
        revisionId,
        pageGraph: graph,
        currentPage:
          fixture.page_count,
        batchSize: 1,
        signal: second.signal,
        onPageIndexed: ({
          pageNumber,
        }) => {
          if (
            pageNumber
            === fixture.page_count
          ) {
            latency =
              performance.now()
              - started;
            second.abort(
              'target reached',
            );
          }
        },
      });
    } catch (error) {
      if (!second.signal.aborted) {
        throw error;
      }
    }

    expect(latency)
      .not.toBeNull();
    return {
      fixture_id:
        fixture.fixture_id,
      fixture_sha256:
        fixture.sha256,
      operation:
        'cancellation_reprioritization',
      page_count:
        fixture.page_count,
      elapsed_ms:
        latency ?? 0,
      metrics: {
        page_jump_reprioritization_ms:
          latency ?? 0,
        initial_pages_before_cancel:
          arrivals,
      },
    };
  } finally {
    await lease.release();
    SearchIndexer.clearAll();
    await PdfRendererAdapter
      .clearDocumentCache({
        force: true,
      });
  }
}

describeBenchmark(
  'Phase 8G renderer/search benchmarks',
  () => {
    afterEach(async () => {
      vi.restoreAllMocks();
      SearchIndexer.clearAll();
      await PdfRendererAdapter
        .clearDocumentCache({
          force: true,
        });
    });

    it(
      'records range, indexing and reprioritization observations',
      async () => {
        const fixtures =
          await loadPhase8gFixtures();
        expect(fixtures.length)
          .toBeGreaterThan(0);
        const observations:
          Phase8gObservation[] = [];

        for (
          const fixture
          of fixtures
        ) {
          const bytes =
            await readPhase8gFixture(
              fixture,
            );
          observations.push(
            await rangeObservation(
              fixture,
              bytes,
            ),
            ...await indexingObservations(
              fixture,
              bytes,
            ),
            await reprioritizationObservation(
              fixture,
              bytes,
            ),
          );
        }

        await writePhase8gObservation(
          OUTPUT,
          observations,
        );
        expect(observations.length)
          .toBeGreaterThan(0);
      },
      30 * 60 * 1000,
    );
  },
);
