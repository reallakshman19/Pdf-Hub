import { create } from 'zustand';
import type { MacroRecipe } from '../types';

export interface PresetsStore {
  savedPresets: MacroRecipe[];
  savePreset: (recipe: MacroRecipe) => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<MacroRecipe>) => void;
}

export const usePresetsStore = create<PresetsStore>((set) => ({
  savedPresets: [],

  savePreset: (recipe) => set((state) => ({
    savedPresets: [...state.savedPresets, { ...recipe, id: `custom_${Date.now()}` }]
  })),

  deletePreset: (id) => set((state) => ({
    savedPresets: state.savedPresets.filter(p => p.id !== id)
  })),

  updatePreset: (id, updates) => set((state) => ({
    savedPresets: state.savedPresets.map(p =>
      p.id === id ? { ...p, ...updates } : p
    )
  })),
}));
