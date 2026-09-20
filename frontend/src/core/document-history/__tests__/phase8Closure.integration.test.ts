import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import {
  useAnnotationStore,
} from '@/core/annotations/store';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  materializePdfCommand,
  type CommandExecutionInput,
  type CommandResult,
} from '@/core/commands/types';
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
  HistoryJournalManifest,
} from '@/core/document-history/journal/types';
import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import {
  executeRevisionGarbageCollection,
  planLiveRevisionGarbageCollection,
} from '@/core/document-history/revision-gc';
import {
  useHistoryStore,
} from '@/core/document-history/store';
import {
  useOcrStore,
} from '@/core/ocr/ocrStore';
import {
  clearRevisionPinsForTests,
} from '@/core/revision-store/pins';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import {
  releaseActiveSessionRevisionGcBlocker,
} from '@/core/revision-store/sessionGcBlocker';
import type {
  CommitRevisionInput,
  StoredRevision,
  WorkingRevisionStore,
} from '@/core/revision-store/types';
import {
  useSessionStore,
} from '@/core/session/store';
import type {
  WriterAssetRecordV2,
  WriterDocumentRecordV2,
  WriterPersistenceAdapterV2,
} from '@/core/writer-v2/persistence/indexedDbWriterStore';
import {
  useWriterV2Store,
} from '@/core/writer-v2/writerV2Store';
import {
  materializeDocumentSource,
} from '@/core/document-source/materialize';

const REVISION_STORE_ID =
  'closure-revisions';
const JOURNAL_STORE_ID =
  'closure-journals';
const JOURNAL_ID =
  'closure-history';

const ORIGINAL =
  'sha256:closure-original';
const BINARY =
  'sha256:closure-binary';
const CHECKPOINT =
  'sha256:closure-checkpoint';
const ACTIVE =
  'sha256:closure-active';
const ORPHAN =
  'sha256:closure-orphan';

const CREATED =
  '2026-09-20T12:00:00.000Z';

interface DurableBacking {
  revisions:
    Map<string, Uint8Array>;
  journals:
    Map<string, HistoryJournalManifest>;
  writerDocuments:
    Map<string, WriterDocumentRecordV2>;
  writerAssets:
    Map<string, WriterAssetRecordV2>;
}

