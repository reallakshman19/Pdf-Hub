import { saveAnnotations } from '../annotations/persistence';
import { normalizeAnnotationPageAnchors } from '../annotations/pageAnchor';
import { useAnnotationStore } from '../annotations/store';
import { enqueueDocumentOperation } from '../commands/documentOperationQueue';
import { documentBus } from '../events/bus';
import { materializeDocumentSource } from '../document-source/materialize';
import { clonePageGraph } from '../pages/pageGraph';
import { resolveWorkingRevisionStore } from '../revision-store/registry';
import { useSessionStore } from '../session/store';
import { useWriterV2Store } from '../writer-v2/writerV2Store';
import { normalizeWriterPageAnchors } from '../writer-v2/writerPageAnchor';
import {
  cloneOcrPageAnchoredState,
  normalizeOcrPageAnchoredState,
} from '../ocr/ocrPageAnchor';
import { recomputeOcrDerivedState, useOcrStore } from '../ocr/ocrStore';
import { useHistoryStore } from './store';
import {
  prepareHistoryJournalNavigation,
} from './journal/navigation';
import type { HistoryState, Transaction } from './types';

async function persistHistoryState(state: HistoryState): Promise<void> {
  if (!state.documentKey) return;
  const annotations = normalizeAnnotationPageAnchors(
    state.annotations,
    state.pageGraph,
  );
  await saveAnnotations(state.documentKey, annotations);
}

async function resolveHistoryPdfBytes(
  state: HistoryState,
): Promise<{ bytes: Uint8Array; activeRevisionId: string | null }> {
  if (state.revision) {
    if (
      state.activeRevisionId
      && state.activeRevisionId !== state.revision.revisionId
    ) {
      throw new Error(
        'History revision locator does not match activeRevisionId.',
      );
    }
    if (
      state.documentKey
      && state.documentKey !== state.revision.revisionId
    ) {
      throw new Error(
        'History revision locator does not match documentKey.',
      );
    }

    const activeStoreId =
      useSessionStore.getState().revisionStoreId;
    if (activeStoreId !== state.revision.storeId) {
      throw new Error(
        `History revision store ${state.revision.storeId} does not match active session store ${activeStoreId ?? '(none)'}.`,
      );
    }

    const store = resolveWorkingRevisionStore(
      state.revision.storeId,
    );
    if (!store) {
      throw new Error(
        `WorkingRevisionStore ${state.revision.storeId} is not registered for history restore.`,
      );
    }

    const source = await store.open(
      state.revision.revisionId,
    );
    return {
      bytes: await materializeDocumentSource(source),
      activeRevisionId: state.revision.revisionId,
    };
  }

  if (!state.bytes) {
    throw new Error(
      'History state has neither a revision locator nor inline PDF bytes.',
    );
  }

  return {
    bytes: state.bytes,
    activeRevisionId: state.activeRevisionId ?? null,
  };
}

function restoreHistoryState(
  state: HistoryState,
  pdf: { bytes: Uint8Array; activeRevisionId: string | null },
): void {
  const session = useSessionStore.getState();

  session.replaceWorkingCopy(
    pdf.bytes,
    state.pageCount,
    pdf.activeRevisionId,
  );

  if (state.documentKey !== undefined) {
    useSessionStore.getState().setDocumentKey(state.documentKey);
  }

  useSessionStore.getState().setPageGraph(
    state.pageGraph ? clonePageGraph(state.pageGraph) : null,
  );
  if (state.selectedPageIds.length > 0) {
    useSessionStore.getState().setSelectedPageIds(state.selectedPageIds);
  } else {
    useSessionStore.getState().setSelectedPages(state.selectedPages);
  }

  if (state.currentPageId) {
    useSessionStore.getState().setPageById(state.currentPageId);
  } else {
    useSessionStore.getState().setPage(state.currentPage);
  }
  useAnnotationStore.getState().setAnnotations(
    normalizeAnnotationPageAnchors(state.annotations, state.pageGraph),
  );

  if (state.writer) {
    const writerElements =
      state.writer.documentMode === 'blankDocument'
        ? state.writer.elements.map((element) => ({
            ...element,
            rect: { ...element.rect },
            style: { ...element.style },
          }))
        : normalizeWriterPageAnchors(
            state.writer.elements,
            state.pageGraph,
          );

    useWriterV2Store.setState({
      elements: writerElements,
      selectedIds: [...state.writer.selectedIds],
      activeId: state.writer.activeId,
      undoStack: [],
      redoStack: [],
      dirty: true,
      editingId: null,
    });
  }

  if (state.ocr) {
    const currentOcr = useOcrStore.getState();
    const restoredOcr = normalizeOcrPageAnchoredState(
      cloneOcrPageAnchoredState(state.ocr),
      state.pageGraph,
    );
    useOcrStore.setState(
      recomputeOcrDerivedState({
        ...currentOcr,
        ...restoredOcr,
        activeJobId: null,
        jobs: [],
        dirty: true,
        lastUpdatedAt: new Date().toISOString(),
      }),
    );
  }

  documentBus.emit({ type: 'DOCUMENT_REPLACED' });
}

