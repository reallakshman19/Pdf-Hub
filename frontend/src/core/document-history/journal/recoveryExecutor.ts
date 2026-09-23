import {
  saveAnnotations,
} from '@/core/annotations/persistence';
import {
  normalizeAnnotationPageAnchors,
} from '@/core/annotations/pageAnchor';
import {
  useAnnotationStore,
} from '@/core/annotations/store';
import {
  dispatchPdfCommand,
} from '@/core/commands/dispatch';
import {
  enqueueDocumentOperation,
} from '@/core/commands/documentOperationQueue';
import type {
  CommandExecutionInput,
  CommandResult,
} from '@/core/commands/types';
import {
  documentBus,
} from '@/core/events/bus';
import {
  materializeDocumentSource,
} from '@/core/document-source/materialize';
import {
  useHistoryStore,
} from '@/core/document-history/store';
import {
  cloneOcrPageAnchoredState,
  normalizeOcrPageAnchoredState,
  rekeyOcrPageAnchoredState,
} from '@/core/ocr/ocrPageAnchor';
import {
  recomputeOcrDerivedState,
  useOcrStore,
} from '@/core/ocr/ocrStore';
import {
  clonePageGraph,
} from '@/core/pages/pageGraph';
import {
  useSessionStore,
} from '@/core/session/store';
import {
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';

import {
  createPdfOverlayWriterDocumentMeta,
} from '@/core/writer-v2/writerDocumentMode';
import {
  normalizeWriterPageAnchors,
} from '@/core/writer-v2/writerPageAnchor';
import {
  useWriterV2Store,
} from '@/core/writer-v2/writerV2Store';
import type {
  WriterAssetRecordV2,
  WriterPersistenceAdapterV2,
} from '@/core/writer-v2/persistence/indexedDbWriterStore';
import {
  resolveWriterPersistenceAdapter,
} from '@/core/writer-v2/persistence/writerPersistenceRuntime';
import {
  resolveHistoryJournalStore,
} from './registry';
import {
  resolveHistoryJournalActiveTransactionId,
} from './types';
import type {
  ResolvedHistoryRecoveryPlan,
} from './recoveryResolver';

export type HistoryRecoveryExecutionErrorCode =
  | 'JOURNAL_STORE_UNAVAILABLE'
  | 'JOURNAL_CHANGED'
  | 'REVISION_STORE_UNAVAILABLE'
  | 'WRITER_ASSETS_UNAVAILABLE'
  | 'CHECKPOINT_APPLY_FAILED'
  | 'REPLAY_FAILED'
  | 'REVISION_MISMATCH'
  | 'FINAL_PERSISTENCE_FAILED';

export class HistoryRecoveryExecutionError extends Error {
  readonly code: HistoryRecoveryExecutionErrorCode;
  readonly transactionId?: string;

  constructor(
    code: HistoryRecoveryExecutionErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      transactionId?: string;
    },
  ) {
    super(message, {
      ...(options?.cause !== undefined
        ? { cause: options.cause }
        : {}),
    });
    this.name = 'HistoryRecoveryExecutionError';
    this.code = code;
    this.transactionId = options?.transactionId;
  }
}

export interface HistoryRecoveryExecutorDependencies {
  dispatch?: (
    input: CommandExecutionInput,
  ) => Promise<CommandResult>;
  persistAnnotations?: typeof saveAnnotations;
  writerPersistence?:
    WriterPersistenceAdapterV2;
}

export interface ExecuteHistoryRecoveryInput {
  resolved: ResolvedHistoryRecoveryPlan;
  journalStoreId: string;
  signal?: AbortSignal;
  dependencies?: HistoryRecoveryExecutorDependencies;
}

export interface HistoryRecoveryExecutionResult {
  journalId: string;
  checkpointId: string;
  activeTransactionId: string;
  activeRevisionId: string;
  replayedTransactionIds: string[];
}

/**
 * Applies one already-planned/resolved durable history recovery.
 *
 * All asynchronous journal/revision preflight completes before live stores are
 * touched. Checkpoint state is then installed, the validated self-contained
 * suffix is replayed through canonical dispatch in recovery-replay mode, every
 * resulting revision is checked against the journal, and only the final
 * annotation state is persisted. Any failure restores every live Zustand store
 * to its pre-recovery snapshot.
 */
