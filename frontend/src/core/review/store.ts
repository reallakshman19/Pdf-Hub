import { create } from 'zustand';

export interface ReviewState {
  hideResolved: boolean;
  filterStatus: 'all' | 'open' | 'resolved' | 'rejected';
}

export interface ReviewActions {
  setHideResolved: (hide: boolean) => void;
  setFilterStatus: (status: 'all' | 'open' | 'resolved' | 'rejected') => void;
}

export const useReviewStore = create<ReviewState & ReviewActions>((set) => ({
  hideResolved: false,
  filterStatus: 'all',
  setHideResolved: (hideResolved) => set({ hideResolved }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),
}));
