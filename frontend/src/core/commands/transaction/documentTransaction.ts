import { v4 as uuidv4 } from 'uuid';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import { normalizeAnnotationPageAnchors } from '@/core/annotations/pageAnchor';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useHistoryStore } from '@/core/document-history/store';
import { clonePageGraph, rekeyPageGraph } from '@/core/pages/pageGraph';
import type { PageGraph, PageNode } from '@/core/pages/types';
import { useSessionStore } from '@/core/session/store';
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
import type { PdfCommand } from '../types';

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
}

export interface CommittedDocumentMutation {
  nextBytes: Uint8Array;
  nextPageCount: number;
  nextDocumentKey: string;
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
  useOcrStore.setState(
    recomputeOcrDerivedState({
      ...current,
      ...cloneOcrPageAnchoredState(state),
      activeJobId: null,
      jobs: [],
      dirty: true,
      lastUpdatedAt: new Date().toISOString(),
    }),
  );
}

/**
 * Persists dependent annotation state before any in-memory commit. Session,
 * annotation and history stores are then mutated as one synchronous transaction;
 * if any commit step throws, all three stores are restored to their snapshots.
 */
export async function commitDocumentMutation(
  input: CommitDocumentMutationInput,
): Promise<CommittedDocumentMutation> {
  let beforePageCount: number;
  let afterPageCount: number;
  let nextDocumentKey: string;

  try {
    [beforePageCount, afterPageCount, nextDocumentKey] = await Promise.all([
      PdfEditAdapter.countPages(input.beforeBytes),
      PdfEditAdapter.countPages(input.afterBytes),
      FileAdapter.hashBytes(input.afterBytes),
    ]);
  } catch (error) {
    throw toTransactionError('prepare', 'Unable to prepare document mutation', error);
  }

  const sessionSnapshot = useSessionStore.getState();
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
  const ocrForTargetGraph =
    input.nextOcrState === null
      ? {
          documentFingerprint: ocrBefore.documentFingerprint,
          result: null,
          corrections: [],
          regions: [],
          selectedPageIndexes: [],
          reviewFocus: null,
        }
      : input.nextOcrState
        ? normalizeOcrPageAnchoredState(input.nextOcrState, pageGraphForCommit)
        : sessionSnapshot.pageGraph && pageGraphForCommit
          ? reanchorOcrPageStateAfterPageGraphChange(
              ocrBefore,
              sessionSnapshot.pageGraph,
              pageGraphForCommit,
            )
          : normalizeOcrPageAnchoredState(ocrBefore, pageGraphForCommit);
  const ocrForCommit = rekeyOcrPageAnchoredState(
    ocrForTargetGraph,
    nextDocumentKey,
  );

  try {
    await saveAnnotations(nextDocumentKey, annotationsToPersist);
  } catch (error) {
    throw toTransactionError(
      'persistence',
      'Document mutation was not committed because annotation persistence failed',
      error,
    );
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

  const previousAfter = historyState.undoStack.at(-1)?.after;
  const canSharePreviousSnapshot = Boolean(
    sessionSnapshot.documentKey
    && previousAfter?.documentKey === sessionSnapshot.documentKey
    && previousAfter.pageCount === beforePageCount,
  );
  const beforeHistoryBytes = canSharePreviousSnapshot && previousAfter
    ? previousAfter.bytes
    : new Uint8Array(input.beforeBytes);

  try {
    useSessionStore.getState().replaceWorkingCopy(input.afterBytes, afterPageCount);
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
    const annotationAfter = useAnnotationStore.getState();
    const writerAfter = writerHistorySnapshot();
    const ocrAfter = currentOcrPageState();

    useHistoryStore.getState().push({
      id: uuidv4(),
      command: input.command,
      label: input.label,
      timestamp: Date.now(),
      ...(input.command.groupId ? { groupId: input.command.groupId } : {}),
      before: {
        bytes: beforeHistoryBytes,
        pageCount: beforePageCount,
        pageGraph: sessionSnapshot.pageGraph
          ? clonePageGraph(sessionSnapshot.pageGraph)
          : null,
        documentKey: sessionSnapshot.documentKey,
        selectedPages: [...sessionSnapshot.selectedPages],
        currentPage: sessionSnapshot.viewState.currentPage,
        annotations: [...annotationSnapshot.annotations],
        writer: writerBefore,
        ocr: cloneOcrPageAnchoredState(ocrBefore),
      },
      after: {
        bytes: new Uint8Array(input.afterBytes),
        pageCount: afterPageCount,
        pageGraph: sessionAfter.pageGraph
          ? clonePageGraph(sessionAfter.pageGraph)
          : null,
        documentKey: nextDocumentKey,
        selectedPages: [...sessionAfter.selectedPages],
        currentPage: sessionAfter.viewState.currentPage,
        annotations: [...annotationAfter.annotations],
        writer: writerAfter,
        ocr: cloneOcrPageAnchoredState(ocrAfter),
      },
    });
  } catch (error) {
    useSessionStore.setState(sessionSnapshot);
    useAnnotationStore.setState(annotationSnapshot);
    restoreWriterSnapshot(writerSnapshot);
    useOcrStore.setState(ocrStoreSnapshot);
    useHistoryStore.setState(historySnapshot);
    throw toTransactionError('commit', 'Document mutation commit failed and was rolled back', error);
  }

  return {
    nextBytes: input.afterBytes,
    nextPageCount: afterPageCount,
    nextDocumentKey,
  };
}

export function isDocumentMutationTransactionError(
  error: unknown,
): error is DocumentMutationTransactionError {
  return error instanceof DocumentMutationTransactionError;
}