export function executeHistoryRecovery(
  input: ExecuteHistoryRecoveryInput,
): Promise<HistoryRecoveryExecutionResult> {
  return enqueueDocumentOperation(
    () => executeHistoryRecoveryUnqueued(input),
  );
}

async function executeHistoryRecoveryUnqueued(
  input: ExecuteHistoryRecoveryInput,
): Promise<HistoryRecoveryExecutionResult> {
  const { plan } =
    input.resolved;
  const dispatch =
    input.dependencies?.dispatch
    ?? dispatchPdfCommand;
  const persistAnnotations =
    input.dependencies?.persistAnnotations
    ?? saveAnnotations;
  const writerPersistence =
    input.dependencies?.writerPersistence
    ?? resolveWriterPersistenceAdapter();

  const journalStore =
    resolveHistoryJournalStore(
      input.journalStoreId,
    );
  if (!journalStore) {
    throw new HistoryRecoveryExecutionError(
      'JOURNAL_STORE_UNAVAILABLE',
      `HistoryJournalStore ${input.journalStoreId} is not registered.`,
    );
  }

  const liveManifest =
    await journalStore.load(plan.journalId);
  if (!liveManifest) {
    throw new HistoryRecoveryExecutionError(
      'JOURNAL_CHANGED',
      `History journal ${plan.journalId} no longer exists.`,
    );
  }

  const liveActiveTransactionId =
    resolveHistoryJournalActiveTransactionId(
      liveManifest,
    );
  const expectedTerminalRevision =
    plan.replayEntries.at(-1)?.afterRevision
    ?? plan.revision;
  const liveCheckpoint =
    liveManifest.checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointId
        === plan.checkpointId,
    );
  const liveReplayEntries =
    plan.replayEntries.map(
      (plannedEntry) =>
        liveManifest.entries.find(
          (entry) =>
            entry.transactionId
            === plannedEntry.transactionId,
        ),
    );
  if (
    liveActiveTransactionId
      !== plan.activeTransactionId
    || liveManifest.activeRevisionId
      !== expectedTerminalRevision.revisionId
    || liveManifest.revisionStoreId
      !== plan.revision.storeId
    || liveManifest.originalRevisionId
      !== plan.originalRevisionId
    || liveManifest.fileName
      !== plan.fileName
    || !liveCheckpoint
    || liveCheckpoint.transactionId
      !== plan.checkpointTransactionId
    || liveCheckpoint.revision.storeId
      !== plan.revision.storeId
    || liveCheckpoint.revision.revisionId
      !== plan.revision.revisionId
    || JSON.stringify(
      liveCheckpoint.statePayload,
    ) !== JSON.stringify(plan.state)
    || liveReplayEntries.some(
      (entry) => !entry,
    )
    || JSON.stringify(
      liveReplayEntries,
    ) !== JSON.stringify(
      plan.replayEntries,
    )
  ) {
    throw new HistoryRecoveryExecutionError(
      'JOURNAL_CHANGED',
      'History journal changed after recovery planning; build a new recovery plan before restoring.',
    );
  }

  const revisionStore =
    resolveWorkingRevisionStore(
      plan.revision.storeId,
    );
  if (!revisionStore) {
    throw new HistoryRecoveryExecutionError(
      'REVISION_STORE_UNAVAILABLE',
      `WorkingRevisionStore ${plan.revision.storeId} is no longer registered.`,
    );
  }

  const requiredRevisionIds = [
    plan.originalRevisionId,
    plan.revision.revisionId,
    ...plan.replayEntries.map(
      (entry) =>
        entry.afterRevision.revisionId,
    ),
  ];
  try {
    for (
      const revisionId of
        new Set(requiredRevisionIds)
    ) {
      if (
        !await revisionStore.has(
          revisionId,
        )
      ) {
        throw new HistoryRecoveryExecutionError(
          'REVISION_STORE_UNAVAILABLE',
          `Recovery revision ${revisionId} is no longer available in store ${revisionStore.id}.`,
        );
      }
    }
  } catch (error) {
    if (
      error
      instanceof HistoryRecoveryExecutionError
    ) {
      throw error;
    }
    throw new HistoryRecoveryExecutionError(
      'REVISION_STORE_UNAVAILABLE',
      `Unable to revalidate WorkingRevisionStore ${revisionStore.id} before recovery.`,
      { cause: error },
    );
  }

  const requiredWriterAssetIds =
    collectWriterAssetReferences(
      plan.state.writer.elements,
    );
  let writerAssets:
    WriterAssetRecordV2[] = [];
  if (requiredWriterAssetIds.length > 0) {
    try {
      writerAssets =
        await loadRecoveryWriterAssets(
          requiredWriterAssetIds,
          writerPersistence,
          plan.state.documentKey,
        );
    } catch (error) {
      if (
        error
        instanceof HistoryRecoveryExecutionError
      ) {
        throw error;
      }
      throw new HistoryRecoveryExecutionError(
        'WRITER_ASSETS_UNAVAILABLE',
        'Failed to resolve Writer assets required by the recovery checkpoint.',
        { cause: error },
      );
    }
  }

  const snapshot =
    captureRecoverySnapshot();

  try {
    try {
      installRecoveryCheckpoint(
        input,
        journalStore.capabilities.persistent,
        writerAssets,
      );
    } catch (error) {
      throw new HistoryRecoveryExecutionError(
        'CHECKPOINT_APPLY_FAILED',
        'Failed to install recovery checkpoint application state.',
        { cause: error },
      );
    }

    const replayedTransactionIds: string[] = [];

    for (const entry of plan.replayEntries) {
      assertReplayBeforeRevision(
        entry.transactionId,
        entry.command.documentKey,
        entry.beforeRevision.storeId,
        entry.beforeRevision.revisionId,
        plan.revision.storeId,
      );

      const current =
        useSessionStore.getState();
      if (
        current.revisionStoreId
          !== entry.beforeRevision.storeId
        || current.activeRevisionId
          !== entry.beforeRevision.revisionId
        || current.documentKey
          !== entry.beforeRevision.revisionId
      ) {
        throw new HistoryRecoveryExecutionError(
          'REVISION_MISMATCH',
          `Recovery transaction ${entry.transactionId} expected current revision ${entry.beforeRevision.revisionId}, received ${current.activeRevisionId ?? '(none)'}.`,
          {
            transactionId:
              entry.transactionId,
          },
        );
      }

      let result: CommandResult;
      try {
        const replaySource =
          await revisionStore.open(
            entry.afterRevision.revisionId,
          );
        const replayBytes =
          await materializeDocumentSource(
            replaySource,
            { signal: input.signal },
          );

        result = await dispatch({
          command: entry.command,
          executionMode: 'recovery-replay',
          recoveryRevision: {
            revisionId:
              entry.afterRevision.revisionId,
            bytes: replayBytes,
          },
          signal: input.signal,
        });
      } catch (error) {
        throw new HistoryRecoveryExecutionError(
          'REPLAY_FAILED',
          `Recovery transaction ${entry.transactionId} threw during canonical replay.`,
          {
            cause: error,
            transactionId:
              entry.transactionId,
          },
        );
      }

      if (!result.success || !result.mutated) {
        throw new HistoryRecoveryExecutionError(
          'REPLAY_FAILED',
          `Recovery transaction ${entry.transactionId} did not produce the required mutation: ${result.error?.message ?? result.message}.`,
          {
            transactionId:
              entry.transactionId,
          },
        );
      }

      const after =
        useSessionStore.getState();
      if (
        after.revisionStoreId
          !== entry.afterRevision.storeId
        || after.activeRevisionId
          !== entry.afterRevision.revisionId
        || after.documentKey
          !== entry.afterRevision.revisionId
      ) {
        throw new HistoryRecoveryExecutionError(
          'REVISION_MISMATCH',
          `Recovery transaction ${entry.transactionId} produced revision ${after.activeRevisionId ?? '(none)'}, expected ${entry.afterRevision.revisionId}.`,
          {
            transactionId:
              entry.transactionId,
          },
        );
      }

      replayedTransactionIds.push(
        entry.transactionId,
      );
    }

    const finalSession =
      useSessionStore.getState();
    if (
      !finalSession.documentKey
      || !finalSession.activeRevisionId
      || finalSession.activeRevisionId
        !== expectedTerminalRevision.revisionId
      || finalSession.documentKey
        !== expectedTerminalRevision.revisionId
    ) {
      throw new HistoryRecoveryExecutionError(
        'REVISION_MISMATCH',
        `Recovery terminated at revision ${finalSession.activeRevisionId ?? '(none)'}, expected ${expectedTerminalRevision.revisionId}.`,
      );
    }

    rekeyRecoveredWriterState(
      finalSession.documentKey,
      finalSession.pageCount,
    );

    try {
      await persistAnnotations(
        finalSession.documentKey,
        normalizeAnnotationPageAnchors(
          useAnnotationStore
            .getState()
            .annotations,
          finalSession.pageGraph,
        ),
      );
    } catch (error) {
      throw new HistoryRecoveryExecutionError(
        'FINAL_PERSISTENCE_FAILED',
        'Recovered application state was not committed because final annotation persistence failed.',
        { cause: error },
      );
    }

    documentBus.emit({
      type: 'DOCUMENT_REPLACED',
    });

    return {
      journalId: plan.journalId,
      checkpointId: plan.checkpointId,
      activeTransactionId:
        plan.activeTransactionId,
      activeRevisionId:
        expectedTerminalRevision.revisionId,
      replayedTransactionIds,
    };
  } catch (error) {
    restoreRecoverySnapshot(snapshot);
    documentBus.emit({
      type: 'DOCUMENT_REPLACED',
    });
    throw error;
  }
}

