import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import {
  PdfRendererAdapter,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  indexPdfDocumentIncrementally,
} from '@/adapters/pdf-renderer/IncrementalSearchIndexer';
import {
  pdfLibMutationEngine,
} from '@/adapters/pdf-mutation/PdfLibMutationEngine';
import {
  materializeDocumentSource,
} from '@/core/document-source/materialize';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import {
  SearchIndexer,
} from '@/core/search/indexer';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import type {
  CommitRevisionInput,
  StoredRevision,
  WorkingRevisionStore,
} from '@/core/revision-store/types';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import type {
  HistoryJournalManifest,
} from '@/core/document-history/journal/types';
import {
  planHistoryRecovery,
} from '@/core/document-history/journal/recoveryPlanner';
import {
  resolveHistoryRecoveryPlan,
} from '@/core/document-history/journal/recoveryResolver';
import {
  executeHistoryRecovery,
} from '@/core/document-history/journal/recoveryExecutor';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import type {
  WriterPersistenceAdapterV2,
} from '@/core/writer-v2/persistence/indexedDbWriterStore';

interface FixtureRecord {
  fixture_id: string;
  kind: string;
  page_count: number;
  filename: string;
  bytes: number;
  sha256: string;
}

interface FixtureManifest {
  generated: FixtureRecord[];
}

interface Observation {
  fixture_id: string;
  fixture_sha256: string;
  operation: string;
  page_count: number;
  elapsed_ms: number;
  metrics: Record<
    string,
    string | number | boolean | null
  >;
}

const RUN =
  process.env.PHASE8G_BENCHMARK === '1';
const describeBenchmark =
  RUN ? describe : describe.skip;

const FIXTURE_DIR =
  path.resolve(
    process.cwd(),
    process.env.PHASE8G_FIXTURE_DIR
      ?? 'performance/fixtures/phase8g',
  );
const OBSERVATION_PATH =
  path.resolve(
    process.cwd(),
    process.env.PHASE8G_OBSERVATION_PATH
      ?? 'performance/results/phase8g-observation.json',
  );
const CREATED =
  '2026-09-20T00:00:00.000Z';

function selected(
  fixture: FixtureRecord,
): boolean {
  const kinds =
    process.env.PHASE8G_KINDS
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  const pages =
    process.env.PHASE8G_PAGES
      ?.split(',')
      .map(Number)
      .filter(Number.isInteger);

  return (
    (!kinds || kinds.includes(fixture.kind))
    && (
      !pages
      || pages.includes(fixture.page_count)
    )
  );
}

function pageGraph(
  revisionId: string,
  count: number,
): PageGraph<PageNode> {
  return {
    pages: Array.from(
      { length: count },
      (_, index) => ({
        pageId: `phase8g-page-${index + 1}`,
        documentKey: revisionId,
        originalPageNumber: index + 1,
        currentIndex: index,
        width: 595.28,
        height: 841.89,
        rotation: 0 as const,
      }),
    ),
  };
}