class RestartableRevisionStore
implements WorkingRevisionStore {
  readonly id =
    REVISION_STORE_ID;
  readonly kind = 'opfs' as const;
  readonly capabilities = Object.freeze({
    persistent: true,
    atomicCommit: true,
    randomAccess: true,
  });

  constructor(
    private readonly backing:
      DurableBacking,
  ) {}

  async commit(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    if (
      this.backing.revisions.has(
        input.revisionId,
      )
    ) {
      throw new Error(
        `Revision already exists: ${input.revisionId}`,
      );
    }
    const bytes =
      await materializeDocumentSource(
        input.source,
        {
          signal: input.signal,
        },
      );
    this.backing.revisions.set(
      input.revisionId,
      Uint8Array.from(bytes),
    );
    return {
      revisionId:
        input.revisionId,
      sourceId:
        `closure-source:${input.revisionId}`,
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
      this.backing.revisions.get(
        revisionId,
      );
    if (!bytes) {
      throw new Error(
        `Missing revision ${revisionId}`,
      );
    }
    return new MemorySource({
      id:
        `closure-source:${revisionId}`,
      bytes:
        Uint8Array.from(bytes),
    });
  }

  async has(
    revisionId: string,
  ): Promise<boolean> {
    return this.backing.revisions.has(
      revisionId,
    );
  }

  async listRevisionIds():
  Promise<string[]> {
    return [
      ...this.backing.revisions.keys(),
    ].sort();
  }

  async remove(
    revisionId: string,
  ): Promise<void> {
    this.backing.revisions.delete(
      revisionId,
    );
  }

  async clear(): Promise<void> {
    this.backing.revisions.clear();
  }
}

class RestartableJournalStore
implements HistoryJournalStore {
  readonly id =
    JOURNAL_STORE_ID;
  readonly capabilities = Object.freeze({
    persistent: true,
  });

  constructor(
    private readonly backing:
      DurableBacking,
  ) {}

  async save(
    manifest:
      HistoryJournalManifest,
  ): Promise<void> {
    this.backing.journals.set(
      manifest.journalId,
      clone(manifest),
    );
  }

  async load(
    journalId: string,
  ): Promise<HistoryJournalManifest | null> {
    const manifest =
      this.backing.journals.get(
        journalId,
      );
    return manifest
      ? clone(manifest)
      : null;
  }

  async listByOriginalRevision(
    originalRevisionId: string,
  ): Promise<HistoryJournalManifest[]> {
    return [
      ...this.backing.journals
        .values(),
    ]
      .filter(
        (manifest) =>
          manifest.originalRevisionId
            === originalRevisionId,
      )
      .map(clone)
      .sort(
        (left, right) =>
          left.journalId.localeCompare(
            right.journalId,
          ),
      );
  }

  async listAll():
  Promise<HistoryJournalManifest[]> {
    return [
      ...this.backing.journals
        .values(),
    ]
      .map(clone)
      .sort(
        (left, right) =>
          left.journalId.localeCompare(
            right.journalId,
          ),
      );
  }

  async remove(
    journalId: string,
  ): Promise<void> {
    this.backing.journals.delete(
      journalId,
    );
  }
}

function restartableWriterPersistence(
  backing: DurableBacking,
): WriterPersistenceAdapterV2 {
  return {
    async saveDocument(record) {
      backing.writerDocuments.set(
        record.documentFingerprint,
        clone(record),
      );
    },
    async loadDocument(
      documentFingerprint,
    ) {
      const record =
        backing.writerDocuments.get(
          documentFingerprint,
        );
      return record
        ? clone(record)
        : null;
    },
    async deleteDocument(
      documentFingerprint,
    ) {
      backing.writerDocuments.delete(
        documentFingerprint,
      );
    },
    async saveAsset(asset) {
      backing.writerAssets.set(
        asset.id,
        clone(asset),
      );
    },
    async loadAsset(id) {
      const asset =
        backing.writerAssets.get(id);
      return asset
        ? clone(asset)
        : null;
    },
    async listAssets(
      documentFingerprint,
    ) {
      return [
        ...backing.writerAssets
          .values(),
      ]
        .filter(
          (asset) =>
            asset.documentFingerprint
              === documentFingerprint,
        )
        .map(clone);
    },
    async deleteAsset(id) {
      backing.writerAssets.delete(id);
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T;
}

function checkpointState() {
  return {
    schemaVersion: 2 as const,
    pageCount: 2,
    pageGraph: {
      pages: [{
        pageId: 'page-a',
        documentKey: CHECKPOINT,
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0 as const,
      }, {
        pageId: 'page-b',
        documentKey: CHECKPOINT,
        originalPageNumber: 0,
        currentIndex: 1,
        width: 612,
        height: 792,
        rotation: 0 as const,
      }],
      pageLabelRanges: [{
        startPageId: 'page-a',
        style: 'decimal' as const,
        prefix: 'A-',
        startNumber: 1,
      }],
    },
    documentKey: CHECKPOINT,
    selectedPageIds: ['page-b'],
    selectedPages: [2],
    currentPageId: 'page-b',
    currentPage: 2,
    annotations: [{
      id: 'annotation-closure',
      type: 'highlight' as const,
      pageId: 'page-b',
      pageNumber: 2,
      rect: {
        x: 20,
        y: 30,
        width: 140,
        height: 18,
      },
      data: {
        text: 'closure annotation',
      },
      createdAt: 1,
      updatedAt: 1,
    }],
    writer: {
      documentMode:
        'pdfOverlay' as const,
      elements: [{
        id: 'writer-image',
        documentFingerprint:
          CHECKPOINT,
        pageId: 'page-a',
        pageIndex: 0,
        type: 'imageBox' as const,
        rect: {
          x: 40,
          y: 50,
          width: 100,
          height: 80,
        },
        imageAssetId:
          'asset-closure',
        style: {
          zIndex: 2,
        },
        createdAt: CREATED,
        updatedAt: CREATED,
        locked: false,
        hidden: false,
      }],
      selectedIds: [
        'writer-image',
      ],
      activeId: 'writer-image',
    },
    ocr: {
      documentFingerprint:
        CHECKPOINT,
      result: null,
      corrections: [{
        id: 'ocr-correction',
        documentFingerprint:
          CHECKPOINT,
        pageId: 'page-b',
        pageIndex: 1,
        targetId: 'word-valve',
        targetType: 'word' as const,
        originalText: 'Va1ve',
        correctedText: 'Valve',
        bbox: {
          x: 12,
          y: 15,
          width: 48,
          height: 14,
        },
        createdAt: CREATED,
        updatedAt: CREATED,
      }],
      regions: [{
        id: 'ocr-region',
        documentFingerprint:
          CHECKPOINT,
        pageId: 'page-b',
        pageIndex: 1,
        bbox: {
          x: 10,
          y: 10,
          width: 120,
          height: 60,
        },
        mode: 'text' as const,
        createdAt: CREATED,
        updatedAt: CREATED,
      }],
      selectedPageIndexes: [1],
      reviewFocus: null,
    },
  };
}

function command(
  id: string,
  documentKey: string,
  draft:
    Parameters<
      typeof materializePdfCommand
    >[0],
  source:
    Parameters<
      typeof materializePdfCommand
    >[1] = 'system',
) {
  return materializePdfCommand(
    draft,
    source,
    documentKey,
    {
      id,
      createdAt: CREATED,
    },
  );
}

function manifest():
HistoryJournalManifest {
  const entries =
    [{
      entryId:
        `${JOURNAL_ID}:entry:tx-binary`,
      transactionId: 'tx-binary',
      command: command(
        'command-binary',
        ORIGINAL,
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 180,
          },
        },
      ),
      disposition:
        'SELF_CONTAINED_REPLAY' as const,
      barriers: [],
      beforeRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: ORIGINAL,
      },
      afterRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      createdAt:
        '2026-09-20T12:00:01.000Z',
    }, {
      entryId:
        `${JOURNAL_ID}:entry:tx-annotation`,
      transactionId:
        'tx-annotation',
      command: command(
        'command-annotation',
        BINARY,
        {
          type:
            'ANNOTATION_CHANGE',
          payload: {
            action: 'add',
            annotationIds: [
              'annotation-closure',
            ],
          },
        },
        'annotation-store',
      ),
      disposition:
        'CHECKPOINT_REQUIRED' as const,
      barriers: [{
        code:
          'DESCRIPTIVE_STATE_COMMAND' as const,
      }],
      beforeRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      afterRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      createdAt:
        '2026-09-20T12:00:02.000Z',
    }, {
      entryId:
        `${JOURNAL_ID}:entry:tx-writer`,
      transactionId:
        'tx-writer',
      command: command(
        'command-writer',
        BINARY,
        {
          type: 'WRITER_CHANGE',
          payload: {
            action:
              'add image',
            elementIds: [
              'writer-image',
            ],
          },
        },
        'writer-store',
      ),
      disposition:
        'CHECKPOINT_REQUIRED' as const,
      barriers: [{
        code:
          'DESCRIPTIVE_STATE_COMMAND' as const,
      }],
      beforeRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      afterRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      createdAt:
        '2026-09-20T12:00:03.000Z',
    }, {
      entryId:
        `${JOURNAL_ID}:entry:tx-structural`,
      transactionId:
        'tx-structural',
      command: command(
        'command-structural',
        BINARY,
        {
          type: 'INSERT_PAGES',
          payload: {
            atIndex: 1,
            donorResourceId:
              'donor-closure',
          },
        },
        'toolbar',
      ),
      disposition:
        'CHECKPOINT_REQUIRED' as const,
      barriers: [{
        code:
          'DONOR_RESOURCE_REQUIRED' as const,
        resourceIds: [
          'donor-closure',
        ],
      }],
      beforeRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: BINARY,
      },
      afterRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: CHECKPOINT,
      },
      createdAt:
        '2026-09-20T12:00:04.000Z',
    }, {
      entryId:
        `${JOURNAL_ID}:entry:tx-replay`,
      transactionId: 'tx-replay',
      command: command(
        'command-replay',
        CHECKPOINT,
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [1],
            angle: 90,
          },
        },
        'toolbar',
      ),
      disposition:
        'SELF_CONTAINED_REPLAY' as const,
      barriers: [],
      beforeRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: CHECKPOINT,
      },
      afterRevision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: ACTIVE,
      },
      createdAt:
        '2026-09-20T12:00:05.000Z',
    }];

  return {
    schemaVersion: 1,
    journalId: JOURNAL_ID,
    revisionStoreId:
      REVISION_STORE_ID,
    originalRevisionId: ORIGINAL,
    activeRevisionId: ACTIVE,
    activeTransactionId:
      'tx-replay',
    fileName:
      'closure-fixture.pdf',
    createdAt: CREATED,
    updatedAt:
      '2026-09-20T12:00:05.000Z',
    checkpoints: [{
      checkpointId:
        `${JOURNAL_ID}:admission`,
      kind: 'ADMISSION',
      revision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: ORIGINAL,
      },
      createdAt: CREATED,
    }, {
      checkpointId:
        `${JOURNAL_ID}:barrier:tx-structural`,
      kind: 'BARRIER',
      revision: {
        storeId:
          REVISION_STORE_ID,
        revisionId: CHECKPOINT,
      },
      transactionId:
        'tx-structural',
      createdAt:
        '2026-09-20T12:00:04.000Z',
      statePayload:
        checkpointState(),
    }],
    entries,
  };
}

