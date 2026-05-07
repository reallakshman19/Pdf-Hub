import { useSessionStore } from '../session/store';
import { useHistoryStore } from './store';

export function applyUndo(): boolean {
  const transaction = useHistoryStore.getState().undo();
  if (!transaction) return false;

  const { before } = transaction;
  useSessionStore.getState().replaceWorkingCopy(before.bytes, before.pageCount);
  return true;
}

export function applyRedo(): boolean {
  const transaction = useHistoryStore.getState().redo();
  if (!transaction) return false;

  const { after } = transaction;
  useSessionStore.getState().replaceWorkingCopy(after.bytes, after.pageCount);
  return true;
}
