import { v4 as uuidv4 } from 'uuid';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { BorrowedBytesSource } from '@/adapters/document-source/BorrowedBytesSource';
import { saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import { normalizeAnnotationPageAnchors } from '@/core/annotations/pageAnchor';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useHistoryStore } from '@/core/document-history/store';
import {
  attachHistoryJournalBarrierState,
  prepareHistoryJournalMutation,
} from '@/core/document-history/journal/appendMutation';
import type {
  HistoryRevisionLocator,
  HistoryState,
} from '@/core/document-history/types';
import { clonePageGraph, rekeyPageGraph } from '@/core/pages/pageGraph';
import type { PageGraph, PageNode } from '@/core/pages/types';
import { useSessionStore } from '@/core/session/store';
import { ensureStoredRevision } from '@/core/revision-store/ensureRevision';
import {
  acquireRevisionStoreExclusiveLease,
} from '@/core/revision-store/exclusion';
import { resolveWorkingRevisionStore } from '@/core/revision-store/registry';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { normalizeWriterPageAnchors } from '@/core/writer-v2/writerPageAnchor';
import {
  cloneOcrPageAnchoredState,
  normalizeOcrPageAnchoredState,
  reanchorOcrPageStateAfterPageGraphChange,
  rekeyOcrPageAnchoredState,
  type OcrPageAnchoredState,
} from '@/core/ocr/ocrPageAnchor';
import { recomputeOcrDerivedState, useOcrStore } from '@/core/ocr/ocrStore';
import type {
  CommandExecutionMode,
  PdfCommand,
} from '../types';

export type DocumentMutationStage = 'prepare' | 'persistence' | 'commit';

export class DocumentMutationTransactionError extends Error {
  readonly stage: DocumentMutationStage;
  readonly cause?: unknown;

  constructor(stage: DocumentMutationStage, message: string, cause?: unknown) {
    super(message);
    this.name = 'DocumentMutationTransactionError';
    this.stage = stage;
    this.cause = cause;
  }
}

export interface OcrPageMutationPolicy {
  invalidatePageIds?: readonly string[];
  rebindByPageIndex?: boolean;
  clearIfPageCountChanged?: boolean;
}

export interface DocumentMutationRevisionMetadata {
  beforePageCount: number;
  afterPageCount: number;
}

export interface CommitDocumentMutationInput {
  command: PdfCommand;
  label: string;
  beforeBytes: Uint8Array;
  afterBytes: Uint8Array;
  nextAnnotations?: PdfAnnotation[];
  nextWriterElements?: WriterElementV2[];
  nextSelectedPages?: number[];
  nextCurrentPage?: number;
  nextPageGraph?: PageGraph<PageNode> | null;
  nextOcrState?: OcrPageAnchoredState | null;
  ocrPagePolicy?: OcrPageMutationPolicy;
  revisionMetadata?: DocumentMutationRevisionMetadata;
  executionMode?: CommandExecutionMode;
  recoveryRevision?: {
    revisionId: string;
    bytes: Uint8Array;
  };
  signal?: AbortSignal;
}

export interface CommittedDocumentMutation {
  nextBytes: Uint8Array;
  nextPageCount: number;
  nextDocumentKey: string;
  activeRevisionId: string | null;
}

function validatedRevisionPageCounts(
  metadata: DocumentMutationRevisionMetadata,
  sessionPageCount: number,
  sessionHasDocument: boolean,
  sessionPageGraph: PageGraph<PageNode> | null,
): readonly [number, number] {
  const { beforePageCount, afterPageCount } = metadata;

  for (const [name, value] of [
    ['beforePageCount', beforePageCount],
    ['afterPageCount', afterPageCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `Revision metadata ${name} must be a positive integer; received ${value}.`,
      );
    }
  }

  if (
    sessionHasDocument
    && sessionPageCount !== beforePageCount
  ) {
    throw new Error(
      `Revision metadata beforePageCount ${beforePageCount} does not match active session page count ${sessionPageCount}.`,
    );
  }

  if (
    sessionPageGraph
    && sessionPageGraph.pages.length !== beforePageCount
  ) {
    throw new Error(
      `Revision metadata beforePageCount ${beforePageCount} does not match active PageGraph count ${sessionPageGraph.pages.length}.`,
    );
  }

  return [beforePageCount, afterPageCount] as const;
}