function createBacking():
DurableBacking {
  const revisions =
    new Map<string, Uint8Array>();
  for (
    const [revisionId, value] of [
      [ORIGINAL, 1],
      [BINARY, 2],
      [CHECKPOINT, 3],
      [ACTIVE, 4],
      [ORPHAN, 9],
    ] as const
  ) {
    revisions.set(
      revisionId,
      new Uint8Array([value]),
    );
  }

  const journals =
    new Map<
      string,
      HistoryJournalManifest
    >();
  journals.set(
    JOURNAL_ID,
    manifest(),
  );

  const writerAssets =
    new Map<
      string,
      WriterAssetRecordV2
    >();
  writerAssets.set(
    'asset-closure',
    {
      id: 'asset-closure',
      documentFingerprint:
        CHECKPOINT,
      kind: 'image',
      mimeType: 'image/png',
      dataUrl:
        'data:image/png;base64,AA==',
      width: 100,
      height: 80,
      createdAt: CREATED,
      updatedAt: CREATED,
    },
  );

  return {
    revisions,
    journals,
    writerDocuments:
      new Map(),
    writerAssets,
  };
}

function installFreshProcess(
  backing: DurableBacking,
) {
  const revisions =
    new RestartableRevisionStore(
      backing,
    );
  const journals =
    new RestartableJournalStore(
      backing,
    );
  registerWorkingRevisionStore(
    revisions,
  );
  registerHistoryJournalStore(
    journals,
  );

  return {
    revisions,
    journals,
    writerPersistence:
      restartableWriterPersistence(
        backing,
      ),
  };
}

