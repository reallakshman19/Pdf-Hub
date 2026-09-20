import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import {
  createMemoryWriterPersistence,
} from '@/core/writer-v2/persistence/indexedDbWriterStore';
import {
  resetDocumentOperationQueueForTests,
} from '@/core/commands/documentOperationQueue';
import {
  materializePdfCommand,
  type CommandExecutionInput,
  type CommandResult,
} from '@/core/commands/types';
import {
  useAnnotationStore,
} from '@/core/annotations/store';
import {
  useHistoryStore,
} from '@/core/document-history/store';
import {
  useOcrStore,
} from '@/core/ocr/ocrStore';
import {
  useSessionStore,
} from '@/core/session/store';
import {
  useWriterV2Store,
} from '@/core/writer-v2/writerV2Store';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
} from '../registry';
import type {
  HistoryRecoveryPlan,
} from '../recoveryPlanner';
import type {
  ResolvedHistoryRecoveryPlan,
} from '../recoveryResolver';
import {
  executeHistoryRecovery,
} from '../recoveryExecutor';
import type {
  HistoryJournalEntry,
  HistoryJournalManifest,
} from '../types';

const JOURNAL_STORE_ID = 'journal-store';
const REVISION_STORE_ID = 'revision-store';
const ORIGINAL_REVISION_ID = 'sha256:origin';
const CHECKPOINT_REVISION_ID =
  'sha256:checkpoint';
const ACTIVE_REVISION_ID =
  'sha256:active';
const JOURNAL_ID = 'history-recovery';

function checkpointState() {
  return {
    schemaVersion: 2 as const,
    pageCount: 1,
    pageGraph: {
      pages: [{
        pageId: 'page-1',
        documentKey:
          CHECKPOINT_REVISION_ID,
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0 as const,
      }],
    },
    documentKey:
      CHECKPOINT_REVISION_ID,
    selectedPageIds: ['page-1'],
    selectedPages: [1],
    currentPageId: 'page-1',
    currentPage: 1,
    annotations: [],
    writer: {
      documentMode:
        'pdfOverlay' as const,
      elements: [],
      selectedIds: [],
      activeId: null,
    },
    ocr: {
      documentFingerprint:
        CHECKPOINT_REVISION_ID,
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [0],
      reviewFocus: null,
    },
  };
}

function checkpointEntry():
HistoryJournalEntry {
  return {
    entryId:
      `${JOURNAL_ID}:entry:tx-checkpoint`,
    transactionId: 'tx-checkpoint',
    command: materializePdfCommand(
      {
        type: 'INSERT_PAGES',
        payload: {
          atIndex: 1,
          donorResourceId: 'donor-a',
        },
      },
      'toolbar',
      ORIGINAL_REVISION_ID,
      {
        id: 'checkpoint-command',
        createdAt:
          '2026-09-20T08:00:00.000Z',
      },
    ),
    disposition: 'CHECKPOINT_REQUIRED',
    barriers: [{
      code: 'DONOR_RESOURCE_REQUIRED',
      resourceIds: ['donor-a'],
    }],
    beforeRevision: {
      storeId: REVISION_STORE_ID,
      revisionId: ORIGINAL_REVISION_ID,
    },
    afterRevision: {
      storeId: REVISION_STORE_ID,
      revisionId:
        CHECKPOINT_REVISION_ID,
    },
    createdAt:
      '2026-09-20T08:00:01.000Z',
  };
}