async function measure<T>(
  operation: () => Promise<T>,
): Promise<{
  value: T;
  elapsedMs: number;
  peakMemoryBytes: number;
}> {
  let peakMemoryBytes =
    process.memoryUsage().rss;
  const timer =
    setInterval(() => {
      peakMemoryBytes =
        Math.max(
          peakMemoryBytes,
          process.memoryUsage().rss,
        );
    }, 10);
  const started =
    performance.now();

  try {
    const value =
      await operation();
    peakMemoryBytes =
      Math.max(
        peakMemoryBytes,
        process.memoryUsage().rss,
      );
    return {
      value,
      elapsedMs:
        performance.now() - started,
      peakMemoryBytes,
    };
  } finally {
    clearInterval(timer);
  }
}

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
  fixture: FixtureRecord,
  bytes: Uint8Array,
): Promise<Observation> {
  await PdfRendererAdapter
    .clearDocumentCache({
      force: true,
    });

  const cacheKey =
    'phase8g:' + fixture.sha256;
  const source =
    new MemorySource({
      id:
        'phase8g-source:'
        + fixture.sha256,
      bytes,
    });

  const measured =
    await measure(async () => {
      const lease =
        await PdfRendererAdapter
          .acquireDocumentSource({
            source,
            cacheKey,
          });
      try {
        const page =
          await lease.doc.getPage(1);
        try {
          await page.getTextContent();
        } finally {
          page.cleanup();
        }
        return diagnostic(cacheKey);
      } finally {
        await lease.release();
      }
    });

  const info =
    measured.value;
  expect(info)
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
        info?.rangeBytesDelivered ?? 0,
      range_requests:
        info?.rangeRequests ?? 0,
      max_requested_range_bytes:
        info?.maxRequestedRangeBytes
        ?? 0,
      peak_memory_bytes:
        measured.peakMemoryBytes,
      source_materialization_excluded:
        true,
    },
  };
}

