export type FitMode = 'manual' | 'width' | 'page';
export type ViewMode = 'continuous' | 'single' | 'two-page';

export interface ViewState {
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

export interface DocumentSession {
  documentKey: string | null;
  fileName: string | null;
  originalBytes: Uint8Array | null;
  workingBytes: Uint8Array | null;
  pageCount: number;

  // explicit dirty flags
  isDocumentDirty: boolean;
  isReviewDirty: boolean;
  isSessionDirty: boolean;
  // keep legacy isDirty around for backward compatibility until refactored out
  isDirty: boolean;

  saveHandle: FileSystemFileHandle | null;
  selectedPages: number[];
  viewState: ViewState;

  lastExportAction?: SessionSaveExportAction;
  lastOperation?: SessionOperationMetadata;
}
