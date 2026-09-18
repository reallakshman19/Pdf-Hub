import type { PdfAnnotation } from '../annotations/types';
import type { WriterDocumentMode, WriterElementV2 } from '../writer-v2/types';
import type { PdfCommand } from '../commands/types';
import type { PageGraph, PageNode } from '../pages/types';

export interface WriterHistoryState {
  /** Distinguishes PDF-overlay PageId semantics from standalone blank paging. */
  documentMode?: WriterDocumentMode;
  elements: WriterElementV2[];
  selectedIds: string[];
  activeId: string | null;
}

export interface HistoryState {
  bytes: Uint8Array;
  pageCount: number;
  pageGraph: PageGraph<PageNode> | null;
  documentKey?: string | null;
  selectedPages: number[];
  currentPage: number;
  annotations: PdfAnnotation[];
  writer?: WriterHistoryState;
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
