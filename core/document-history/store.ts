import { UndoRedoTransaction } from './types';

export class HistoryStore {
  private undoStack: UndoRedoTransaction[] = [];
  private redoStack: UndoRedoTransaction[] = [];

  push(transaction: UndoRedoTransaction): void {
    this.undoStack.push(transaction);
    this.redoStack = [];
  }

  undo(): UndoRedoTransaction | undefined {
    const transaction = this.undoStack.pop();
    if (transaction) {
      this.redoStack.push(transaction);
    }
    return transaction;
  }

  redo(): UndoRedoTransaction | undefined {
    const transaction = this.redoStack.pop();
    if (transaction) {
      this.undoStack.push(transaction);
    }
    return transaction;
  }
}
