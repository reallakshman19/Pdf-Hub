import { create } from 'zustand';
import type { MacroRecipe } from '../types';
import {
  deleteCustomMacroRecipe,
  loadCustomMacroRecipes,
  subscribeCustomMacroRecipeChanges,
  updateCustomMacroRecipe,
  upsertCustomMacroRecipe,
} from '../recipes/recipeStorage';

export interface PresetsStore {
  savedPresets: MacroRecipe[];
  loadPresets: () => void;
  savePreset: (recipe: MacroRecipe) => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<MacroRecipe>) => void;
}

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

function cloneRecipeList(recipes: MacroRecipe[]): MacroRecipe[] {
  return recipes.map((recipe) => cloneRecipe(recipe));
}

export const usePresetsStore = create<PresetsStore>((set) => ({
  savedPresets: cloneRecipeList(loadCustomMacroRecipes()),

  loadPresets: () => {
    set({
      savedPresets: cloneRecipeList(loadCustomMacroRecipes()),
    });
  },

  savePreset: (recipe) => {
    const next = upsertCustomMacroRecipe(cloneRecipe(recipe));

    set({
      savedPresets: cloneRecipeList(next),
    });
  },

  deletePreset: (id) => {
    const next = deleteCustomMacroRecipe(id);

    set({
      savedPresets: cloneRecipeList(next),
    });
  },

  updatePreset: (id, updates) => {
    const next = updateCustomMacroRecipe(id, updates);

    set({
      savedPresets: cloneRecipeList(next),
    });
  },
}));

let unsubscribeStorageBridge: (() => void) | null = null;

export function startPresetStorageBridge(): () => void {
  if (unsubscribeStorageBridge) {
    return unsubscribeStorageBridge;
  }

  unsubscribeStorageBridge = subscribeCustomMacroRecipeChanges((recipes) => {
    usePresetsStore.setState({
      savedPresets: cloneRecipeList(recipes),
    });
  });

  return () => {
    unsubscribeStorageBridge?.();
    unsubscribeStorageBridge = null;
  };
}

startPresetStorageBridge();