function destroyProcessState(): void {
  useSessionStore
    .getState()
    .clearDocument();
  useAnnotationStore
    .getState()
    .setAnnotations([]);
  useWriterV2Store
    .getState()
    .clearWriterV2();
  useOcrStore
    .getState()
    .clearOcr();
  useHistoryStore
    .getState()
    .clear();

  clearRevisionPinsForTests();
  releaseActiveSessionRevisionGcBlocker();
  clearHistoryJournalStoreRegistryForTests();
  clearWorkingRevisionStoreRegistryForTests();
  resetDocumentOperationQueueForTests();
}

async function recoverFromBacking(
  backing: DurableBacking,
) {
  const fresh =
    installFreshProcess(
      backing,
    );
  const liveManifest =
    await fresh.journals.load(
      JOURNAL_ID,
    );
  expect(liveManifest)
    .not.toBeNull();
  if (!liveManifest) {
    throw new Error(
      'closure journal missing',
    );
  }

  const planned =
    planHistoryRecovery(
      liveManifest,
    );
  expect(planned.ok)
    .toBe(true);
  if (!planned.ok) {
    throw new Error(
      planned.diagnostics
        .map(
          (item) => item.message,
        )
        .join('; '),
    );
  }

  const resolved =
    await resolveHistoryRecoveryPlan(
      planned.plan,
    );

  const dispatch =
    async (
      input:
        CommandExecutionInput,
    ): Promise<CommandResult> => {
      expect(input.executionMode)
        .toBe('recovery-replay');
      expect(input.command.id)
        .toBe('command-replay');
      expect(
        input.recoveryRevision,
      ).toEqual({
        revisionId: ACTIVE,
        bytes:
          new Uint8Array([4]),
      });

      const session =
        useSessionStore.getState();
      const graph =
        session.pageGraph;
      if (!graph) {
        throw new Error(
          'replay requires PageGraph',
        );
      }

      useSessionStore.setState({
        documentKey: ACTIVE,
        activeRevisionId: ACTIVE,
        workingBytes:
          input.recoveryRevision
            ?.bytes
          ?? null,
        pageGraph: {
          ...graph,
          pages: graph.pages.map(
            (page) => ({
              ...page,
              documentKey: ACTIVE,
              rotation:
                page.pageId
                  === 'page-b'
                  ? 90
                  : page.rotation,
            }),
          ),
        },
      });

      return {
        success: true,
        commandId:
          input.command.id,
        commandType:
          input.command.type,
        source:
          input.command.source,
        mutated: true,
        message:
          'closure replay complete',
      };
    };

  const persistedAnnotations:
    unknown[] = [];
  const result =
    await executeHistoryRecovery({
      resolved,
      journalStoreId:
        JOURNAL_STORE_ID,
      dependencies: {
        dispatch,
        writerPersistence:
          fresh.writerPersistence,
        persistAnnotations:
          async (
            documentKey,
            annotations,
          ) => {
            persistedAnnotations.push({
              documentKey,
              annotations:
                clone(annotations),
            });
          },
      },
    });

  return {
    ...fresh,
    result,
    persistedAnnotations,
  };
}