function toTransactionError(
  stage: DocumentMutationStage,
  message: string,
  error: unknown,
): DocumentMutationTransactionError {
  if (error instanceof DocumentMutationTransactionError) return error;
  const reason = error instanceof Error ? error.message : String(error);
  return new DocumentMutationTransactionError(stage, `${message}: ${reason}`, error);
}

async function publishMutationRevision(
  session: ReturnType<typeof useSessionStore.getState>,
  documentKey: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!session.revisionStoreId) {
    return null;
  }

  const store = resolveWorkingRevisionStore(
    session.revisionStoreId,
  );
  if (!store) {
    throw new Error(
      `WorkingRevisionStore ${session.revisionStoreId} is not registered.`,
    );
  }

  const revision = await ensureStoredRevision({
    store,
    revisionId: documentKey,
    source: new BorrowedBytesSource({
      id: `mutation:${documentKey}`,
      bytes,
    }),
    signal,
  });
  return revision.revisionId;
}

function revisionHistoryBacking(
  storeId: string | null | undefined,
  revisionId: string | null | undefined,
): Pick<HistoryState, 'revision' | 'activeRevisionId'> | null {
  if (!storeId || !revisionId) return null;

  const revision: HistoryRevisionLocator = {
    storeId,
    revisionId,
  };
  return {
    revision,
    activeRevisionId: revisionId,
  };
}

function writerHistorySnapshot() {
  const writer = useWriterV2Store.getState();
  return {
    ...(writer.documentMeta?.mode ? { documentMode: writer.documentMeta.mode } : {}),
    elements: writer.elements.map((element) => ({
      ...element,
      rect: { ...element.rect },
      style: { ...element.style },
    })),
    selectedIds: [...writer.selectedIds],
    activeId: writer.activeId,
  };
}

function restoreWriterSnapshot(snapshot: ReturnType<typeof useWriterV2Store.getState>): void {
  useWriterV2Store.setState(snapshot);
}

function currentOcrPageState(): OcrPageAnchoredState {
  const ocr = useOcrStore.getState();
  return {
    documentFingerprint: ocr.documentFingerprint,
    result: ocr.result,
    corrections: ocr.corrections,
    regions: ocr.regions,
    selectedPageIndexes: ocr.selectedPageIndexes,
    reviewFocus: ocr.reviewFocus,
  };
}

function commitOcrPageState(state: OcrPageAnchoredState): void {
  const current = useOcrStore.getState();
  const hasOcrState = Boolean(
    state.documentFingerprint
    || state.result
    || state.corrections.length > 0
    || state.regions.length > 0
    || state.selectedPageIndexes.length > 0
    || state.reviewFocus,
  );

  useOcrStore.setState(
    recomputeOcrDerivedState({
      ...current,
      ...cloneOcrPageAnchoredState(state),
      resumeToken: null,
      activeJobId: null,
      jobs: [],
      dirty: hasOcrState,
      lastUpdatedAt: hasOcrState
        ? new Date().toISOString()
        : current.lastUpdatedAt,
    }),
  );
}

/**
 * Persists dependent annotation state before any in-memory commit. Session,
 * annotation, Writer, OCR and history stores are then mutated as one synchronous transaction;
 * if any commit step throws, all stores are restored to their snapshots.
 */
