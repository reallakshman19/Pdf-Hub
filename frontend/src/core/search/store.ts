import { create } from 'zustand';
import {
  EMPTY_SEARCH_INDEX_PROGRESS,
  type SearchHit,
  type SearchIndexProgress,
  type SearchState,
} from './types';

export interface SearchActions {
  setQuery: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  setHits: (hits: SearchHit[]) => void;
  setActiveHit: (id: string | null) => void;
  setActiveHitByIndex: (index: number) => SearchHit | null;
  setError: (error: string | null) => void;
  setIndexProgress: (progress: SearchIndexProgress) => void;
  clearSearch: () => void;
  nextHit: () => SearchHit | null;
  prevHit: () => SearchHit | null;
  setOverlayVisible: (visible: boolean) => void;
  toggleOverlayVisible: () => void;
}

export function selectActiveHitProgress(state: SearchState): { index: number; count: number } {
  if (state.hits.length === 0) {
    return { index: 0, count: 0 };
  }
  const currentIndex = state.activeHitId
    ? state.hits.findIndex((h) => h.id === state.activeHitId)
    : -1;
  return {
    index: currentIndex >= 0 ? currentIndex + 1 : 0,
    count: state.hits.length,
  };
}

export function selectActiveHit(state: SearchState): SearchHit | null {
  if (!state.activeHitId || state.hits.length === 0) return null;
  return state.hits.find((h) => h.id === state.activeHitId) ?? null;
}

export const useSearchStore = create<SearchState & SearchActions>((set) => ({
  query: '',
  isSearching: false,
  hits: [],
  activeHitId: null,
  error: null,
  isOverlayVisible: true,
  indexProgress: {
    ...EMPTY_SEARCH_INDEX_PROGRESS,
  },

  setQuery: (query) =>
    set((state) => {
      if (state.query === query) return state;
      return { query, hits: [], activeHitId: null, error: null, isOverlayVisible: true };
    }),

  setIsSearching: (isSearching) => set({ isSearching }),

  setHits: (hits) =>
    set((state) => {
      // If we already have hits and we get new hits for a same query, we just replace them.
      // But if we want to keep the active hit if it still exists in the new hits list
      const activeHitExists = state.activeHitId ? hits.some(h => h.id === state.activeHitId) : false;
      return {
        hits,
        error: null,
        activeHitId: activeHitExists ? state.activeHitId : (hits.length > 0 ? hits[0].id : null),
      };
    }),

  setActiveHit: (id) => set({ activeHitId: id }),

  setActiveHitByIndex: (index) => {
    let targetHit: SearchHit | null = null;
    set((state) => {
      if (state.hits.length === 0) return state;
      const zeroBasedIndex = Math.max(0, Math.min(index - 1, state.hits.length - 1));
      targetHit = state.hits[zeroBasedIndex] ?? null;
      return { activeHitId: targetHit ? targetHit.id : null };
    });
    return targetHit;
  },

  setError: (error) => set({ error }),
  setIndexProgress: (indexProgress) =>
    set({ indexProgress: { ...indexProgress } }),

  setOverlayVisible: (isOverlayVisible) => set({ isOverlayVisible }),
  toggleOverlayVisible: () =>
    set((state) => ({ isOverlayVisible: !state.isOverlayVisible })),

  clearSearch: () => set({
    query: '',
    hits: [],
    activeHitId: null,
    isSearching: false,
    error: null,
    isOverlayVisible: true,
  }),

  nextHit: () => {
    let nextHitItem: SearchHit | null = null;
    set((state) => {
      if (state.hits.length === 0) return state;
      const currentIndex = state.hits.findIndex((h) => h.id === state.activeHitId);
      const nextIndex = currentIndex === -1 || currentIndex === state.hits.length - 1 ? 0 : currentIndex + 1;
      nextHitItem = state.hits[nextIndex] ?? null;
      return { activeHitId: nextHitItem ? nextHitItem.id : null };
    });
    return nextHitItem;
  },

  prevHit: () => {
    let prevHitItem: SearchHit | null = null;
    set((state) => {
      if (state.hits.length === 0) return state;
      const currentIndex = state.hits.findIndex((h) => h.id === state.activeHitId);
      const prevIndex = currentIndex === -1 || currentIndex === 0 ? state.hits.length - 1 : currentIndex - 1;
      prevHitItem = state.hits[prevIndex] ?? null;
      return { activeHitId: prevHitItem ? prevHitItem.id : null };
    });
    return prevHitItem;
  },
}));
