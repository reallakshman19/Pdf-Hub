import { create } from 'zustand';
import { rekeyPageGraph } from '../pages/pageGraphAdmission';
import type { PageGraph, PageNode } from '../pages/types';
import type { DocumentSession, FitMode, ViewMode } from './types';

export interface OpenDocumentPayload {
  documentKey: string;
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
  pageGraph?: PageGraph<PageNode>;
  saveHandle?: FileSystemFileHandle | null;
}

export interface CommitWorkingCopyPayload {
  bytes: Uint8Array;
  pageCount: number;
  documentKey?: string | null;
}

export interface SessionActions {
  setDocumentKey: (documentKey: string | null) => void;
  setPageGraph: (pageGraph: PageGraph<PageNode> | null) => void;
  openDocument: (payload: OpenDocumentPayload) => void;
  replaceWorkingCopy: (bytes: Uint8Array, pageCount: number) => void;
  commitWorkingCopy: (payload: CommitWorkingCopyPayload) => void;
  setPage: (pageNumber: number) => void;
  setZoom: (zoom: number) => void;
  setFitMode: (fitMode: FitMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setDirty: (isDirty: boolean) => void;
  setDocumentDirty: (isDirty: boolean) => void;
  setReviewDirty: (isDirty: boolean) => void;
  setSessionDirty: (isDirty: boolean) => void;
  recordSaveExportAction: (
    action: import('./types').SessionSaveExportAction,
    status: import('./types').SessionOperationStatus,
    message: string | undefined,
  ) => void;
  setSaveHandle: (saveHandle: FileSystemFileHandle | null) => void;
  setSelectedPages: (pages: number[]) => void;
  toggleSelectedPage: (page: number) => void;
  clearSelectedPages: () => void;
  clearDocument: () => void;
  beginSaveOperation: (message?: string) => void;
  beginExportOperation: (message?: string) => void;
  completeSaveOperation: (message?: string) => void;
  failSaveOperation: (error: string) => void;
  setAnnotationAutosavePending: (pendingCount: number) => void;
  beginAnnotationAutosave: (pendingCount: number) => void;
  completeAnnotationAutosave: (pendingCount?: number) => void;
  failAnnotationAutosave: (error: string, pendingCount?: number) => void;
  clearAnnotationAutosaveError: () => void;
}

function uniqSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function clampPage(pageNumber: number, pageCount: number): number {
  return Math.max(1, Math.min(pageNumber, Math.max(1, pageCount)));
}

function validSelectedPages(pages: number[], pageCount: number): number[] {
  return uniqSorted(pages.filter((page) => page >= 1 && page <= Math.max(1, pageCount)));
}

export const useSessionStore = create<DocumentSession & SessionActions>((set) => ({
  documentKey: null,
  fileName: null,
  originalBytes: null,
  workingBytes: null,
  pageCount: 0,
  pageGraph: null,
  isDirty: false,
  isDocumentDirty: false,
  isReviewDirty: false,
  isSessionDirty: false,
  saveHandle: null,
  selectedPages: [],
  viewState: {
    currentPage: 1,
    zoom: 100,
    fitMode: 'manual',
    viewMode: 'continuous',
  },
  saveState: {
    status: 'idle',
  },
  annotationAutosaveState: {
    status: 'idle',
    pendingCount: 0,
  },

  setDocumentKey: (documentKey) =>
    set((state) => ({
      documentKey,
      pageGraph:
        state.pageGraph && documentKey
          ? rekeyPageGraph(state.pageGraph, documentKey)
          : documentKey
            ? state.pageGraph
            : null,
    })),

  setPageGraph: (pageGraph) =>
    set((state) => {
      if (!pageGraph) {
        return { pageGraph: null };
      }
      const pageCount = pageGraph.pages.length;
      return {
        pageGraph,
        pageCount,
        selectedPages: validSelectedPages(state.selectedPages, pageCount),
        viewState: {
          ...state.viewState,
          currentPage: clampPage(state.viewState.currentPage, pageCount),
        },
      };
    }),

  openDocument: ({
    documentKey,
    fileName,
    bytes,
    pageCount,
    pageGraph,
    saveHandle = null,
  }) => {
    if (pageGraph && pageGraph.pages.length !== pageCount) {
      throw new Error(
        `OpenDocument PageGraph count ${pageGraph.pages.length} does not match pageCount ${pageCount}`,
      );
    }
    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set({
      documentKey,
      fileName,
      originalBytes: bytes,
      workingBytes: bytes,
      pageCount,
      pageGraph: pageGraph ?? null,
      isDirty: false,
      isDocumentDirty: false,
      isReviewDirty: false,
      isSessionDirty: false,
      saveHandle,
      selectedPages: [],
      lastOperation: undefined,
      viewState: {
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
      saveState: {
        status: 'idle',
      },
      annotationAutosaveState: {
        status: 'idle',
        pendingCount: 0,
      },
    });
  },

  replaceWorkingCopy: (bytes, pageCount) => {
    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set((state) => ({
      workingBytes: bytes,
      pageCount,
      pageGraph: null,
      isDirty: true,
      isDocumentDirty: true,
      isSessionDirty: true,
      saveState: {
        status: 'idle',
        message: 'Unsaved document changes',
      },
      selectedPages: validSelectedPages(state.selectedPages, pageCount),
      viewState: {
        ...state.viewState,
        currentPage: clampPage(state.viewState.currentPage, pageCount),
      },
    }));
  },

  commitWorkingCopy: ({ bytes, pageCount, documentKey }) => {
    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set((state) => ({
      documentKey: documentKey === undefined ? state.documentKey : documentKey,
      originalBytes: bytes,
      workingBytes: bytes,
      pageCount,
      pageGraph:
        state.pageGraph && state.pageGraph.pages.length === pageCount
          ? (documentKey === undefined ? state.documentKey : documentKey)
            ? rekeyPageGraph(
                state.pageGraph,
                (documentKey === undefined ? state.documentKey : documentKey) as string,
              )
            : state.pageGraph
          : null,
      isDirty: false,
      isDocumentDirty: false,
      isReviewDirty: false,
      isSessionDirty: false,
      selectedPages: validSelectedPages(state.selectedPages, pageCount),
      viewState: {
        ...state.viewState,
        currentPage: clampPage(state.viewState.currentPage, pageCount),
      },
      saveState: {
        status: 'saved',
        completedAt: Date.now(),
        message: 'Document saved',
      },
      annotationAutosaveState: {
        status: 'saved',
        pendingCount: 0,
        lastSavedAt: Date.now(),
      },
    }));
  },

  setPage: (currentPage) =>
    set((state) => ({
      viewState: {
        ...state.viewState,
        currentPage: Math.max(1, Math.min(currentPage, Math.max(1, state.pageCount))),
      },
    })),

  setZoom: (zoom) =>
    set((state) => ({
      viewState: {
        ...state.viewState,
        zoom,
        fitMode: 'manual',
      },
    })),

  setFitMode: (fitMode) =>
    set((state) => ({
      viewState: {
        ...state.viewState,
        fitMode,
      },
    })),

  setViewMode: (viewMode) =>
    set((state) => ({
      viewState: {
        ...state.viewState,
        viewMode,
      },
    })),

  setDirty: (isDirty) => set({ isDirty, isDocumentDirty: isDirty, isSessionDirty: isDirty }),
  setDocumentDirty: (isDocumentDirty) => set({ isDocumentDirty }),
  setReviewDirty: (isReviewDirty) => set({ isReviewDirty }),
  setSessionDirty: (isSessionDirty) => set({ isSessionDirty }),
  recordSaveExportAction: (action, status, message) =>
    set({
      lastExportAction: action,
      lastOperation: {
        action: action.type,
        status,
        timestamp: Date.now(),
        ...(message ? { message } : {}),
      },
    }),
  setSaveHandle: (saveHandle) => set({ saveHandle }),

  setSelectedPages: (pages) =>
    set((state) => ({
      selectedPages: uniqSorted(
        pages.filter((page) => page >= 1 && page <= Math.max(1, state.pageCount)),
      ),
    })),

  toggleSelectedPage: (page) =>
    set((state) => {
      const exists = state.selectedPages.includes(page);
      return {
        selectedPages: exists
          ? state.selectedPages.filter((value) => value !== page)
          : uniqSorted([...state.selectedPages, page]),
      };
    }),

  clearSelectedPages: () => set({ selectedPages: [] }),

  clearDocument: () =>
    set({
      documentKey: null,
      fileName: null,
      originalBytes: null,
      workingBytes: null,
      pageCount: 0,
      pageGraph: null,
      isDirty: false,
      isDocumentDirty: false,
      isReviewDirty: false,
      isSessionDirty: false,
      saveHandle: null,
      selectedPages: [],
      lastExportAction: undefined,
      lastOperation: undefined,
      viewState: {
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    }),

  beginSaveOperation: (message = 'Saving document…') =>
    set({
      saveState: {
        status: 'saving',
        startedAt: Date.now(),
        message,
      },
    }),

  beginExportOperation: (message = 'Exporting document…') =>
    set({
      saveState: {
        status: 'exporting',
        startedAt: Date.now(),
        message,
      },
    }),

  completeSaveOperation: (message = 'Document saved') =>
    set({
      saveState: {
        status: 'saved',
        completedAt: Date.now(),
        message,
      },
    }),

  failSaveOperation: (error) =>
    set({
      saveState: {
        status: 'failed',
        completedAt: Date.now(),
        error,
        message: 'Save/export failed',
      },
    }),

  setAnnotationAutosavePending: (pendingCount) =>
    set({
      annotationAutosaveState: {
        status: pendingCount > 0 ? 'pending' : 'idle',
        pendingCount,
      },
    }),

  beginAnnotationAutosave: (pendingCount) =>
    set({
      annotationAutosaveState: {
        status: 'saving',
        pendingCount,
      },
    }),

  completeAnnotationAutosave: (pendingCount = 0) =>
    set({
      annotationAutosaveState: {
        status: pendingCount > 0 ? 'pending' : 'saved',
        pendingCount,
        lastSavedAt: Date.now(),
      },
    }),

  failAnnotationAutosave: (error, pendingCount = 0) =>
    set({
      annotationAutosaveState: {
        status: 'failed',
        pendingCount,
        lastFailedAt: Date.now(),
        error,
      },
    }),

  clearAnnotationAutosaveError: () =>
    set((state) => ({
      annotationAutosaveState: {
        status: state.annotationAutosaveState.pendingCount > 0 ? 'pending' : 'idle',
        pendingCount: state.annotationAutosaveState.pendingCount,
        lastSavedAt: state.annotationAutosaveState.lastSavedAt,
      },
    })),
}));