function installRecoveryCheckpoint(
  input: ExecuteHistoryRecoveryInput,
  historyJournalPersistent: boolean,
  writerAssets:
    readonly WriterAssetRecordV2[],
): void {
  const { plan, checkpointBytes } =
    input.resolved;
  const state = plan.state;
  if (!state.pageGraph) {
    throw new Error(
      'Recovery checkpoint has no PageGraph.',
    );
  }

  const graph =
    clonePageGraph(state.pageGraph);
  const session =
    useSessionStore.getState();

  useSessionStore.setState({
    documentKey: state.documentKey,
    sourceId: null,
    revisionStoreId:
      plan.revision.storeId,
    originalRevisionId:
      plan.originalRevisionId,
    activeRevisionId:
      plan.revision.revisionId,
    historyJournalStoreId:
      input.journalStoreId,
    historyJournalId: plan.journalId,
    historyJournalPersistent,
    fileName: plan.fileName,
    originalBytes: null,
    workingBytes: checkpointBytes,
    pageCount: state.pageCount,
    pageGraph: graph,
    isDirty: true,
    isDocumentDirty: true,
    isReviewDirty:
      state.annotations.length > 0,
    isSessionDirty: true,
    saveHandle: null,
    selectedPageIds: [
      ...state.selectedPageIds,
    ],
    selectedPages: [
      ...state.selectedPages,
    ],
    viewState: {
      ...session.viewState,
      currentPageId:
        state.currentPageId,
      currentPage:
        state.currentPage,
    },
    saveState: {
      status: 'idle',
      message:
        'Recovered unsaved document changes',
    },
    annotationAutosaveState: {
      status: 'idle',
      pendingCount: 0,
    },
    lastExportAction: undefined,
    lastOperation: undefined,
  });

  useAnnotationStore
    .getState()
    .setAnnotations(
      normalizeAnnotationPageAnchors(
        state.annotations,
        graph,
      ),
    );

  const writerElements =
    normalizeWriterPageAnchors(
      state.writer.elements.map(
        (element) => ({
          ...element,
          documentFingerprint:
            state.documentKey,
        }),
      ),
      graph,
    );
  useWriterV2Store.setState({
    elements: writerElements,
    selectedIds: [
      ...state.writer.selectedIds,
    ],
    activeId: state.writer.activeId,
    undoStack: [],
    redoStack: [],
    dirty:
      writerElements.length > 0,
    editingId: null,
    currentDocumentFingerprint:
      state.documentKey,
    documentMeta:
      createPdfOverlayWriterDocumentMeta({
        documentFingerprint:
          state.documentKey,
        pageCount:
          state.pageCount,
      }),
    assetRecords:
      writerAssets.map((asset) => ({
        ...asset,
        documentFingerprint:
          state.documentKey,
      })),
    lastPersistedAt: null,
    tableSelection: null,
  });

  const currentOcr =
    useOcrStore.getState();
  const restoredOcr =
    rekeyOcrPageAnchoredState(
      normalizeOcrPageAnchoredState(
        cloneOcrPageAnchoredState(
          state.ocr,
        ),
        graph,
      ),
      state.documentKey,
    );
  const hasOcrState = Boolean(
    restoredOcr.documentFingerprint
    || restoredOcr.result
    || restoredOcr.corrections.length > 0
    || restoredOcr.regions.length > 0
    || restoredOcr.selectedPageIndexes.length > 0
    || restoredOcr.reviewFocus,
  );
  useOcrStore.setState(
    recomputeOcrDerivedState({
      ...currentOcr,
      ...restoredOcr,
      resumeToken: null,
      activeJobId: null,
      jobs: [],
      dirty: hasOcrState,
      lastUpdatedAt:
        hasOcrState
          ? new Date().toISOString()
          : currentOcr.lastUpdatedAt,
    }),
  );

  useHistoryStore
    .getState()
    .clear();
}