function expectRecoveredState(): void {
  const session =
    useSessionStore.getState();
  expect(session).toMatchObject({
    documentKey: ACTIVE,
    revisionStoreId:
      REVISION_STORE_ID,
    originalRevisionId: ORIGINAL,
    activeRevisionId: ACTIVE,
    historyJournalStoreId:
      JOURNAL_STORE_ID,
    historyJournalId: JOURNAL_ID,
    historyJournalPersistent:
      true,
    fileName:
      'closure-fixture.pdf',
    pageCount: 2,
    selectedPageIds: [
      'page-b',
    ],
    selectedPages: [2],
  });
  expect(
    session.viewState,
  ).toMatchObject({
    currentPageId: 'page-b',
    currentPage: 2,
  });
  expect(
    session.pageGraph?.pages,
  ).toEqual([
    expect.objectContaining({
      pageId: 'page-a',
      documentKey: ACTIVE,
      currentIndex: 0,
      rotation: 0,
    }),
    expect.objectContaining({
      pageId: 'page-b',
      documentKey: ACTIVE,
      currentIndex: 1,
      rotation: 90,
    }),
  ]);

  expect(
    useAnnotationStore
      .getState()
      .annotations,
  ).toEqual([
    expect.objectContaining({
      id: 'annotation-closure',
      pageId: 'page-b',
      pageNumber: 2,
    }),
  ]);

  const writer =
    useWriterV2Store.getState();
  expect(
    writer.currentDocumentFingerprint,
  ).toBe(ACTIVE);
  expect(writer.elements).toEqual([
    expect.objectContaining({
      id: 'writer-image',
      documentFingerprint:
        ACTIVE,
      pageId: 'page-a',
      pageIndex: 0,
      imageAssetId:
        'asset-closure',
    }),
  ]);
  expect(writer.assetRecords).toEqual([
    expect.objectContaining({
      id: 'asset-closure',
      documentFingerprint:
        ACTIVE,
    }),
  ]);

  const ocr =
    useOcrStore.getState();
  expect(
    ocr.documentFingerprint,
  ).toBe(ACTIVE);
  expect(ocr.corrections).toEqual([
    expect.objectContaining({
      id: 'ocr-correction',
      documentFingerprint:
        ACTIVE,
      pageId: 'page-b',
      pageIndex: 1,
      correctedText: 'Valve',
    }),
  ]);
  expect(ocr.regions).toEqual([
    expect.objectContaining({
      id: 'ocr-region',
      documentFingerprint:
        ACTIVE,
      pageId: 'page-b',
      pageIndex: 1,
    }),
  ]);

  expect(
    useHistoryStore
      .getState()
      .undoStack,
  ).toEqual([]);
  expect(
    useHistoryStore
      .getState()
      .redoStack,
  ).toEqual([]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'navigator',
    {
      locks: {
        request(
          _name: string,
          _options: unknown,
          callback:
            (
              lock: unknown,
            ) =>
              unknown,
        ) {
          return Promise.resolve()
            .then(
              () =>
                callback({}),
            );
        },
      },
    },
  );
  destroyProcessState();
});

