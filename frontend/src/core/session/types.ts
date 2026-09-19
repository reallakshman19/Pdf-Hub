import type { PageGraph, PageId, PageNode } from '../pages/types';

export type FitMode = 'manual' | 'width' | 'page';
export type ViewMode = 'continuous' | 'single' | 'two-page';

export interface ViewState {
  /** Canonical page identity when a PageGraph is available. */
  currentPageId: PageId | null;
  /** One-based compatibility/render position derived from currentPageId. */
  currentPage: number;
  zoom: number;
  fitMode: FitMode;
  viewMode: ViewMode;
}

export interface SaveDocumentAction {
  type: 'SAVE_WORKING_DOCUMENT';
}

export interface ExportReviewAction {
  type: 'EXPORT_REVIEW_SNAPSHOT';
}

export interface DownloadPdfAction {
  type: 'DOWNLOAD_PROCESSED_PDF';
}

export interface SaveSessionSnapshotAction {
  type: 'SAVE_SESSION_SNAPSHOT';
}

export type SessionSaveExportAction =
  | SaveDocumentAction
  | ExportReviewAction
  | DownloadPdfAction
  | SaveSessionSnapshotAction;

export type SessionOperationStatus = 'success' | 'failure';

export interface SessionOperationMetadata {
  action: SessionSaveExportAction['type'];
  status: SessionOperationStatus;
  timestamp: number;
  message?: string;
}

export type SaveLifecycleStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'exporting'
  | 'failed';

export type AutosaveStatus =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'failed';

export interface SessionSaveState {
  status: SaveLifecycleStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  message?: string;
}

export interface AnnotationAutosaveState {
  status: AutosaveStatus;
  pendingCount: number;
  lastSavedAt?: number;
  lastFailedAt?: number;
  error?: string;
}

export interface DocumentSession {
  documentKey: string | null;
  /** Runtime identity of the immutable original DocumentSource. */
  sourceId: string | null;
  /** Process-local WorkingRevisionStore registry identity. */
  revisionStoreId: string | null;
  /** Immutable content-addressed recovery revision created at primary admission. */
  originalRevisionId: string | null;
  /** Durable revision matching workingBytes, or null when bytes are unpublished. */
  activeRevisionId: string | null;
  fileName: string | null;
  /**
   * Copy-on-write: the store holds whatever reference callers pass to
   * openDocument/replaceWorkingCopy/commitWorkingCopy without copying it.
   * Callers must treat any Uint8Array they hand to the store as immutable
   * from that point on; copy it yourself before writing into it in place.
   */
  originalBytes: Uint8Array | null;
  workingBytes: Uint8Array | null;
  /** Compatibility count derived from PageGraph when a graph is present. */
  pageCount: number;
  pageGraph: PageGraph<PageNode> | null;

  isDocumentDirty: boolean;
  isReviewDirty: boolean;
  isSessionDirty: boolean;
  isDirty: boolean;

  saveHandle: FileSystemFileHandle | null;
  /** Canonical selected-page identity for PDF-backed sessions. */
  selectedPageIds: PageId[];
  /** One-based compatibility/render positions derived from selectedPageIds. */
  selectedPages: number[];
  viewState: ViewState;

  saveState: SessionSaveState;
  annotationAutosaveState: AnnotationAutosaveState;

  lastExportAction?: SessionSaveExportAction;
  lastOperation?: SessionOperationMetadata;
}
