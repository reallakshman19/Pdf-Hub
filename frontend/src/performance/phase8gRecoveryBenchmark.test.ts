import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  MemorySource,
} from '@/adapters/document-source/MemorySource';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  materializeDocumentSource,
} from '@/core/document-source/materialize';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import {
  executeHistoryRecovery,
} from '@/core/document-history/journal/recoveryExecutor';
import {
  planHistoryRecovery,
} from '@/core/document-history/journal/recoveryPlanner';
import {
  resolveHistoryRecoveryPlan,
} from '@/core/document-history/journal/recoveryResolver';
import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import type {
  HistoryJournalManifest,
} from '@/core/document-history/journal/types';
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
  createMemoryWriterPersistence,
} from '@/core/writer-v2/persistence/indexedDbWriterStore';

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
    .PHASE8G_RECOVERY_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-recovery-observation.json';
const CREATED =
  '2026-09-20T00:00:00.000Z';

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
      (sum, bytes) =>
        sum + bytes.byteLength,
      0,
    );
  }

  async commit(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    const bytes =
      await materializeDocumentSource(
        input.source,
        {
          signal: input.signal,
        },
      );
    this.seed(
      input.revisionId,
      bytes,
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
      size: bytes.byteLength,
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

function manifestFor(
  fixture: Phase8gFixtureRecord,
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
    phase8gPageGraph(
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
  fixture: Phase8gFixtureRecord,
  bytes: Uint8Array,
): Promise<Phase8gObservation> {
  clearWorkingRevisionStoreRegistryForTests();
  clearHistoryJournalStoreRegistryForTests();
  resetDocumentOperationQueueForTests();

  const revisionStore =
    new BenchmarkRevisionStore(
      'phase8g-revisions:'
      + fixture.sha256,
    );
  const journalStore =
    new BenchmarkJournalStore(
      'phase8g-journals:'
      + fixture.sha256,
    );
  const manifest =
    manifestFor(
      fixture,
      revisionStore.id,
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
      await measurePhase8g(
        async () => {
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
              writerPersistence:
                createMemoryWriterPersistence(),
            },
          });
        },
      );

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
        storage_surface:
          'persistent-capability benchmark stores',
      },
    };
  } finally {
    clearWorkingRevisionStoreRegistryForTests();
    clearHistoryJournalStoreRegistryForTests();
    resetDocumentOperationQueueForTests();
  }
}

describeBenchmark(
  'Phase 8G recovery benchmarks',
  () => {
    it(
      'records canonical recovery observations',
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
          observations.push(
            await recoveryObservation(
              fixture,
              await readPhase8gFixture(
                fixture,
              ),
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
