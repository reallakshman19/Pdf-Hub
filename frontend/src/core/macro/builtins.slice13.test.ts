import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MACROS,
  getRunnerBuiltInMacros,
  isRunnerSafeBuiltInRecipe,
} from './builtins';
import { getBuiltInMacroRecipes } from './recipes/builtInRecipes';
import { macroValidator } from './validator';

describe('runner built-in macro catalog slice 13', () => {
  it('preserves legacy runner recipe ids', () => {
    expect(BUILTIN_MACROS.rotate_selected_90).toBeDefined();
    expect(BUILTIN_MACROS.extract_selected).toBeDefined();
    expect(BUILTIN_MACROS.split_selected).toBeDefined();
    expect(BUILTIN_MACROS.add_page_numbers_footer).toBeDefined();
    expect(BUILTIN_MACROS.insert_blank_after_current).toBeDefined();
  });

  it('adds enhanced runner-safe built-ins from recipe catalog', () => {
    expect(BUILTIN_MACROS['review-current-page']).toBeDefined();
    expect(BUILTIN_MACROS['footer-page-numbers']).toBeDefined();
    expect(BUILTIN_MACROS['place-revision-table']).toBeDefined();
    expect(BUILTIN_MACROS['conditional-ifc-stamp']).toBeDefined();
  });

  it('excludes donor-bound enhanced recipes from runner dropdown catalog', () => {
    expect(BUILTIN_MACROS['merge-two-donors']).toBeUndefined();
    expect(BUILTIN_MACROS['insert-donor-start']).toBeUndefined();
    expect(BUILTIN_MACROS['replace-first-page']).toBeUndefined();
  });

  it('runner-safe predicate rejects donor-bound recipes', () => {
    const donorRecipes = getBuiltInMacroRecipes().filter((item) =>
      item.requiredOps.some((op) =>
        op === 'merge_files' ||
        op === 'insert_pdf' ||
        op === 'replace_page',
      ),
    );

    expect(donorRecipes.length).toBeGreaterThan(0);

    for (const item of donorRecipes) {
      expect(isRunnerSafeBuiltInRecipe(item)).toBe(false);
    }
  });

  it('all runner built-ins validate', () => {
    for (const [id, recipe] of Object.entries(BUILTIN_MACROS)) {
      const result = macroValidator.validate(recipe);

      expect(result.valid, `${id}: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });

  it('returns cloned runner catalog so callers cannot mutate source recipes', () => {
    const first = getRunnerBuiltInMacros();
    const second = getRunnerBuiltInMacros();

    first.rotate_selected_90.name = 'Mutated';

    expect(second.rotate_selected_90.name).toBe('Rotate selected pages 90°');
  });

  it('catalog contains more than legacy-only count', () => {
    expect(Object.keys(BUILTIN_MACROS).length).toBeGreaterThan(9);
  });
});