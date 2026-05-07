import type { CommandSource, DocumentCommand } from '../commands/types';

export interface HistoryState {
  bytes: Uint8Array;
  pageCount: number;
}

export interface Transaction {
  id: string;
  command: DocumentCommand;
  source: CommandSource;
  label: string;
  timestamp: number;
  before: HistoryState;
  after: HistoryState;
  groupId?: string;
}

export interface DocumentHistory {
  undoStack: Transaction[];
  redoStack: Transaction[];
}