describe(
  'Phase 8E closure: durable recovery and revision GC',
  () => {
    it('recovers after process death, survives safe GC, and fails closed on a damaged recovery graph', async () => {
      const backing =
        createBacking();

      // First process restart: no previous store instance or live Zustand state survives.
      const first =
        await recoverFromBacking(
          backing,
        );
      expect(
        first.result,
      ).toEqual({
        journalId: JOURNAL_ID,
        checkpointId:
          `${JOURNAL_ID}:barrier:tx-structural`,
        activeTransactionId:
          'tx-replay',
        activeRevisionId: ACTIVE,
        replayedTransactionIds: [
          'tx-replay',
        ],
      });
      expectRecoveredState();
      expect(
        first.persistedAnnotations,
      ).toEqual([
        expect.objectContaining({
          documentKey: ACTIVE,
        }),
      ]);

      const gcPlan =
        await planLiveRevisionGarbageCollection({
          storeId:
            REVISION_STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      expect(gcPlan.safeToDelete)
        .toBe(true);
      expect(gcPlan.candidates)
        .toEqual([ORPHAN]);
      expect(
        gcPlan.reachable.map(
          (entry) =>
            entry.revisionId,
        ),
      ).toEqual([
        ACTIVE,
        BINARY,
        CHECKPOINT,
        ORIGINAL,
      ]);

      await expect(
        executeRevisionGarbageCollection(
          gcPlan,
        ),
      ).resolves.toEqual({
        status: 'completed',
        storeId:
          REVISION_STORE_ID,
        deleted: [ORPHAN],
        remaining: [],
      });
      expect(
        backing.revisions.has(
          ORPHAN,
        ),
      ).toBe(false);

      // Second restart uses new store/persistence objects over only retained durable backing.
      destroyProcessState();
      const second =
        await recoverFromBacking(
          backing,
        );
      expect(
        second.result
          .activeRevisionId,
      ).toBe(ACTIVE);
      expectRecoveredState();

      // Simulate backing corruption outside GC by losing the checkpoint revision.
      await second.revisions.remove(
        CHECKPOINT,
      );
      destroyProcessState();
      const damaged =
        installFreshProcess(
          backing,
        );
      const damagedManifest =
        await damaged.journals.load(
          JOURNAL_ID,
        );
      expect(damagedManifest)
        .not.toBeNull();
      if (!damagedManifest) {
        throw new Error(
          'damaged closure journal missing',
        );
      }

      const damagedPlan =
        planHistoryRecovery(
          damagedManifest,
        );
      expect(damagedPlan.ok)
        .toBe(true);
      if (!damagedPlan.ok) {
        throw new Error(
          'expected planner to defer immutable revision existence to resolver',
        );
      }

      const preRecovery = {
        session:
          useSessionStore.getState(),
        annotations:
          useAnnotationStore
            .getState()
            .annotations,
        writerElements:
          useWriterV2Store
            .getState()
            .elements,
        ocrCorrections:
          useOcrStore
            .getState()
            .corrections,
      };

      await expect(
        resolveHistoryRecoveryPlan(
          damagedPlan.plan,
        ),
      ).rejects.toMatchObject({
        name:
          'HistoryRecoveryResolutionError',
        code: 'REVISION_MISSING',
      });

      expect(
        useSessionStore.getState(),
      ).toEqual(
        preRecovery.session,
      );
      expect(
        useAnnotationStore
          .getState()
          .annotations,
      ).toEqual(
        preRecovery.annotations,
      );
      expect(
        useWriterV2Store
          .getState()
          .elements,
      ).toEqual(
        preRecovery.writerElements,
      );
      expect(
        useOcrStore
          .getState()
          .corrections,
      ).toEqual(
        preRecovery.ocrCorrections,
      );

      const damagedGcPlan =
        await planLiveRevisionGarbageCollection({
          storeId:
            REVISION_STORE_ID,
          journalStoreId:
            JOURNAL_STORE_ID,
        });
      expect(
        damagedGcPlan.safeToDelete,
      ).toBe(false);
      expect(
        damagedGcPlan.diagnostics,
      ).toContainEqual(
        expect.objectContaining({
          code:
            'MISSING_REFERENCED_REVISION',
          revisionId:
            CHECKPOINT,
        }),
      );

      const beforeUnsafeGc =
        await damaged.revisions
          .listRevisionIds();
      await expect(
        executeRevisionGarbageCollection(
          damagedGcPlan,
        ),
      ).rejects.toMatchObject({
        name:
          'RevisionGarbageCollectionError',
        code:
          'UNSAFE_REACHABILITY',
      });
      await expect(
        damaged.revisions
          .listRevisionIds(),
      ).resolves.toEqual(
        beforeUnsafeGc,
      );
    });
  },
);
