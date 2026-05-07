import { create } from 'zustand';
import type { SearchHit, SearchState } from './types';

export interface SearchActions {
  setQuery: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  setHits: (hits: SearchHit[]) => void;
  setActiveHit: (id: string | null) => void;
  setError: (error: string | null) => void;
  clearSearch: () => void;
  nextHit: () => void;
  prevHit: () => void;
}

export const useSearchStore = create<SearchState & SearchActions>((set) => ({
  query: '',
  isSearching: false,
  hits: [],
  activeHitId: null,
  error: null,

  setQuery: (query) =>
    set((state) => {
      if (state.query === query) return state;
      return { query, hits: [], activeHitId: null, error: null };
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
  setError: (error) => set({ error }),

  clearSearch: () => set({ query: '', hits: [], activeHitId: null, isSearching: false, error: null }),

  nextHit: () =>
    set((state) => {
      if (state.hits.length === 0) return state;
      const currentIndex = state.hits.findIndex((h) => h.id === state.activeHitId);
      const nextIndex = currentIndex === -1 || currentIndex === state.hits.length - 1 ? 0 : currentIndex + 1;
      return { activeHitId: state.hits[nextIndex].id };
    }),

  prevHit: () =>
    set((state) => {
      if (state.hits.length === 0) return state;
      const currentIndex = state.hits.findIndex((h) => h.id === state.activeHitId);
      const prevIndex = currentIndex === -1 || currentIndex === 0 ? state.hits.length - 1 : currentIndex - 1;
      return { activeHitId: state.hits[prevIndex].id };
    }),
}));
