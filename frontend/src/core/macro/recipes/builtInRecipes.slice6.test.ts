import { describe, expect, it } from 'vitest';
import {
  findBuiltInMacroRecipe,
  getBuiltInMacroRecipes,
  getRecommendedMacroRecipes,
} from './builtInRecipes';
import { macroValidator } from '../validator';

describe('built-in macro recipes slice 6', () => {
  it('contains at least 20 built-in recipes', () => {
    expect(getBuiltInMacroRecipes().length).toBeGreaterThanOrEqual(20);
  });

  it('has unique recipe ids', () => {
    const recipes = getBuiltInMacroRecipes();
    const ids = recipes.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all built-in recipes validate', () => {
    for (const item of getBuiltInMacroRecipes()) {
      const result = macroValidator.validate(item.recipe);

      expect(result.valid, `${item.id}: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });

  it('recommended recipes are valid subset of built-ins', () => {
    const builtInIds = new Set(getBuiltInMacroRecipes().map((item) => item.id));

    for (const item of getRecommendedMacroRecipes()) {
      expect(builtInIds.has(item.id)).toBe(true);
      expect(macroValidator.validate(item.recipe).valid).toBe(true);
    }
  });

  it('preserves legacy-only convenience workflows in the standard catalog', () => {
    const ids = new Set(getBuiltInMacroRecipes().map((item) => item.id));

    for (const id of [
      'header-file-name-selected',
      'file-date-page-footer-selected',
      'review-copy-selected',
      'review-pack-header-footer',
      'insert-blank-after-current',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('findBuiltInMacroRecipe returns cloned recipe', () => {
    const first = findBuiltInMacroRecipe('review-current-page');
    const second = findBuiltInMacroRecipe('review-current-page');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);

    if (first && second) {
      first.recipe.name = 'Changed';
      expect(second.recipe.name).not.toBe('Changed');
    }
  });
});