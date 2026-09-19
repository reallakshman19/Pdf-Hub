import { create } from 'zustand';
import { pageIdAtPhysicalIndex, physicalIndexForPageId, rekeyPageGraph } from '../pages/pageGraph';
import type { PageGraph, PageId, PageNode } from '../pages/types';
import type { DocumentSession, FitMode, ViewMode } from './types';
import {
  releaseDocumentSource,
  resolveDocumentSource,
} from '@/core/document-source/registry';
import {
  releaseWorkingRevisionStore,
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';
import {
  releaseHistoryJournalStore,
  resolveHistoryJournalStore,
} from '@/core/document-history/journal/registry';

export interface OpenDocumentPayload {
  documentKey: string;
  sourceId?: string | null;
  revisionStoreId?: string | null;
  originalRevisionId?: string | null;
  activeRevisionId?: string | null;
  historyJournalStoreId?: string | null;
  historyJournalId?: string | null;
  historyJournalPersistent?: boolean;
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
  /** Revision already published before this state commit. */
  activeRevisionId?: string | null;
}

export interface SessionActions {
  setDocumentKey: (documentKey: string | null) => void;
  setPageGraph: (pageGraph: PageGraph<PageNode> | null) => void;
  openDocument: (payload: OpenDocumentPayload) => void;
  replaceWorkingCopy: (
    bytes: Uint8Array,
    pageCount: number,
    activeRevisionId?: string | null,
  ) => void;
  commitWorkingCopy: (payload: CommitWorkingCopyPayload) => void;
  setPage: (pageNumber: number) => void;
  setPageById: (pageId: PageId) => void;
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
  setSelectedPageIds: (pageIds: PageId[]) => void;
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

function pageIdForNumber(
  pageGraph: PageGraph<PageNode> | null,
  pageNumber: number,
): PageId | null {
  if (!pageGraph) return null;
  return pageIdAtPhysicalIndex(pageGraph, pageNumber - 1);
}

function pageNumberForId(
  pageGraph: PageGraph<PageNode> | null,
  pageId: PageId | null,
): number | null {
  if (!pageGraph || !pageId) return null;
  const index = physicalIndexForPageId(pageGraph, pageId);
  return index >= 0 ? index + 1 : null;
}

function pageIdsForNumbers(
  pageGraph: PageGraph<PageNode> | null,
  pages: number[],
): PageId[] {
  if (!pageGraph) return [];
  return validSelectedPages(pages, pageGraph.pages.length).flatMap((pageNumber) => {
    const pageId = pageIdForNumber(pageGraph, pageNumber);
    return pageId ? [pageId] : [];
  });
}

function normalizedPageIds(
  pageGraph: PageGraph<PageNode>,
  pageIds: readonly PageId[],
): PageId[] {
  const selected = new Set(pageIds);
  return pageGraph.pages
    .map((page) => page.pageId)
    .filter((pageId) => selected.has(pageId));
}

function pageNumbersForIds(
  pageGraph: PageGraph<PageNode>,
  pageIds: readonly PageId[],
): number[] {
  return normalizedPageIds(pageGraph, pageIds).flatMap((pageId) => {
    const pageNumber = pageNumberForId(pageGraph, pageId);
    return pageNumber === null ? [] : [pageNumber];
  });
}

function assertOpenRevisionMetadata(input: {
  documentKey: string;
  revisionStoreId: string | null;
  originalRevisionId: string | null;
  activeRevisionId: string | null;
}): void {
  const values = [
    input.revisionStoreId,
    input.originalRevisionId,
    input.activeRevisionId,
  ];
  const presentCount = values.filter(
    (value) => value !== null,
  ).length;

  if (presentCount === 0) return;
  if (presentCount !== values.length) {
    throw new Error(
      'OpenDocument revision metadata must provide revisionStoreId, originalRevisionId and activeRevisionId together.',
    );
  }
  if (
    input.activeRevisionId !== input.documentKey
  ) {
    throw new Error(
      `OpenDocument activeRevisionId ${input.activeRevisionId} must match documentKey ${input.documentKey}.`,
    );
  }
  if (
    input.revisionStoreId
    && !resolveWorkingRevisionStore(input.revisionStoreId)
  ) {
    throw new Error(
      `OpenDocument revisionStoreId ${input.revisionStoreId} is not registered.`,
    );
  }
}

function assertOpenHistoryJournalMetadata(input: {
  historyJournalStoreId: string | null;
  historyJournalId: string | null;
  historyJournalPersistent: boolean;
}): void {
  const hasStore = input.historyJournalStoreId !== null;
  const hasJournal = input.historyJournalId !== null;

  if (hasStore !== hasJournal) {
    throw new Error(
      'OpenDocument historyJournalStoreId and historyJournalId must be provided together.',
    );
  }
  if (
    input.historyJournalPersistent
    && (!hasStore || !hasJournal)
  ) {
    throw new Error(
      'OpenDocument cannot mark history journal persistent without journal identity.',
    );
  }
  if (
    input.historyJournalStoreId
    && !resolveHistoryJournalStore(
      input.historyJournalStoreId,
    )
  ) {
    throw new Error(
      `OpenDocument historyJournalStoreId ${input.historyJournalStoreId} is not registered.`,
    );
  }
}

function resolveNavigationForGraph(
  state: Pick<DocumentSession, 'pageGraph' | 'selectedPageIds' | 'selectedPages' | 'viewState'>,
  pageGraph: PageGraph<PageNode>,
) {
  const pageCount = pageGraph.pages.length;
  const priorSelectedIds =
    state.selectedPageIds.length > 0
      ? state.selectedPageIds
      : pageIdsForNumbers(state.pageGraph ?? pageGraph, state.selectedPages);
  const selectedPageIds = normalizedPageIds(pageGraph, priorSelectedIds);
  const selectedPages = pageNumbersForIds(pageGraph, selectedPageIds);

  const priorCurrentId =
    state.viewState.currentPageId
    ?? pageIdForNumber(
      state.pageGraph ?? pageGraph,
      state.viewState.currentPage,
    );
  const preservedCurrentPage = pageNumberForId(pageGraph, priorCurrentId);
  const currentPage =
    preservedCurrentPage
    ?? clampPage(state.viewState.currentPage, pageCount);
  const currentPageId =
    preservedCurrentPage !== null
      ? priorCurrentId
      : pageIdForNumber(pageGraph, currentPage);

  return {
    selectedPageIds,
    selectedPages,
    currentPage,
    currentPageId,
  };
}

export const useSessionStore = create<DocumentSession & SessionActions>((set, get) => ({
  documentKey: null,
  sourceId: null,
  revisionStoreId: null,
  originalRevisionId: null,
  activeRevisionId: null,
  historyJournalStoreId: null,
  historyJournalId: null,
  historyJournalPersistent: false,
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
  selectedPageIds: [],
  selectedPages: [],
  viewState: {
    currentPageId: null,
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
      activeRevisionId:
        state.activeRevisionId === documentKey
          ? state.activeRevisionId
          : null,
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

      const navigation = resolveNavigationForGraph(state, pageGraph);
      return {
        pageGraph,
        pageCount: pageGraph.pages.length,
        selectedPageIds: navigation.selectedPageIds,
        selectedPages: navigation.selectedPages,
        viewState: {
          ...state.viewState,
          currentPageId: navigation.currentPageId,
          currentPage: navigation.currentPage,
        },
      };
    }),

  openDocument: ({
    documentKey,
    sourceId = null,
    revisionStoreId = null,
    originalRevisionId = null,
    activeRevisionId = null,
    historyJournalStoreId = null,
    historyJournalId = null,
    historyJournalPersistent = false,
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
    if (sourceId && !resolveDocumentSource(sourceId)) {
      throw new Error(
        `OpenDocument sourceId ${sourceId} is not registered.`,
      );
    }
    assertOpenRevisionMetadata({
      documentKey,
      revisionStoreId,
      originalRevisionId,
      activeRevisionId,
    });
    assertOpenHistoryJournalMetadata({
      historyJournalStoreId,
      historyJournalId,
      historyJournalPersistent,
    });

    const previousSourceId = get().sourceId;
    if (
      previousSourceId
      && previousSourceId !== sourceId
    ) {
      releaseDocumentSource(previousSourceId);
    }

    const previousHistoryJournalStoreId =
      get().historyJournalStoreId;
    if (
      previousHistoryJournalStoreId
      && previousHistoryJournalStoreId
        !== historyJournalStoreId
    ) {
      releaseHistoryJournalStore(
        previousHistoryJournalStoreId,
      );
    }

    const previousRevisionStoreId =
      get().revisionStoreId;
    if (
      previousRevisionStoreId
      && previousRevisionStoreId !== revisionStoreId
    ) {
      releaseWorkingRevisionStore(
        previousRevisionStoreId,
      );
    }

    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set({
      documentKey,
      sourceId,
      revisionStoreId,
      originalRevisionId,
      activeRevisionId,
      historyJournalStoreId,
      historyJournalId,
      historyJournalPersistent,
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
      selectedPageIds: [],
      selectedPages: [],
      lastOperation: undefined,
      viewState: {
        currentPageId: pageGraph?.pages[0]?.pageId ?? null,
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

  replaceWorkingCopy: (
    bytes,
    pageCount,
    activeRevisionId = null,
  ) => {
    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set((state) => {
      const revisionStoreId = state.revisionStoreId;
      if (activeRevisionId && !revisionStoreId) {
        throw new Error(
          'Cannot install activeRevisionId without a registered revisionStoreId.',
        );
      }
      if (
        activeRevisionId
        && revisionStoreId
        && !resolveWorkingRevisionStore(revisionStoreId)
      ) {
        throw new Error(
          `Cannot install activeRevisionId because revisionStoreId ${revisionStoreId} is not registered.`,
        );
      }
      return {
        workingBytes: bytes,
        activeRevisionId,
        pageCount,
        pageGraph: null,
        isDirty: true,
        isDocumentDirty: true,
        isSessionDirty: true,
        saveState: {
          status: 'idle',
          message: 'Unsaved document changes',
        },
        selectedPages: validSelectedPages(
          state.selectedPages,
          pageCount,
        ),
        viewState: {
          ...state.viewState,
          currentPage: clampPage(
            state.viewState.currentPage,
            pageCount,
          ),
        },
      };
    });
  },

  commitWorkingCopy: ({
    bytes,
    pageCount,
    documentKey,
    activeRevisionId,
  }) => {
    if (import.meta.env.DEV) Object.freeze(bytes.buffer);
    return set((state) => {
      const nextDocumentKey =
        documentKey === undefined ? state.documentKey : documentKey;
      const nextActiveRevisionId =
        activeRevisionId !== undefined
          ? activeRevisionId
          : state.activeRevisionId === nextDocumentKey
            ? state.activeRevisionId
            : null;
      if (
        nextActiveRevisionId
        && nextActiveRevisionId !== nextDocumentKey
      ) {
        throw new Error(
          `activeRevisionId ${nextActiveRevisionId} must match documentKey ${nextDocumentKey}.`,
        );
      }
      if (
        nextActiveRevisionId
        && !state.revisionStoreId
      ) {
        throw new Error(
          'Cannot commit activeRevisionId without a registered revisionStoreId.',
        );
      }

      const nextPageGraph =
        state.pageGraph && state.pageGraph.pages.length === pageCount
          ? nextDocumentKey
            ? rekeyPageGraph(state.pageGraph, nextDocumentKey)
            : state.pageGraph
          : null;

      const navigation = nextPageGraph
        ? resolveNavigationForGraph(state, nextPageGraph)
        : {
            selectedPageIds: state.selectedPageIds,
            selectedPages: validSelectedPages(state.selectedPages, pageCount),
            currentPageId: state.viewState.currentPageId,
            currentPage: clampPage(state.viewState.currentPage, pageCount),
          };

      return {
        documentKey: nextDocumentKey,
        activeRevisionId: nextActiveRevisionId,
        originalBytes: bytes,
        workingBytes: bytes,
        pageCount,
        pageGraph: nextPageGraph,
        isDirty: false,
        isDocumentDirty: false,
        isReviewDirty: false,
        isSessionDirty: false,
        selectedPageIds: navigation.selectedPageIds,
        selectedPages: navigation.selectedPages,
        viewState: {
          ...state.viewState,
          currentPageId: navigation.currentPageId,
          currentPage: navigation.currentPage,
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
      };
    });
  },

  setPage: (currentPage) =>
    set((state) => {
      const pageNumber = clampPage(currentPage, state.pageCount);
      return {
        viewState: {
          ...state.viewState,
          currentPageId: pageIdForNumber(state.pageGraph, pageNumber),
          currentPage: pageNumber,
        },
      };
    }),

  setPageById: (pageId) =>
    set((state) => {
      const pageNumber = pageNumberForId(state.pageGraph, pageId);
      if (pageNumber === null) return {};
      return {
        viewState: {
          ...state.viewState,
          currentPageId: pageId,
          currentPage: pageNumber,
        },
      };
    }),

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
    set((state) => {
      const selectedPages = validSelectedPages(pages, state.pageCount);
      return {
        selectedPageIds: pageIdsForNumbers(state.pageGraph, selectedPages),
        selectedPages,
      };
    }),

  setSelectedPageIds: (pageIds) =>
    set((state) => {
      if (!state.pageGraph) {
        return {
          selectedPageIds: Array.from(new Set(pageIds)),
          selectedPages: [],
        };
      }
      const selectedPageIds = normalizedPageIds(state.pageGraph, pageIds);
      return {
        selectedPageIds,
        selectedPages: pageNumbersForIds(state.pageGraph, selectedPageIds),
      };
    }),

  toggleSelectedPage: (page) =>
    set((state) => {
      if (!Number.isInteger(page) || page < 1 || page > state.pageCount) {
        return {};
      }
      const pageNumber = page;
      const pageId = pageIdForNumber(state.pageGraph, pageNumber);

      if (!pageId) {
        const exists = state.selectedPages.includes(pageNumber);
        return {
          selectedPageIds: [],
          selectedPages: exists
            ? state.selectedPages.filter((value) => value !== pageNumber)
            : uniqSorted([...state.selectedPages, pageNumber]),
        };
      }

      const exists = state.selectedPageIds.includes(pageId);
      const selectedPageIds = normalizedPageIds(
        state.pageGraph!,
        exists
          ? state.selectedPageIds.filter((value) => value !== pageId)
          : [...state.selectedPageIds, pageId],
      );
      return {
        selectedPageIds,
        selectedPages: pageNumbersForIds(state.pageGraph!, selectedPageIds),
      };
    }),

  clearSelectedPages: () => set({ selectedPageIds: [], selectedPages: [] }),

  clearDocument: () => {
    releaseDocumentSource(get().sourceId);
    releaseWorkingRevisionStore(
      get().revisionStoreId,
    );
    releaseHistoryJournalStore(
      get().historyJournalStoreId,
    );
    return set({
      documentKey: null,
      sourceId: null,
      revisionStoreId: null,
      originalRevisionId: null,
      activeRevisionId: null,
      historyJournalStoreId: null,
      historyJournalId: null,
      historyJournalPersistent: false,
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
      selectedPageIds: [],
      selectedPages: [],
      lastExportAction: undefined,
      lastOperation: undefined,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
  },

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