function captureHistoryRestoreSnapshot() {
  const history = useHistoryStore.getState();
  return {
    session: useSessionStore.getState(),
    annotations: useAnnotationStore.getState(),
    writer: useWriterV2Store.getState(),
    ocr: useOcrStore.getState(),
    history: {
      undoStack: [...history.undoStack],
      redoStack: [...history.redoStack],
      retainedBytes: history.retainedBytes,
      droppedTransactions:
        history.droppedTransactions,
      lastTrimReason: history.lastTrimReason,
      overBudget: history.overBudget,
    },
  };
}

function restoreHistoryRestoreSnapshot(
  snapshot: ReturnType<typeof captureHistoryRestoreSnapshot>,
): void {
  useSessionStore.setState(snapshot.session);
  useAnnotationStore.setState(snapshot.annotations);
  useWriterV2Store.setState(snapshot.writer);
  useOcrStore.setState(snapshot.ocr);
  useHistoryStore.setState(snapshot.history);
  documentBus.emit({ type: 'DOCUMENT_REPLACED' });
}

async function applyHistoryDirection(
  direction: 'undo' | 'redo',
): Promise<boolean> {
  return enqueueDocumentOperation(async () => {
    const history = useHistoryStore.getState();
    const candidate = direction === 'undo'
      ? history.peekUndo()
      : history.peekRedo();

    if (!candidate) return false;

    const target = direction === 'undo'
      ? candidate.before
      : candidate.after;

    // Resolve/materialize and prepare journal navigation before mutating
    // application or history state.
    const targetPdf = await resolveHistoryPdfBytes(target);
    const currentSession = useSessionStore.getState();
    const targetRevisionId =
      target.revision?.revisionId
      ?? target.activeRevisionId
      ?? null;
    const preparedJournal =
      await prepareHistoryJournalNavigation({
        journalStoreId:
          currentSession.historyJournalStoreId,
        journalId: currentSession.historyJournalId,
        revisionStoreId:
          currentSession.revisionStoreId,
        currentRevisionId:
          currentSession.activeRevisionId,
        targetRevisionId,
      });
    const restoreSnapshot = captureHistoryRestoreSnapshot();

    try {
      // Restore first, persist dependent state, move the in-memory stack, then
      // atomically replace durable journal metadata. Any failure rolls
      // session/dependent/history stores back to the pre-navigation snapshot.
      restoreHistoryState(target, targetPdf);
      await persistHistoryState(target);

      const transaction: Transaction | null = direction === 'undo'
        ? useHistoryStore.getState().undo()
        : useHistoryStore.getState().redo();

      if (!transaction || transaction.id !== candidate.id) {
        restoreHistoryRestoreSnapshot(restoreSnapshot);
        return false;
      }

      if (preparedJournal) {
        await preparedJournal.store.save(
          preparedJournal.manifest,
        );
      }

      return true;
    } catch (error) {
      restoreHistoryRestoreSnapshot(restoreSnapshot);
      throw error;
    }
  });
}

export function applyUndo(): Promise<boolean> {
  return applyHistoryDirection('undo');
}

export function applyRedo(): Promise<boolean> {
  return applyHistoryDirection('redo');
}
