import { v4 as uuidv4 } from 'uuid';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { saveAnnotations } from '@/core/annotations/persistence';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useHistoryStore } from '@/core/document-history/store';
import { useSessionStore } from '@/core/session/store';
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

function cloneAnnotationLists(lists: PdfAnnotation[][]): PdfAnnotation[][] {
  return lists.map((annotations) => [...annotations]);
}

/**
 * Persists all dependent annotation state before committing any in-memory PDF
 * mutation. If an unexpected synchronous commit error occurs, every Zustand
 * store is restored to its pre-commit snapshot.
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

  const annotationState = useAnnotationStore.getState();
  const annotationsToPersist = input.nextAnnotations ?? annotationState.annotations;

  try {
    await saveAnnotations(nextDocumentKey, annotationsToPersist);
  } catch (error) {
    throw toTransactionError(
      'persistence',
      'Document mutation was not committed because annotation persistence failed',
      error,
    );
  }

  const sessionSnapshot = useSessionStore.getState();
  const annotationSnapshot = {
    annotations: [...annotationState.annotations],
    history: cloneAnnotationLists(annotationState.history),
    future: cloneAnnotationLists(annotationState.future),
    activeAnnotationId: annotationState.activeAnnotationId,
    selectedAnnotationIds: [...annotationState.selectedAnnotationIds],
    clipboard: [...annotationState.clipboard],
  };
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
    sessionSnapshot.documentKey &&
    previousAfter?.documentKey === sessionSnapshot.documentKey &&
    previousAfter.pageCount === beforePageCount,
  );
  const beforeHistoryBytes = canSharePreviousSnapshot && previousAfter
    ? previousAfter.bytes
    : new Uint8Array(input.beforeBytes);

  try {
    useHistoryStore.getState().push({
      id: uuidv4(),
      command: input.command,
      label: input.label,
      timestamp: Date.now(),
      before: {
        bytes: beforeHistoryBytes,
        pageCount: beforePageCount,
        documentKey: sessionSnapshot.documentKey,
      },
      after: {
        bytes: new Uint8Array(input.afterBytes),
        pageCount: afterPageCount,
        documentKey: nextDocumentKey,
      },
    });

    useSessionStore.getState().replaceWorkingCopy(input.afterBytes, afterPageCount);
    if (input.nextAnnotations) {
      useAnnotationStore.getState().applyPageRemap(input.nextAnnotations);
    }
    useSessionStore.getState().setDocumentKey(nextDocumentKey);
  } catch (error) {
    useSessionStore.setState(sessionSnapshot);
    useAnnotationStore.setState(annotationSnapshot);
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
