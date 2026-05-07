import { create } from 'zustand';
import type { DocumentHistory, Transaction } from './types';

const MAX_UNDO_DEPTH = 15;

interface HistoryActions {
  push: (transaction: Transaction) => void;
  undo: () => Transaction | null;
  redo: () => Transaction | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  peekUndo: () => Transaction | null;
  peekRedo: () => Transaction | null;
}

export const useHistoryStore = create<DocumentHistory & HistoryActions>((set, get) => ({
  undoStack: [],
  redoStack: [],

  push: (transaction) =>
    set((state) => ({
      undoStack: [...state.undoStack, transaction].slice(-MAX_UNDO_DEPTH),
      redoStack: [], // clear redo stack on new action
    })),

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
}));
