import type { PdfAnnotation } from '../annotations/types';
import type { PdfCommand } from '../commands/types';

export interface HistoryState {
  bytes: Uint8Array;
  pageCount: number;
  documentKey?: string | null;
  selectedPages: number[];
  currentPage: number;
  annotations: PdfAnnotation[];
}

export interface Transaction {
  id: string;
  command: PdfCommand;
  label: string;
  timestamp: number;
  before: HistoryState;
  after: HistoryState;
  groupId?: string;
}

export type HistoryTrimReason = 'none' | 'depth' | 'bytes' | 'depth-and-bytes';

export interface HistoryDiagnostics {
  undoTransactions: number;
  redoTransactions: number;
  retainedTransactions: number;
  retainedBytes: number;
  maxRetainedBytes: number;
  maxUndoDepth: number;
  droppedTransactions: number;
  lastTrimReason: HistoryTrimReason;
  overBudget: boolean;
}

export interface DocumentHistory {
  undoStack: Transaction[];
  redoStack: Transaction[];
  retainedBytes: number;
  droppedTransactions: number;
  lastTrimReason: HistoryTrimReason;
  overBudget: boolean;
}