export async function commitDocumentMutation(
  input: CommitDocumentMutationInput,
): Promise<CommittedDocumentMutation> {
  let beforePageCount: number;
  let afterPageCount: number;
  let nextDocumentKey: string;

  const sessionSnapshot = useSessionStore.getState();
  const isRecoveryReplay =
    input.executionMode === 'recovery-replay';
  const recoveryRevision =
    input.recoveryRevision;

  try {
    if (isRecoveryReplay && !recoveryRevision) {
      throw new Error(
        'Recovery replay requires authoritative immutable revision bytes.',
      );
    }
    if (!isRecoveryReplay && recoveryRevision) {
      throw new Error(
        'Authoritative recovery revision bytes are valid only in recovery-replay mode.',
      );
    }

    const effectiveAfterBytes =
      recoveryRevision?.bytes
      ?? input.afterBytes;
    const pageCountsPromise = input.revisionMetadata
      ? Promise.resolve(
          validatedRevisionPageCounts(
            input.revisionMetadata,
            sessionSnapshot.pageCount,
            sessionSnapshot.workingBytes !== null,
            sessionSnapshot.pageGraph,
          ),
        )
      : Promise.all([
          PdfEditAdapter.countPages(input.beforeBytes),
          PdfEditAdapter.countPages(effectiveAfterBytes),
        ]);

    const [pageCounts, documentKey] = await Promise.all([
      pageCountsPromise,
      FileAdapter.hashBytes(effectiveAfterBytes),
    ]);

    [beforePageCount, afterPageCount] = pageCounts;
    if (
      recoveryRevision
      && documentKey !== recoveryRevision.revisionId
    ) {
      throw new Error(
        `Recovery revision bytes hash to ${documentKey}, expected ${recoveryRevision.revisionId}.`,
      );
    }
    nextDocumentKey = documentKey;
  } catch (error) {
    throw toTransactionError(
      'prepare',
      'Unable to prepare document mutation',
      error,
    );
  }
  const effectiveAfterBytes =
    recoveryRevision?.bytes
    ?? input.afterBytes;
  const pageGraphForCommit =
    input.nextPageGraph === undefined
      ? sessionSnapshot.pageGraph
      : input.nextPageGraph;

  if (
    pageGraphForCommit
    && pageGraphForCommit.pages.length !== afterPageCount
  ) {
    throw new DocumentMutationTransactionError(
      'prepare',
      `PageGraph count ${pageGraphForCommit.pages.length} does not match mutated PDF page count ${afterPageCount}`,
    );
  }

  const annotationState = useAnnotationStore.getState();
  const annotationsToPersist = normalizeAnnotationPageAnchors(
    input.nextAnnotations ?? annotationState.annotations,
    pageGraphForCommit,
  );
  const writerElementsToCommit =
    input.nextWriterElements === undefined
      ? undefined
      : normalizeWriterPageAnchors(
          input.nextWriterElements,
          pageGraphForCommit,
        );
  const ocrBefore = normalizeOcrPageAnchoredState(
    currentOcrPageState(),
    sessionSnapshot.pageGraph,
  );
  const shouldClearOpaqueOcr = Boolean(
    input.ocrPagePolicy?.clearIfPageCountChanged
    && beforePageCount !== afterPageCount,
  );
  const emptyOcrState: OcrPageAnchoredState = {
    documentFingerprint: ocrBefore.documentFingerprint,
    result: null,
    corrections: [],
    regions: [],
    selectedPageIndexes: [],
    reviewFocus: null,
  };
  const ocrForTargetGraph =
    input.nextOcrState === null || shouldClearOpaqueOcr
      ? emptyOcrState
      : input.nextOcrState
        ? normalizeOcrPageAnchoredState(input.nextOcrState, pageGraphForCommit)
        : input.ocrPagePolicy?.rebindByPageIndex
          ? normalizeOcrPageAnchoredState(ocrBefore, pageGraphForCommit)
          : sessionSnapshot.pageGraph && pageGraphForCommit
            ? reanchorOcrPageStateAfterPageGraphChange(
                ocrBefore,
                sessionSnapshot.pageGraph,
                pageGraphForCommit,
                {
                  dropPageIds: input.ocrPagePolicy?.invalidatePageIds,
                },
              )
            : normalizeOcrPageAnchoredState(ocrBefore, pageGraphForCommit);
  const ocrForCommit = rekeyOcrPageAnchoredState(
    ocrForTargetGraph,
    nextDocumentKey,
  );

  const revisionLease =
    sessionSnapshot.revisionStoreId
      ? await acquireRevisionStoreExclusiveLease({
          storeId:
            sessionSnapshot.revisionStoreId,
        })
      : null;

  try {
    let publishedRevisionId: string | null;
    try {
      publishedRevisionId = await publishMutationRevision(
      sessionSnapshot,
      nextDocumentKey,
      effectiveAfterBytes,
      input.signal,
    );
    } catch (error) {
      throw toTransactionError(
        'persistence',
        'Document mutation was not committed because working revision publication failed',
        error,
      );
    }

  if (input.executionMode !== 'recovery-replay') {
    try {
      await saveAnnotations(
        nextDocumentKey,
        annotationsToPersist,
      );
    } catch (error) {
      throw toTransactionError(
        'persistence',
        'Document mutation was not committed because annotation persistence failed',
        error,
      );
    }
  }

  const annotationSnapshot = {
    annotations: [...annotationState.annotations],
    activeAnnotationId: annotationState.activeAnnotationId,
    selectedAnnotationIds: [...annotationState.selectedAnnotationIds],
    clipboard: [...annotationState.clipboard],
  };
  const writerSnapshot = useWriterV2Store.getState();
  const ocrStoreSnapshot = useOcrStore.getState();
  const writerBefore = writerHistorySnapshot();
  const historyState = useHistoryStore.getState();
  const historySnapshot = {
    undoStack: [...historyState.undoStack],
    redoStack: [...historyState.redoStack],
    retainedBytes: historyState.retainedBytes,
    droppedTransactions: historyState.droppedTransactions,
    lastTrimReason: historyState.lastTrimReason,
    overBudget: historyState.overBudget,
  };

  const transactionId = uuidv4();
  const transactionTimestamp = Date.now();
  const recordHistory =
    input.executionMode !== 'recovery-replay';

  let preparedJournal:
    Awaited<ReturnType<typeof prepareHistoryJournalMutation>>;
  try {
    preparedJournal = recordHistory
      ? await prepareHistoryJournalMutation({
      journalStoreId:
        sessionSnapshot.historyJournalStoreId,
      journalId: sessionSnapshot.historyJournalId,
      revisionStoreId:
        sessionSnapshot.revisionStoreId,
      beforeRevisionId:
        sessionSnapshot.activeRevisionId,
      afterRevisionId: publishedRevisionId,
      transactionId,
      command: input.command,
          createdAt: new Date(
            transactionTimestamp,
          ).toISOString(),
        })
      : null;
  } catch (error) {
    throw toTransactionError(
      'persistence',
      'Document mutation was not committed because history journal preparation failed',
      error,
    );
  }

  const previousAfter = historyState.undoStack.at(-1)?.after;
  const beforeRevisionBacking = revisionHistoryBacking(
    sessionSnapshot.revisionStoreId,
    sessionSnapshot.activeRevisionId,
  );
  const canSharePreviousSnapshot = Boolean(
    !beforeRevisionBacking
    && previousAfter?.bytes
    && sessionSnapshot.documentKey
    && previousAfter.documentKey === sessionSnapshot.documentKey
    && previousAfter.pageCount === beforePageCount,
  );
  const beforeHistoryBacking: Pick<
    HistoryState,
    'bytes' | 'revision' | 'activeRevisionId'
  > = beforeRevisionBacking ?? {
    bytes:
      canSharePreviousSnapshot && previousAfter?.bytes
        ? previousAfter.bytes
        : new Uint8Array(input.beforeBytes),
    activeRevisionId: sessionSnapshot.activeRevisionId,
  };

  try {
    useSessionStore.getState().replaceWorkingCopy(
      effectiveAfterBytes,
      afterPageCount,
      publishedRevisionId,
    );
    useSessionStore.getState().setDocumentKey(nextDocumentKey);
    useSessionStore.getState().setPageGraph(
      pageGraphForCommit
        ? rekeyPageGraph(pageGraphForCommit, nextDocumentKey)
        : null,
    );

    if (input.nextAnnotations) {
      useAnnotationStore.getState().setAnnotations(annotationsToPersist);
    }

    if (writerElementsToCommit) {
      const currentWriter = useWriterV2Store.getState();
      const allowedIds = new Set(
        writerElementsToCommit.map((element) => element.id),
      );
      const selectedIds = currentWriter.selectedIds.filter((id) =>
        allowedIds.has(id)
      );
      useWriterV2Store.setState({
        elements: writerElementsToCommit,
        selectedIds,
        activeId:
          currentWriter.activeId && allowedIds.has(currentWriter.activeId)
            ? currentWriter.activeId
            : selectedIds.at(-1) ?? null,
        undoStack: [],
        redoStack: [],
        dirty: true,
        editingId: null,
      });
    }

    commitOcrPageState(ocrForCommit);

    if (input.nextSelectedPages) {
      useSessionStore.getState().setSelectedPages(input.nextSelectedPages);
    }

    if (typeof input.nextCurrentPage === 'number') {
      useSessionStore.getState().setPage(input.nextCurrentPage);
    }

    const sessionAfter = useSessionStore.getState();
    const afterRevisionBacking = revisionHistoryBacking(
      sessionAfter.revisionStoreId,
      sessionAfter.activeRevisionId,
    );
    const afterHistoryBacking: Pick<
      HistoryState,
      'bytes' | 'revision' | 'activeRevisionId'
    > = afterRevisionBacking ?? {
      bytes: new Uint8Array(effectiveAfterBytes),
      activeRevisionId: sessionAfter.activeRevisionId,
    };
    const annotationAfter = useAnnotationStore.getState();
    const writerAfter = writerHistorySnapshot();
    const ocrAfter = currentOcrPageState();

    if (recordHistory) {
      useHistoryStore.getState().push({
        id: transactionId,
        command: input.command,
        label: input.label,
        timestamp: transactionTimestamp,
        ...(input.command.groupId ? { groupId: input.command.groupId } : {}),
        before: {
          ...beforeHistoryBacking,
          pageCount: beforePageCount,
          pageGraph: sessionSnapshot.pageGraph
            ? clonePageGraph(sessionSnapshot.pageGraph)
            : null,
          documentKey: sessionSnapshot.documentKey,
          selectedPageIds: [...sessionSnapshot.selectedPageIds],
          selectedPages: [...sessionSnapshot.selectedPages],
          currentPageId: sessionSnapshot.viewState.currentPageId,
          currentPage: sessionSnapshot.viewState.currentPage,
          annotations: [...annotationSnapshot.annotations],
          writer: writerBefore,
          ocr: cloneOcrPageAnchoredState(ocrBefore),
        },
        after: {
          ...afterHistoryBacking,
          pageCount: afterPageCount,
          pageGraph: sessionAfter.pageGraph
            ? clonePageGraph(sessionAfter.pageGraph)
            : null,
          documentKey: nextDocumentKey,
          selectedPageIds: [...sessionAfter.selectedPageIds],
          selectedPages: [...sessionAfter.selectedPages],
          currentPageId: sessionAfter.viewState.currentPageId,
          currentPage: sessionAfter.viewState.currentPage,
          annotations: [...annotationAfter.annotations],
          writer: writerAfter,
          ocr: cloneOcrPageAnchoredState(ocrAfter),
        },
      });
    }

    if (preparedJournal) {
      const committedTransaction =
        useHistoryStore.getState().peekUndo();
      if (
        !committedTransaction
        || committedTransaction.id !== transactionId
      ) {
        throw new Error(
          `Committed history transaction ${transactionId} is not the active undo head.`,
        );
      }

      attachHistoryJournalBarrierState({
        manifest: preparedJournal.manifest,
        transactionId,
        after: committedTransaction.after,
      });

      try {
        await preparedJournal.store.save(
          preparedJournal.manifest,
        );
      } catch (error) {
        throw toTransactionError(
          'persistence',
          'Document mutation was rolled back because history journal persistence failed',
          error,
        );
      }
    }
  } catch (error) {
    useSessionStore.setState(sessionSnapshot);
    useAnnotationStore.setState(annotationSnapshot);
    restoreWriterSnapshot(writerSnapshot);
    useOcrStore.setState(ocrStoreSnapshot);
    useHistoryStore.setState(historySnapshot);
    throw toTransactionError('commit', 'Document mutation commit failed and was rolled back', error);
  }

  return {
    nextBytes: effectiveAfterBytes,
    nextPageCount: afterPageCount,
    nextDocumentKey,
    activeRevisionId: publishedRevisionId,
  };
  } finally {
    revisionLease?.release();
  }
}

export function isDocumentMutationTransactionError(
  error: unknown,
): error is DocumentMutationTransactionError {
  return error instanceof DocumentMutationTransactionError;
}