async function indexingObservations(
  fixture: FixtureRecord,
  bytes: Uint8Array,
): Promise<Observation[]> {
  SearchIndexer.clearAll();
  await PdfRendererAdapter
    .clearDocumentCache({
      force: true,
    });

  const revisionId =
    'phase8g-index:'
    + fixture.sha256;
  const graph =
    pageGraph(
      revisionId,
      fixture.page_count,
    );
  const cacheKey = revisionId;
  const source =
    new MemorySource({
      id:
        'phase8g-index-source:'
        + fixture.sha256,
      bytes,
    });
  const lease =
    await PdfRendererAdapter
      .acquireDocumentSource({
        source,
        cacheKey,
      });

  try {
    let firstCurrentMs:
      number | null = null;
    let firstNearbyMs:
      number | null = null;
    const started =
      performance.now();

    const measured =
      await measure(async () =>
        indexPdfDocumentIncrementally({
          doc: lease.doc,
          revisionId,
          pageGraph: graph,
          currentPage: 1,
          nearbyRadius: 2,
          batchSize: 2,
          onPageIndexed: ({
            pageNumber,
          }) => {
            const elapsed =
              performance.now()
              - started;
            if (
              pageNumber === 1
              && firstCurrentMs === null
            ) {
              firstCurrentMs =
                elapsed;
            }
            if (
              pageNumber > 1
              && pageNumber <= 3
              && firstNearbyMs === null
            ) {
              firstNearbyMs =
                elapsed;
            }
          },
        }),
      );

    const info =
      diagnostic(cacheKey);
    const elapsedSeconds =
      Math.max(
        measured.elapsedMs / 1000,
        0.001,
      );
    const observations:
      Observation[] = [{
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
      }];

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
      {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
      },
    );
    SearchIndexer.searchRevision(
      revisionId,
      graph,
      'PHASE8G-NEEDLE',
      {
        caseSensitive: false,
        wholeWord: true,
        useRegex: false,
      },
    );
    SearchIndexer.searchRevision(
      revisionId,
      graph,
      'phase8g-[a-z]+',
      {
        caseSensitive: false,
        wholeWord: false,
        useRegex: true,
      },
    );
    observations.push({
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
          textSpy.mock.calls.length,
      },
    });
    textSpy.mockRestore();

    return observations;
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
  fixture: FixtureRecord,
  bytes: Uint8Array,
): Promise<Observation> {
  if (fixture.page_count < 4) {
    throw new Error(
      'Reprioritization benchmark requires at least 4 pages.',
    );
  }

  SearchIndexer.clearAll();
  await PdfRendererAdapter
    .clearDocumentCache({
      force: true,
    });

  const revisionId =
    'phase8g-reprioritize:'
    + fixture.sha256;
  const graph =
    pageGraph(
      revisionId,
      fixture.page_count,
    );
  const lease =
    await PdfRendererAdapter
      .acquireDocumentSource({
        source:
          new MemorySource({
            id:
              'phase8g-reprioritize-source:'
              + fixture.sha256,
            bytes,
          }),
        cacheKey: revisionId,
      });

  try {
    const firstController =
      new AbortController();
    let arrivals = 0;
    try {
      await indexPdfDocumentIncrementally({
        doc: lease.doc,
        revisionId,
        pageGraph: graph,
        currentPage: 1,
        batchSize: 1,
        signal:
          firstController.signal,
        onPageIndexed: () => {
          arrivals += 1;
          if (arrivals >= 2) {
            firstController.abort(
              'phase8g reprioritize',
            );
          }
        },
      });
    } catch (error) {
      if (!firstController.signal.aborted) {
        throw error;
      }
    }

    const secondController =
      new AbortController();
    let targetLatencyMs:
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
        signal:
          secondController.signal,
        onPageIndexed: ({
          pageNumber,
        }) => {
          if (
            pageNumber
            === fixture.page_count
          ) {
            targetLatencyMs =
              performance.now()
              - started;
            secondController.abort(
              'phase8g target reached',
            );
          }
        },
      });
    } catch (error) {
      if (!secondController.signal.aborted) {
        throw error;
      }
    }

    expect(targetLatencyMs)
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
        targetLatencyMs ?? 0,
      metrics: {
        page_jump_reprioritization_ms:
          targetLatencyMs ?? 0,
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

type MutationOperation =
  | 'mutation_rotate'
  | 'mutation_reorder'
  | 'mutation_delete'
  | 'mutation_duplicate'
  | 'mutation_insert_donor'
  | 'mutation_replace_donor'
  | 'mutation_append_donor'
  | 'save_export';

async function mutationObservation(
  fixture: FixtureRecord,
  bytes: Uint8Array,
  donorBytes: Uint8Array,
  operation: MutationOperation,
): Promise<Observation> {
  const measured =
    await measure(async () => {
      const session =
        await pdfLibMutationEngine.open({
          bytes,
        });
      try {
        if (
          operation
          === 'mutation_rotate'
        ) {
          session.rotatePages(
            [0],
            90,
          );
        } else if (
          operation
          === 'mutation_reorder'
        ) {
          await session.reorderPages(
            Array.from(
              {
                length:
                  session.pageCount,
              },
              (_, index) =>
                session.pageCount
                - index
                - 1,
            ),
          );
        } else if (
          operation
          === 'mutation_delete'
        ) {
          if (session.pageCount > 1) {
            await session.removePages([
              session.pageCount - 1,
            ]);
          }
        } else if (
          operation
          === 'mutation_duplicate'
        ) {
          await session
            .duplicatePages([0]);
        } else if (
          operation
          === 'mutation_insert_donor'
        ) {
          await session.insertPdf(
            1,
            donorBytes,
          );
        } else if (
          operation
          === 'mutation_replace_donor'
        ) {
          await session.replacePage(
            0,
            donorBytes,
            0,
          );
        } else if (
          operation
          === 'mutation_append_donor'
        ) {
          await session.appendPdfs([
            donorBytes,
          ]);
        }

        return session.commit();
      } finally {
        session.dispose();
      }
    });

  return {
    fixture_id:
      fixture.fixture_id,
    fixture_sha256:
      fixture.sha256,
    operation,
    page_count:
      fixture.page_count,
    elapsed_ms:
      measured.elapsedMs,
    metrics: {
      input_full_byte_materialization:
        true,
      output_full_byte_materialization:
        true,
      input_bytes:
        bytes.byteLength,
      output_bytes:
        measured.value.bytes.byteLength,
      output_page_count:
        measured.value.pageCount,
      peak_memory_bytes:
        measured.peakMemoryBytes,
      memory_metric:
        'process.rss',
    },
  };
}

class BenchmarkRevisionStore
implements WorkingRevisionStore {
  readonly id: string;
  readonly kind = 'opfs' as const;
  readonly capabilities =
    Object.freeze({
      persistent: true,
      atomicCommit: true,
      randomAccess: true,
    });
  private readonly revisions =
    new Map<string, Uint8Array>();

  constructor(id: string) {
    this.id = id;
  }

  seed(
    revisionId: string,
    bytes: Uint8Array,
  ): void {
    this.revisions.set(
      revisionId,
      Uint8Array.from(bytes),
    );
  }

  storageBytes(): number {
    return [
      ...this.revisions.values(),
    ].reduce(
      (sum, value) =>
        sum + value.byteLength,
      0,
    );
  }

  async commit(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    const sourceBytes =
      await materializeDocumentSource(
        input.source,
        {
          signal: input.signal,
        },
      );
    this.seed(
      input.revisionId,
      sourceBytes,
    );
    return {
      revisionId:
        input.revisionId,
      sourceId:
        this.id
        + ':'
        + input.revisionId,
      storeId: this.id,
      storeKind: this.kind,
      size:
        sourceBytes.byteLength,
      persistent: true,
    };
  }

  async open(
    revisionId: string,
  ): Promise<MemorySource> {
    const bytes =
      this.revisions.get(
        revisionId,
      );
    if (!bytes) {
      throw new Error(
        'Missing benchmark revision '
        + revisionId,
      );
    }
    return new MemorySource({
      id:
        this.id
        + ':'
        + revisionId,
      bytes,
    });
  }

  async has(
    revisionId: string,
  ): Promise<boolean> {
    return this.revisions
      .has(revisionId);
  }

  async listRevisionIds():
  Promise<string[]> {
    return [
      ...this.revisions.keys(),
    ].sort();
  }

  async remove(
    revisionId: string,
  ): Promise<void> {
    this.revisions.delete(
      revisionId,
    );
  }

  async clear(): Promise<void> {
    this.revisions.clear();
  }
}

class BenchmarkJournalStore
implements HistoryJournalStore {
  readonly id: string;
  readonly capabilities =
    Object.freeze({
      persistent: true,
    });
  private readonly manifests =
    new Map<
      string,
      HistoryJournalManifest
    >();

  constructor(id: string) {
    this.id = id;
  }

  storageBytes(): number {
    const encoder =
      new TextEncoder();
    return [
      ...this.manifests.values(),
    ].reduce(
      (sum, manifest) =>
        sum
        + encoder.encode(
            JSON.stringify(manifest),
          ).byteLength,
      0,
    );
  }

  async save(
    manifest: HistoryJournalManifest,
  ): Promise<void> {
    this.manifests.set(
      manifest.journalId,
      structuredClone(manifest),
    );
  }

  async load(
    journalId: string,
  ): Promise<HistoryJournalManifest | null> {
    const manifest =
      this.manifests.get(journalId);
    return manifest
      ? structuredClone(manifest)
      : null;
  }

  async listByOriginalRevision(
    originalRevisionId: string,
  ): Promise<HistoryJournalManifest[]> {
    return [
      ...this.manifests.values(),
    ]
      .filter(
        (manifest) =>
          manifest.originalRevisionId
          === originalRevisionId,
      )
      .map(
        (manifest) =>
          structuredClone(manifest),
      );
  }

  async listAll():
  Promise<HistoryJournalManifest[]> {
    return [
      ...this.manifests.values(),
    ].map(
      (manifest) =>
        structuredClone(manifest),
    );
  }

  async remove(
    journalId: string,
  ): Promise<void> {
    this.manifests.delete(
      journalId,
    );
  }
}

const writerPersistence:
WriterPersistenceAdapterV2 = {
  async saveDocument() {},
  async loadDocument() {
    return null;
  },
  async deleteDocument() {},
  async saveAsset() {},
  async loadAsset() {
    return null;
  },
  async listAssets() {
    return [];
  },
  async deleteAsset() {},
};

function recoveryManifest(
  fixture: FixtureRecord,
  storeId: string,
): HistoryJournalManifest {
  const original =
    'sha256:phase8g-original:'
    + fixture.sha256;
  const active =
    'sha256:phase8g-active:'
    + fixture.sha256;
  const journalId =
    'phase8g-journal:'
    + fixture.sha256;
  const transactionId =
    'phase8g-checkpoint';
  const graph =
    pageGraph(
      active,
      fixture.page_count,
    );
  const command =
    materializePdfCommand(
      {
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      'system',
      original,
      {
        id:
          'phase8g-recovery-command',
        createdAt: CREATED,
      },
    );

  return {
    schemaVersion: 1,
    journalId,
    revisionStoreId:
      storeId,
    originalRevisionId:
      original,
    activeRevisionId:
      active,
    activeTransactionId:
      transactionId,
    fileName:
      fixture.filename,
    createdAt: CREATED,
    updatedAt: CREATED,
    checkpoints: [{
      checkpointId:
        journalId
        + ':admission',
      kind: 'ADMISSION',
      revision: {
        storeId,
        revisionId: original,
      },
      createdAt: CREATED,
    }, {
      checkpointId:
        journalId
        + ':checkpoint',
      kind: 'PERIODIC',
      revision: {
        storeId,
        revisionId: active,
      },
      transactionId,
      createdAt: CREATED,
      statePayload: {
        schemaVersion: 2,
        pageCount:
          fixture.page_count,
        pageGraph: graph,
        documentKey: active,
        selectedPageIds: [
          graph.pages[0]!.pageId,
        ],
        selectedPages: [1],
        currentPageId:
          graph.pages[0]!.pageId,
        currentPage: 1,
        annotations: [],
        writer: {
          documentMode:
            'pdfOverlay',
          elements: [],
          selectedIds: [],
          activeId: null,
        },
        ocr: {
          documentFingerprint:
            active,
          result: null,
          corrections: [],
          regions: [],
          selectedPageIndexes: [],
          reviewFocus: null,
        },
      },
    }],
    entries: [{
      entryId:
        journalId
        + ':entry:'
        + transactionId,
      transactionId,
      command,
      disposition:
        'SELF_CONTAINED_REPLAY',
      barriers: [],
      beforeRevision: {
        storeId,
        revisionId: original,
      },
      afterRevision: {
        storeId,
        revisionId: active,
      },
      createdAt: CREATED,
    }],
  };
}

async function recoveryObservation(
  fixture: FixtureRecord,
  bytes: Uint8Array,
): Promise<Observation> {
  clearWorkingRevisionStoreRegistryForTests();
  clearHistoryJournalStoreRegistryForTests();
  resetDocumentOperationQueueForTests();

  const storeId =
    'phase8g-revisions:'
    + fixture.sha256;
  const revisionStore =
    new BenchmarkRevisionStore(
      storeId,
    );
  const journalStore =
    new BenchmarkJournalStore(
      'phase8g-journals:'
      + fixture.sha256,
    );
  const manifest =
    recoveryManifest(
      fixture,
      storeId,
    );

  revisionStore.seed(
    manifest.originalRevisionId,
    bytes,
  );
  revisionStore.seed(
    manifest.activeRevisionId,
    bytes,
  );
  await journalStore.save(
    manifest,
  );
  registerWorkingRevisionStore(
    revisionStore,
  );
  registerHistoryJournalStore(
    journalStore,
  );

  try {
    const measured =
      await measure(async () => {
        const planned =
          planHistoryRecovery(
            manifest,
          );
        if (!planned.ok) {
          throw new Error(
            'Recovery planning failed: '
            + planned.code,
          );
        }
        const resolved =
          await resolveHistoryRecoveryPlan(
            planned.plan,
          );
        return executeHistoryRecovery({
          resolved,
          journalStoreId:
            journalStore.id,
          dependencies: {
            persistAnnotations:
              async () => {},
            writerPersistence,
          },
        });
      });

    return {
      fixture_id:
        fixture.fixture_id,
      fixture_sha256:
        fixture.sha256,
      operation:
        'recovery_restore',
      page_count:
        fixture.page_count,
      elapsed_ms:
        measured.elapsedMs,
      metrics: {
        retained_revision_storage_bytes:
          revisionStore
            .storageBytes(),
        journal_storage_bytes:
          journalStore
            .storageBytes(),
        replayed_transactions:
          measured.value
            .replayedTransactionIds
            .length,
        peak_memory_bytes:
          measured.peakMemoryBytes,
        memory_metric:
          'process.rss',
      },
    };
  } finally {
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
    resetDocumentOperationQueueForTests();
  }
}

function gitHead(): string {
  return execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  ).trim();
}

function environment() {
  const cpus = os.cpus();
  return {
    commit_sha:
      gitHead(),
    runtime: 'node',
    runtime_version:
      process.version,
    browser:
      'not-applicable-node-driver',
    browser_version:
      'not-applicable',
    os:
      os.platform()
      + ' '
      + os.release(),
    cpu:
      cpus[0]?.model
      ?? 'unknown',
    logical_cores:
      cpus.length,
    memory_bytes:
      os.totalmem(),
  };
}

describeBenchmark(
  'Phase 8G large-document benchmark driver',
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
      'records renderer, indexing, mutation and recovery observations',
      async () => {
        const manifest =
          JSON.parse(
            await fs.readFile(
              path.join(
                FIXTURE_DIR,
                'manifest.json',
              ),
              'utf8',
            ),
          ) as FixtureManifest;
        const fixtures =
          manifest.generated
            .filter(selected);
        expect(fixtures.length)
          .toBeGreaterThan(0);

        const nativeDonor =
          manifest.generated
            .filter(
              (fixture) =>
                fixture.kind
                === 'native_text',
            )
            .sort(
              (left, right) =>
                left.page_count
                - right.page_count,
            )[0];
        if (!nativeDonor) {
          throw new Error(
            'Phase 8G benchmark requires a native-text donor fixture.',
          );
        }
        const donorBytes =
          Uint8Array.from(
            await fs.readFile(
              path.join(
                FIXTURE_DIR,
                nativeDonor.filename,
              ),
            ),
          );

        const observations:
          Observation[] = [];

        for (
          const fixture
          of fixtures
        ) {
          const bytes =
            Uint8Array.from(
              await fs.readFile(
                path.join(
                  FIXTURE_DIR,
                  fixture.filename,
                ),
              ),
            );

          observations.push(
            await rangeObservation(
              fixture,
              bytes,
            ),
          );
          observations.push(
            ...await indexingObservations(
              fixture,
              bytes,
            ),
          );
          observations.push(
            await reprioritizationObservation(
              fixture,
              bytes,
            ),
          );

          for (
            const operation
            of [
              'mutation_rotate',
              'mutation_reorder',
              'mutation_delete',
              'mutation_duplicate',
              'mutation_insert_donor',
              'mutation_replace_donor',
              'mutation_append_donor',
              'save_export',
            ] as const
          ) {
            observations.push(
              await mutationObservation(
                fixture,
                bytes,
                donorBytes,
                operation,
              ),
            );
          }

          observations.push(
            await recoveryObservation(
              fixture,
              bytes,
            ),
          );
        }

        await fs.mkdir(
          path.dirname(
            OBSERVATION_PATH,
          ),
          {
            recursive: true,
          },
        );
        await fs.writeFile(
          OBSERVATION_PATH,
          JSON.stringify(
            {
              schema_version:
                'phase8g-benchmark-observation-v1',
              environment:
                environment(),
              measurements:
                observations,
            },
            null,
            2,
          ) + '\n',
          'utf8',
        );

        expect(observations.length)
          .toBeGreaterThan(0);
      },
      30 * 60 * 1000,
    );
  },
);
