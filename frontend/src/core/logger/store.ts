import { create } from 'zustand';
import type { AppLogEntry } from './types';

export interface LoggerState {
  entries: AppLogEntry[];
}

export interface LoggerActions {
  addEntry: (entry: AppLogEntry) => void;
  clear: () => void;
}

const MAX_LOG_ENTRIES = 500;

export const useLoggerStore = create<LoggerState & LoggerActions>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((state) => {
      const newEntries = [entry, ...state.entries];
      if (newEntries.length > MAX_LOG_ENTRIES) {
        newEntries.length = MAX_LOG_ENTRIES;
      }
      
      if (import.meta.env?.DEV) {
        try {
          sessionStorage.setItem('doccraft_logs', JSON.stringify(newEntries));
        } catch {
          // ignore sessionStorage errors
        }
      }
      
      return { entries: newEntries };
    }),
  clear: () => set({ entries: [] }),
}));
