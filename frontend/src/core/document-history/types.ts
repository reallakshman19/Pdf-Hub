import type { PdfAnnotation } from '../annotations/types';
import type { WriterDocumentMode, WriterElementV2 } from '../writer-v2/types';
import type { PdfCommand } from '../commands/types';
import type { PageGraph, PageId, PageNode } from '../pages/types';
import type { OcrPageAnchoredState } from '../ocr/ocrPageAnchor';

export interface WriterHistoryState {
  /** Distinguishes PDF-overlay PageId semantics from standalone blank paging. */
  documentMode?: WriterDocumentMode;
  elements: WriterElementV2[];
  selectedIds: string[];
  activeId: string | null;
}

export interface HistoryRevisionLocator {
  storeId: string;
  revisionId: string;
}

export interface HistoryState {
  /**
   * Inline PDF snapshot retained only when no durable revision locator is
   * available (legacy/unpublished compatibility sessions).
   */
  bytes?: Uint8Array;
  /** Preferred immutable PDF backing for revision-aware history. */
  revision?: HistoryRevisionLocator;
  pageCount: number;
  pageGraph: PageGraph<PageNode> | null;
  documentKey?: string | null;
  /** Compatibility mirror of revision.revisionId when a durable locator exists. */
  activeRevisionId?: string | null;
  selectedPageIds: PageId[];
  selectedPages: number[];
  currentPageId: PageId | null;
  currentPage: number;
  annotations: PdfAnnotation[];
  writer?: WriterHistoryState;
  ocr?: OcrPageAnchoredState;
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
