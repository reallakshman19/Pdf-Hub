import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_MACRO_RECIPE_STORAGE_KEY,
  upsertCustomMacroRecipe,
} from '../recipes/recipeStorage';
import {
  startPresetStorageBridge,
  usePresetsStore,
} from './presets';
import type { MacroRecipe } from '../types';

const recipeA: MacroRecipe = {
  id: 'custom-a',
  name: 'Custom A',
  steps: [
    {
      op: 'select_pages',
      selector: {
        mode: 'current',
      },
    },
  ],
};

const recipeB: MacroRecipe = {
  id: 'custom-b',
  name: 'Custom B',
  steps: [
    {
      op: 'select_pages',
      selector: {
        mode: 'all',
      },
    },
  ],
};

describe('preset storage bridge slice 12', () => {
  beforeEach(() => {
    localStorage.clear();
    usePresetsStore.setState({
      savedPresets: [],
    });
  });

  it('loads custom recipes from recipeStorage into preset store', () => {
    localStorage.setItem(
      CUSTOM_MACRO_RECIPE_STORAGE_KEY,
      JSON.stringify([
        {
          recipe: recipeA,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    usePresetsStore.getState().loadPresets();

    expect(usePresetsStore.getState().savedPresets).toEqual([recipeA]);
  });

  it('savePreset writes through recipeStorage and preserves recipe id', () => {
    usePresetsStore.getState().savePreset(recipeA);

    expect(usePresetsStore.getState().savedPresets).toEqual([recipeA]);
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('custom-a');
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).not.toContain('custom_');
  });

  it('deletePreset removes recipe from store and localStorage', () => {
    usePresetsStore.getState().savePreset(recipeA);
    usePresetsStore.getState().deletePreset(recipeA.id);

    expect(usePresetsStore.getState().savedPresets).toEqual([]);
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).not.toContain('custom-a');
  });

  it('updatePreset writes through recipeStorage', () => {
    usePresetsStore.getState().savePreset(recipeA);
    usePresetsStore.getState().updatePreset(recipeA.id, {
      name: 'Custom A Updated',
    });

    expect(usePresetsStore.getState().savedPresets[0].name).toBe('Custom A Updated');
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('Custom A Updated');
  });

  it('same-tab recipeStorage update synchronizes preset store through bridge', () => {
    startPresetStorageBridge();

    upsertCustomMacroRecipe(recipeB);

    expect(usePresetsStore.getState().savedPresets).toEqual([recipeB]);
  });

  it('does not expose mutable recipe references', () => {
    usePresetsStore.getState().savePreset(recipeA);

    const saved = usePresetsStore.getState().savedPresets[0];
    saved.name = 'Mutated Outside';

    usePresetsStore.getState().loadPresets();

    expect(usePresetsStore.getState().savedPresets[0].name).toBe('Custom A');
  });
});