function replayEntry(input: {
  transactionId?: string;
  beforeRevisionId?:
    string;
  afterRevisionId?:
    string;
} = {}): HistoryJournalEntry {
  const transactionId =
    input.transactionId ?? 'tx-replay';
  const beforeRevisionId =
    input.beforeRevisionId
    ?? CHECKPOINT_REVISION_ID;
  const afterRevisionId =
    input.afterRevisionId
    ?? ACTIVE_REVISION_ID;

  return {
    entryId:
      `${JOURNAL_ID}:entry:${transactionId}`,
    transactionId,
    command: materializePdfCommand(
      {
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      'toolbar',
      beforeRevisionId,
      {
        id:
          `command-${transactionId}`,
        createdAt:
          '2026-09-20T08:00:02.000Z',
      },
    ),
    disposition:
      'SELF_CONTAINED_REPLAY',
    barriers: [],
    beforeRevision: {
      storeId: REVISION_STORE_ID,
      revisionId: beforeRevisionId,
    },
    afterRevision: {
      storeId: REVISION_STORE_ID,
      revisionId: afterRevisionId,
    },
    createdAt:
      '2026-09-20T08:00:02.000Z',
  };
}

function plan(
  replayEntries:
    HistoryJournalEntry[] = [],
): HistoryRecoveryPlan {
  return {
    journalId: JOURNAL_ID,
    fileName: 'fixture.pdf',
    originalRevisionId:
      ORIGINAL_REVISION_ID,
    checkpointId:
      `${JOURNAL_ID}:barrier:tx-checkpoint`,
    checkpointTransactionId:
      'tx-checkpoint',
    activeTransactionId:
      replayEntries.at(-1)
        ?.transactionId
      ?? 'tx-checkpoint',
    revision: {
      storeId: REVISION_STORE_ID,
      revisionId:
        CHECKPOINT_REVISION_ID,
    },
    state: checkpointState(),
    replayEntries,
  };
}

function manifest(
  recoveryPlan:
    HistoryRecoveryPlan,
): HistoryJournalManifest {
  const entries = [
    checkpointEntry(),
    ...recoveryPlan.replayEntries,
  ];
  const terminal =
    entries.at(-1)!
      .afterRevision.revisionId;

  return {
    schemaVersion: 1,
    journalId: JOURNAL_ID,
    revisionStoreId:
      REVISION_STORE_ID,
    originalRevisionId:
      ORIGINAL_REVISION_ID,
    activeRevisionId: terminal,
    activeTransactionId:
      recoveryPlan.activeTransactionId,
    fileName: 'fixture.pdf',
    createdAt:
      '2026-09-20T08:00:00.000Z',
    updatedAt:
      '2026-09-20T08:00:03.000Z',
    checkpoints: [{
      checkpointId:
        `${JOURNAL_ID}:admission`,
      kind: 'ADMISSION',
      revision: {
        storeId: REVISION_STORE_ID,
        revisionId:
          ORIGINAL_REVISION_ID,
      },
      createdAt:
        '2026-09-20T08:00:00.000Z',
    }, {
      checkpointId:
        `${JOURNAL_ID}:barrier:tx-checkpoint`,
      kind: 'BARRIER',
      revision: {
        storeId: REVISION_STORE_ID,
        revisionId:
          CHECKPOINT_REVISION_ID,
      },
      transactionId:
        'tx-checkpoint',
      createdAt:
        '2026-09-20T08:00:01.000Z',
      statePayload:
        checkpointState(),
    }],
    entries,
  };
}

async function setup(
  recoveryPlan:
    HistoryRecoveryPlan,
): Promise<
  ResolvedHistoryRecoveryPlan
> {
  const journal =
    new MemoryHistoryJournalStore({
      id: JOURNAL_STORE_ID,
    });
  registerHistoryJournalStore(
    journal,
  );
  await journal.save(
    manifest(recoveryPlan),
  );

  return {
    plan: recoveryPlan,
    checkpointBytes:
      new Uint8Array([1, 2, 3]),
  };
}

describe('executeHistoryRecovery', () => {
  beforeEach(() => {
    resetDocumentOperationQueueForTests();
    clearHistoryJournalStoreRegistryForTests();
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
    vi.restoreAllMocks();
  });

  it('atomically installs a checkpoint and persists only the final annotation state', async () => {
    const recoveryPlan = plan();
    const resolved =
      await setup(recoveryPlan);
    const persistAnnotations =
      vi.fn(async () => undefined);

    const result =
      await executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          persistAnnotations,
        },
      });

    expect(result).toMatchObject({
      checkpointId:
        recoveryPlan.checkpointId,
      activeRevisionId:
        CHECKPOINT_REVISION_ID,
      replayedTransactionIds: [],
    });

    const session =
      useSessionStore.getState();
    expect(session).toMatchObject({
      documentKey:
        CHECKPOINT_REVISION_ID,
      revisionStoreId:
        REVISION_STORE_ID,
      originalRevisionId:
        ORIGINAL_REVISION_ID,
      activeRevisionId:
        CHECKPOINT_REVISION_ID,
      historyJournalStoreId:
        JOURNAL_STORE_ID,
      historyJournalId:
        JOURNAL_ID,
      fileName: 'fixture.pdf',
      pageCount: 1,
      selectedPageIds: ['page-1'],
      selectedPages: [1],
    });
    expect(
      session.workingBytes,
    ).toEqual(
      resolved.checkpointBytes,
    );
    expect(
      useWriterV2Store
        .getState()
        .currentDocumentFingerprint,
    ).toBe(
      CHECKPOINT_REVISION_ID,
    );
    expect(
      useOcrStore
        .getState()
        .documentFingerprint,
    ).toBe(
      CHECKPOINT_REVISION_ID,
    );
    expect(
      useHistoryStore
        .getState()
        .undoStack,
    ).toEqual([]);
    expect(
      persistAnnotations,
    ).toHaveBeenCalledTimes(1);
    expect(
      persistAnnotations,
    ).toHaveBeenCalledWith(
      CHECKPOINT_REVISION_ID,
      [],
    );
  });

  it('replays the validated suffix in recovery-replay mode and verifies the journal after-revision', async () => {
    const entry = replayEntry();
    const recoveryPlan =
      plan([entry]);
    const resolved =
      await setup(recoveryPlan);

    const dispatch =
      vi.fn(
        async (
          input: CommandExecutionInput,
        ): Promise<CommandResult> => {
          expect(
            input.executionMode,
          ).toBe('recovery-replay');
          expect(
            input.command.id,
          ).toBe(entry.command.id);

          useSessionStore.setState({
            documentKey:
              ACTIVE_REVISION_ID,
            activeRevisionId:
              ACTIVE_REVISION_ID,
            workingBytes:
              new Uint8Array([4, 5, 6]),
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
            message: 'replayed',
          };
        },
      );

    const result =
      await executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          dispatch,
          persistAnnotations:
            async () => undefined,
        },
      });

    expect(
      result.replayedTransactionIds,
    ).toEqual(['tx-replay']);
    expect(
      useSessionStore
        .getState()
        .activeRevisionId,
    ).toBe(ACTIVE_REVISION_ID);
    expect(
      useWriterV2Store
        .getState()
        .currentDocumentFingerprint,
    ).toBe(ACTIVE_REVISION_ID);
    expect(
      useWriterV2Store
        .getState()
        .documentMeta
        ?.documentFingerprint,
    ).toBe(ACTIVE_REVISION_ID);
    expect(dispatch)
      .toHaveBeenCalledTimes(1);
  });

  it('fails before mutation when the durable journal changes after planning', async () => {
    const recoveryPlan = plan();
    const resolved =
      await setup(recoveryPlan);
    const journal =
      (await import('../registry'))
        .resolveHistoryJournalStore(
          JOURNAL_STORE_ID,
        );
    expect(journal).not.toBeNull();
    if (!journal) return;

    const changed =
      await journal.load(JOURNAL_ID);
    expect(changed).not.toBeNull();
    if (!changed) return;
    changed.fileName = 'changed.pdf';
    await journal.save(changed);

    const preSession =
      useSessionStore.getState();

    await expect(
      executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          persistAnnotations:
            async () => undefined,
        },
      }),
    ).rejects.toMatchObject({
      name:
        'HistoryRecoveryExecutionError',
      code: 'JOURNAL_CHANGED',
    });

    expect(
      useSessionStore.getState(),
    ).toEqual(preSession);
  });

  it('restores all live stores when replay fails after checkpoint application', async () => {
    useSessionStore.setState({
      documentKey: 'pre-doc',
      fileName: 'pre.pdf',
      workingBytes:
        new Uint8Array([9, 9, 9]),
      pageCount: 1,
    });
    useAnnotationStore.setState({
      activeAnnotationId:
        'pre-annotation',
    });
    useWriterV2Store.setState({
      currentDocumentFingerprint:
        'pre-writer',
    });
    useOcrStore.setState({
      documentFingerprint:
        'pre-ocr',
    });
    useHistoryStore.setState({
      retainedBytes: 123,
      droppedTransactions: 7,
      overBudget: true,
    });

    const before = {
      session:
        useSessionStore.getState(),
      annotations:
        useAnnotationStore.getState(),
      writer:
        useWriterV2Store.getState(),
      ocr:
        useOcrStore.getState(),
      history:
        useHistoryStore.getState(),
    };

    const first = replayEntry({
      transactionId: 'tx-replay-1',
      afterRevisionId:
        'sha256:mid',
    });
    const second = replayEntry({
      transactionId: 'tx-replay-2',
      beforeRevisionId:
        'sha256:mid',
      afterRevisionId:
        ACTIVE_REVISION_ID,
    });
    const recoveryPlan =
      plan([first, second]);
    const resolved =
      await setup(recoveryPlan);

    let calls = 0;
    const dispatch = vi.fn(
      async (
        input: CommandExecutionInput,
      ): Promise<CommandResult> => {
        calls += 1;
        if (calls === 1) {
          useSessionStore.setState({
            documentKey:
              'sha256:mid',
            activeRevisionId:
              'sha256:mid',
            workingBytes:
              new Uint8Array([7]),
          });
          useAnnotationStore.setState({
            activeAnnotationId:
              'mutated-annotation',
          });
          useWriterV2Store.setState({
            currentDocumentFingerprint:
              'mutated-writer',
          });
          useOcrStore.setState({
            documentFingerprint:
              'mutated-ocr',
          });
          useHistoryStore.setState({
            retainedBytes: 0,
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
            message: 'first replay',
          };
        }

        throw new Error(
          'synthetic replay failure',
        );
      },
    );

    await expect(
      executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          dispatch,
          persistAnnotations:
            async () => undefined,
        },
      }),
    ).rejects.toMatchObject({
      name:
        'HistoryRecoveryExecutionError',
      code: 'REPLAY_FAILED',
      transactionId:
        'tx-replay-2',
    });

    expect(
      useSessionStore.getState(),
    ).toEqual(before.session);
    expect(
      useAnnotationStore.getState(),
    ).toEqual(before.annotations);
    expect(
      useWriterV2Store.getState(),
    ).toEqual(before.writer);
    expect(
      useOcrStore.getState(),
    ).toEqual(before.ocr);
    expect(
      useHistoryStore.getState(),
    ).toEqual(before.history);
  });

  it('restores pre-recovery state when final annotation persistence fails', async () => {
    useSessionStore.setState({
      documentKey: 'pre-doc',
      fileName: 'pre.pdf',
      workingBytes:
        new Uint8Array([9, 8, 7]),
      pageCount: 1,
    });
    useWriterV2Store.setState({
      currentDocumentFingerprint:
        'pre-writer',
    });
    useOcrStore.setState({
      documentFingerprint:
        'pre-ocr',
    });
    useHistoryStore.setState({
      retainedBytes: 55,
    });

    const before = {
      session:
        useSessionStore.getState(),
      annotations:
        useAnnotationStore.getState(),
      writer:
        useWriterV2Store.getState(),
      ocr:
        useOcrStore.getState(),
      history:
        useHistoryStore.getState(),
    };

    const resolved =
      await setup(plan());

    await expect(
      executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          persistAnnotations:
            async () => {
              throw new Error(
                'synthetic persistence failure',
              );
            },
        },
      }),
    ).rejects.toMatchObject({
      name:
        'HistoryRecoveryExecutionError',
      code:
        'FINAL_PERSISTENCE_FAILED',
    });

    expect(
      useSessionStore.getState(),
    ).toEqual(before.session);
    expect(
      useAnnotationStore.getState(),
    ).toEqual(before.annotations);
    expect(
      useWriterV2Store.getState(),
    ).toEqual(before.writer);
    expect(
      useOcrStore.getState(),
    ).toEqual(before.ocr);
    expect(
      useHistoryStore.getState(),
    ).toEqual(before.history);
  });

  it('rolls back when replay produces a revision different from the journal', async () => {
    useSessionStore.setState({
      documentKey: 'pre-doc',
      fileName: 'pre.pdf',
      workingBytes:
        new Uint8Array([9]),
      pageCount: 1,
    });
    const preSession =
      useSessionStore.getState();

    const entry = replayEntry();
    const resolved =
      await setup(plan([entry]));

    await expect(
      executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          dispatch: async (
            input,
          ) => {
            useSessionStore.setState({
              documentKey:
                'sha256:wrong',
              activeRevisionId:
                'sha256:wrong',
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
                'wrong revision',
            };
          },
          persistAnnotations:
            async () => undefined,
        },
      }),
    ).rejects.toMatchObject({
      name:
        'HistoryRecoveryExecutionError',
      code: 'REVISION_MISMATCH',
      transactionId: 'tx-replay',
    });

    expect(
      useSessionStore.getState(),
    ).toEqual(preSession);
  });

  it('hydrates referenced Writer assets before installing checkpoint state', async () => {
    const recoveryPlan = plan();
    recoveryPlan.state.writer.elements = [{
      id: 'image-1',
      documentFingerprint:
        'sha256:stale-writer-fingerprint',
      pageId: 'page-1',
      pageIndex: 0,
      type: 'imageBox',
      rect: {
        x: 10,
        y: 10,
        width: 20,
        height: 20,
      },
      imageAssetId: 'asset-1',
      style: {
        zIndex: 1,
      },
      createdAt:
        '2026-09-20T08:00:00.000Z',
      updatedAt:
        '2026-09-20T08:00:00.000Z',
      locked: false,
      hidden: false,
    }];

    const writerPersistence =
      createMemoryWriterPersistence();
    await writerPersistence.saveAsset({
      id: 'asset-1',
      documentFingerprint:
        'sha256:older-revision',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl:
        'data:image/png;base64,AA==',
      createdAt:
        '2026-09-20T08:00:00.000Z',
      updatedAt:
        '2026-09-20T08:00:00.000Z',
    });

    const resolved =
      await setup(recoveryPlan);

    await executeHistoryRecovery({
      resolved,
      journalStoreId:
        JOURNAL_STORE_ID,
      dependencies: {
        writerPersistence,
        persistAnnotations:
          async () => undefined,
      },
    });

    const writer =
      useWriterV2Store.getState();
    expect(
      writer.elements[0],
    ).toMatchObject({
      id: 'image-1',
      documentFingerprint:
        CHECKPOINT_REVISION_ID,
      imageAssetId: 'asset-1',
    });
    expect(
      writer.assetRecords,
    ).toEqual([
      expect.objectContaining({
        id: 'asset-1',
        documentFingerprint:
          CHECKPOINT_REVISION_ID,
      }),
    ]);
  });

  it('fails before mutating state when checkpoint Writer assets are unresolved', async () => {
    const recoveryPlan = plan();
    recoveryPlan.state.writer.elements = [{
      id: 'image-1',
      documentFingerprint:
        CHECKPOINT_REVISION_ID,
      pageId: 'page-1',
      pageIndex: 0,
      type: 'imageBox',
      rect: {
        x: 10,
        y: 10,
        width: 20,
        height: 20,
      },
      imageAssetId: 'asset-1',
      style: {
        zIndex: 1,
      },
      createdAt:
        '2026-09-20T08:00:00.000Z',
      updatedAt:
        '2026-09-20T08:00:00.000Z',
      locked: false,
      hidden: false,
    }];

    const resolved =
      await setup(recoveryPlan);
    const preSession =
      useSessionStore.getState();

    await expect(
      executeHistoryRecovery({
        resolved,
        journalStoreId:
          JOURNAL_STORE_ID,
        dependencies: {
          writerPersistence:
            createMemoryWriterPersistence(),
        },
      }),
    ).rejects.toMatchObject({
      name:
        'HistoryRecoveryExecutionError',
      code:
        'WRITER_ASSETS_UNAVAILABLE',
    });

    expect(
      useSessionStore.getState(),
    ).toEqual(preSession);
  });
});
