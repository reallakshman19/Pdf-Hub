import { create } from 'zustand';

export interface ThumbnailRevisionState {
  pageRevisions: Record<number, number>;
  globalRevision: number;
}

export interface ThumbnailRevisionActions {
  bumpPageRevision: (pageNumber: number) => void;
  bumpAllPageRevisions: () => void;
  resetRevisions: () => void;
  getPageRevision: (pageNumber: number) => number;
}

export const useThumbnailRevisionStore = create<
  ThumbnailRevisionState & ThumbnailRevisionActions
>((set, get) => ({
  pageRevisions: {},
  globalRevision: 0,

  bumpPageRevision: (pageNumber: number) =>
    set((state) => {
      const current = state.pageRevisions[pageNumber] ?? 0;
      return {
        pageRevisions: {
          ...state.pageRevisions,
          [pageNumber]: current + 1,
        },
        globalRevision: state.globalRevision + 1,
      };
    }),

  bumpAllPageRevisions: () =>
    set((state) => ({
      globalRevision: state.globalRevision + 1,
    })),

  resetRevisions: () =>
    set({
      pageRevisions: {},
      globalRevision: 0,
    }),

  getPageRevision: (pageNumber: number) => {
    const state = get();
    return (state.pageRevisions[pageNumber] ?? 0) + state.globalRevision;
  },
}));
