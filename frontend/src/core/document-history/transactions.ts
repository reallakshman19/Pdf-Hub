import { saveAnnotations } from '../annotations/persistence';
import { useAnnotationStore } from '../annotations/store';
import { enqueueDocumentOperation } from '../commands/documentOperationQueue';
import { documentBus } from '../events/bus';
import { useSessionStore } from '../session/store';
import { useHistoryStore } from './store';
import type { HistoryState, Transaction } from './types';

async function persistHistoryState(state: HistoryState): Promise<void> {
  if (!state.documentKey) return;
  await saveAnnotations(state.documentKey, state.annotations);
}

function restoreHistoryState(state: HistoryState): void {
  const session = useSessionStore.getState();

  session.replaceWorkingCopy(state.bytes, state.pageCount);

  if (state.documentKey !== undefined) {
    useSessionStore.getState().setDocumentKey(state.documentKey);
  }

  useSessionStore.getState().setSelectedPages(state.selectedPages);
  useSessionStore.getState().setPage(state.currentPage);
  useAnnotationStore.getState().setAnnotations([...state.annotations]);
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

    await persistHistoryState(target);

    const transaction: Transaction | null = direction === 'undo'
      ? useHistoryStore.getState().undo()
      : useHistoryStore.getState().redo();

    if (!transaction || transaction.id !== candidate.id) {
      return false;
    }

    restoreHistoryState(
      direction === 'undo'
        ? transaction.before
        : transaction.after,
    );

    return true;
  });
}

export function applyUndo(): Promise<boolean> {
  return applyHistoryDirection('undo');
}

export function applyRedo(): Promise<boolean> {
  return applyHistoryDirection('redo');
}