function rekeyRecoveredWriterState(
  documentFingerprint: string,
  pageCount: number,
): void {
  const writer =
    useWriterV2Store.getState();
  const now = new Date().toISOString();

  useWriterV2Store.setState({
    elements: writer.elements.map(
      (element) => ({
        ...element,
        documentFingerprint,
      }),
    ),
    currentDocumentFingerprint:
      documentFingerprint,
    documentMeta:
      writer.documentMeta
        ? {
            ...writer.documentMeta,
            documentFingerprint,
            pageCount,
            updatedAt: now,
          }
        : createPdfOverlayWriterDocumentMeta({
            documentFingerprint,
            pageCount,
            now,
          }),
    assetRecords:
      writer.assetRecords.map(
        (asset) => ({
          ...asset,
          documentFingerprint,
        }),
      ),
  });
}

function assertReplayBeforeRevision(
  transactionId: string,
  commandDocumentKey: string,
  beforeStoreId: string,
  beforeRevisionId: string,
  recoveryStoreId: string,
): void {
  if (beforeStoreId !== recoveryStoreId) {
    throw new HistoryRecoveryExecutionError(
      'REVISION_MISMATCH',
      `Recovery transaction ${transactionId} uses revision store ${beforeStoreId}, expected ${recoveryStoreId}.`,
      { transactionId },
    );
  }
  if (
    commandDocumentKey
      !== beforeRevisionId
  ) {
    throw new HistoryRecoveryExecutionError(
      'REVISION_MISMATCH',
      `Recovery transaction ${transactionId} command documentKey ${commandDocumentKey} does not match before-revision ${beforeRevisionId}.`,
      { transactionId },
    );
  }
}

