import { useSessionStore } from '../session/store';
import { useHistoryStore } from './store';

function restoreHistoryState(
  state: { bytes: Uint8Array; pageCount: number; documentKey?: string | null },
): void {
  const session = useSessionStore.getState();
  session.replaceWorkingCopy(state.bytes, state.pageCount);
  if (state.documentKey !== undefined) {
    useSessionStore.getState().setDocumentKey(state.documentKey);
  }
}

export function applyUndo(): boolean {
  const transaction = useHistoryStore.getState().undo();
  if (!transaction) return false;

  restoreHistoryState(transaction.before);
  return true;
}

export function applyRedo(): boolean {
  const transaction = useHistoryStore.getState().redo();
  if (!transaction) return false;

  restoreHistoryState(transaction.after);
  return true;
}
