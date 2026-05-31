import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_MACRO_RECIPE_STORAGE_KEY,
  deleteCustomMacroRecipe,
  exportMacroRecipeJson,
  importMacroRecipeJson,
  loadCustomMacroRecipes,
  saveCustomMacroRecipes,
  upsertCustomMacroRecipe,
} from './recipeStorage';
import type { MacroRecipe } from '../types';

const validRecipe: MacroRecipe = {
  id: 'custom-review',
  name: 'Custom Review',
  steps: [
    {
      op: 'select_pages',
      selector: {
        mode: 'current',
      },
    },
  ],
};

describe('custom macro recipe storage slice 6', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads empty list when storage is empty', () => {
    expect(loadCustomMacroRecipes()).toEqual([]);
  });

  it('saves and loads valid recipes', () => {
    saveCustomMacroRecipes([validRecipe]);

    expect(loadCustomMacroRecipes()).toEqual([validRecipe]);
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('custom-review');
  });

  it('upserts recipe by id', () => {
    upsertCustomMacroRecipe(validRecipe);
    upsertCustomMacroRecipe({
      ...validRecipe,
      name: 'Updated Custom Review',
    });

    expect(loadCustomMacroRecipes()).toHaveLength(1);
    expect(loadCustomMacroRecipes()[0].name).toBe('Updated Custom Review');
  });

  it('deletes recipe by id', () => {
    upsertCustomMacroRecipe(validRecipe);

    expect(loadCustomMacroRecipes()).toHaveLength(1);

    deleteCustomMacroRecipe(validRecipe.id);

    expect(loadCustomMacroRecipes()).toEqual([]);
  });

  it('exports and imports valid recipe JSON', () => {
    const json = exportMacroRecipeJson(validRecipe);
    const imported = importMacroRecipeJson(json);

    expect(imported).toEqual(validRecipe);
  });

  it('rejects invalid JSON import', () => {
    expect(() => importMacroRecipeJson('{bad')).toThrow(/Invalid macro recipe JSON/);
  });

  it('rejects invalid recipe import', () => {
    expect(() =>
      importMacroRecipeJson(JSON.stringify({
        id: 'bad',
        name: '',
        steps: [],
      })),
    ).toThrow(/Macro recipe is invalid/);
  });

  it('ignores invalid records already in localStorage', () => {
    localStorage.setItem(
      CUSTOM_MACRO_RECIPE_STORAGE_KEY,
      JSON.stringify([
        {
          recipe: validRecipe,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          recipe: {
            id: 'bad',
            name: '',
            steps: [],
          },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    expect(loadCustomMacroRecipes()).toEqual([validRecipe]);
  });

  it('rejects duplicate ids when saving list', () => {
    expect(() => saveCustomMacroRecipes([validRecipe, validRecipe])).toThrow(/Duplicate/);
  });
});