async function loadRecoveryWriterAssets(
  assetIds: readonly string[],
  persistence:
    WriterPersistenceAdapterV2,
  documentFingerprint: string,
): Promise<WriterAssetRecordV2[]> {
  const assets: WriterAssetRecordV2[] = [];

  for (const assetId of assetIds) {
    const asset =
      await persistence.loadAsset(assetId);
    if (!asset) {
      throw new HistoryRecoveryExecutionError(
        'WRITER_ASSETS_UNAVAILABLE',
        `Recovery checkpoint references missing Writer asset ${assetId}.`,
      );
    }
    assets.push({
      ...asset,
      documentFingerprint,
    });
  }

  return assets;
}

function collectWriterAssetReferences(
  elements: readonly {
    imageAssetId?: string;
    assetIds?: string[];
  }[],
): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.imageAssetId) {
      ids.add(element.imageAssetId);
    }
    for (
      const assetId of
        element.assetIds ?? []
    ) {
      if (assetId) ids.add(assetId);
    }
  }
  return [...ids].sort();
}

function captureRecoverySnapshot() {
  return {
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
}

function restoreRecoverySnapshot(
  snapshot:
    ReturnType<
      typeof captureRecoverySnapshot
    >,
): void {
  useSessionStore.setState(
    snapshot.session,
  );
  useAnnotationStore.setState(
    snapshot.annotations,
  );
  useWriterV2Store.setState(
    snapshot.writer,
  );
  useOcrStore.setState(
    snapshot.ocr,
  );
  useHistoryStore.setState(
    snapshot.history,
  );
}
