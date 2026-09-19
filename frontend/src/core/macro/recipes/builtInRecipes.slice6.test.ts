import { describe, expect, it } from 'vitest';
import {
  findBuiltInMacroRecipe,
  getBuiltInMacroRecipes,
  getRecommendedMacroRecipes,
  isRunnerSafeBuiltInRecipe,
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

  it('classifies donor-bound recipes as unsafe for direct/batch runners', () => {
    const recipes = getBuiltInMacroRecipes();

    const merge = recipes.find((item) => item.id === 'merge-two-donors');
    const insert = recipes.find((item) => item.id === 'insert-donor-start');
    const replace = recipes.find((item) => item.id === 'replace-first-page');
    const review = recipes.find((item) => item.id === 'review-current-page');

    expect(merge && isRunnerSafeBuiltInRecipe(merge)).toBe(false);
    expect(insert && isRunnerSafeBuiltInRecipe(insert)).toBe(false);
    expect(replace && isRunnerSafeBuiltInRecipe(replace)).toBe(false);
    expect(review && isRunnerSafeBuiltInRecipe(review)).toBe(true);
  });

  it('recommended recipes are valid subset of built-ins', () => {
    const builtInIds = new Set(getBuiltInMacroRecipes().map((item) => item.id));

    for (const item of getRecommendedMacroRecipes()) {
      expect(builtInIds.has(item.id)).toBe(true);
      expect(macroValidator.validate(item.recipe).valid).toBe(true);
    }
  });

  it('hides legacy header/footer recipes from discovery but keeps explicit compatibility lookup', () => {
    const ids = new Set(getBuiltInMacroRecipes().map((item) => item.id));

    for (const id of [
      'footer-page-numbers',
      'header-file-name',
      'header-file-name-selected',
      'file-date-page-footer-selected',
      'review-pack-header-footer',
      'bates-numbering',
      'date-stamp-footer',
      'confidential-review-pack',
    ]) {
      expect(ids.has(id), id).toBe(false);
      expect(findBuiltInMacroRecipe(id), id).not.toBeNull();
    }

    expect(ids.has('review-copy-selected')).toBe(true);
    expect(ids.has('insert-blank-after-current')).toBe(true);

    const legacyFooter = findBuiltInMacroRecipe('footer-page-numbers');
    expect(legacyFooter?.requiredOps).toContain('header_footer_text');
    expect(legacyFooter?.recipe.steps[0]).toMatchObject({
      op: 'header_footer_text',
    });
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