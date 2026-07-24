import { create } from 'zustand';
import type {
  DocumentHistory,
  HistoryDiagnostics,
  Transaction,
} from './types';
import { HISTORY_POLICY } from './historyPolicy';
import { retainHistorySuffix } from './historyBudget';

interface HistoryActions {
  push: (transaction: Transaction) => void;
  undo: () => Transaction | null;
  redo: () => Transaction | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  peekUndo: () => Transaction | null;
  peekRedo: () => Transaction | null;
  getDiagnostics: () => HistoryDiagnostics;
}

export const useHistoryStore = create<DocumentHistory & HistoryActions>((set, get) => ({
  undoStack: [],
  redoStack: [],
  retainedBytes: 0,
  droppedTransactions: 0,
  lastTrimReason: 'none',
  overBudget: false,

  push: (transaction) =>
    set((state) => {
      const retention = retainHistorySuffix([...state.undoStack, transaction]);
      return {
        undoStack: retention.transactions,
        redoStack: [],
        retainedBytes: retention.retainedBytes,
        droppedTransactions: state.droppedTransactions + retention.droppedTransactions,
        lastTrimReason: retention.reason,
        overBudget: retention.overBudget,
      };
    }),

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const transaction = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, transaction],
    });
    return transaction;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const transaction = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, transaction],
    });
    return transaction;
  },

  clear: () =>
    set({
      undoStack: [],
      redoStack: [],
      retainedBytes: 0,
      droppedTransactions: 0,
      lastTrimReason: 'none',
      overBudget: false,
    }),

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  peekUndo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    return undoStack[undoStack.length - 1];
  },
  peekRedo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    return redoStack[redoStack.length - 1];
  },
  getDiagnostics: () => {
    const state = get();
    return {
      undoTransactions: state.undoStack.length,
      redoTransactions: state.redoStack.length,
      retainedTransactions: state.undoStack.length + state.redoStack.length,
      retainedBytes: state.retainedBytes,
      maxRetainedBytes: HISTORY_POLICY.maxRetainedBytes,
      maxUndoDepth: HISTORY_POLICY.maxUndoDepth,
      droppedTransactions: state.droppedTransactions,
      lastTrimReason: state.lastTrimReason,
      overBudget: state.overBudget,
    };
  },
}));
