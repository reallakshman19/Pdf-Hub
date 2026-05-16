import { describe, expect, it } from 'vitest';
import {
  addMacroStep,
  conditionalElsePath,
  conditionalThenPath,
  createEmptyMacroRecipe,
  createMacroRecipeBuilderState,
  duplicateMacroStep,
  exportBuilderRecipeJson,
  getMacroStepAtPath,
  getMacroStepSchemaAtPath,
  importBuilderRecipeJson,
  moveMacroStep,
  removeMacroStep,
  replaceMacroStep,
  rootStepPath,
  setRecipeIdentity,
  updateMacroStep,
  validateBuilderState,
} from './recipeBuilderState';
import type { MacroStep } from '../types';

describe('recipe builder state slice 7', () => {
  it('creates empty builder state', () => {
    const state = createMacroRecipeBuilderState(createEmptyMacroRecipe('r1', 'Recipe 1'));

    expect(state.recipe.id).toBe('r1');
    expect(state.recipe.name).toBe('Recipe 1');
    expect(state.recipe.steps).toEqual([]);
    expect(state.selectedPath).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it('sets recipe identity and validates state', () => {
    const state = createMacroRecipeBuilderState();
    const next = setRecipeIdentity(state, {
      id: 'updated',
      name: 'Updated',
      dryRun: true,
    });

    expect(next.recipe.id).toBe('updated');
    expect(next.recipe.name).toBe('Updated');
    expect(next.recipe.dryRun).toBe(true);
    expect(next.dirty).toBe(true);
  });

  it('adds default macro step from op schema', () => {
    const state = createMacroRecipeBuilderState();
    const next = addMacroStep(state, 'rotate_pages');

    expect(next.recipe.steps).toHaveLength(1);
    expect(next.recipe.steps[0]).toEqual({
      op: 'rotate_pages',
      selector: { mode: 'selected' },
      degrees: 90,
    });
    expect(next.selectedPath).toEqual(rootStepPath(0));
    expect(next.validation.valid).toBe(true);
  });

  it('updates macro step without changing op', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'rotate_pages');
    const next = updateMacroStep(state, rootStepPath(0), {
      op: 'remove_pages',
      degrees: 180,
    } as Partial<MacroStep>);

    expect(next.recipe.steps[0]).toEqual({
      op: 'rotate_pages',
      selector: { mode: 'selected' },
      degrees: 180,
    });
  });

  it('replaces macro step', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'rotate_pages');
    const next = replaceMacroStep(
      state,
      rootStepPath(0),
      {
        op: 'select_pages',
        selector: { mode: 'all' },
      },
    );

    expect(next.recipe.steps[0]).toEqual({
      op: 'select_pages',
      selector: { mode: 'all' },
    });
    expect(next.validation.valid).toBe(true);
  });

  it('duplicates macro step', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'select_pages');
    const next = duplicateMacroStep(state, rootStepPath(0));

    expect(next.recipe.steps).toHaveLength(2);
    expect(next.recipe.steps[0]).toEqual(next.recipe.steps[1]);
    expect(next.selectedPath).toEqual(rootStepPath(1));
  });

  it('moves macro step at root level', () => {
    let state = createMacroRecipeBuilderState();
    state = addMacroStep(state, 'select_pages');
    state = addMacroStep(state, 'rotate_pages');
    state = addMacroStep(state, 'extract_pages');

    const next = moveMacroStep(state, rootStepPath(2), rootStepPath(0));

    expect(next.recipe.steps.map((step) => step.op)).toEqual([
      'extract_pages',
      'select_pages',
      'rotate_pages',
    ]);
    expect(next.selectedPath).toEqual(rootStepPath(0));
  });

  it('removes macro step and selects nearest remaining step', () => {
    let state = createMacroRecipeBuilderState();
    state = addMacroStep(state, 'select_pages');
    state = addMacroStep(state, 'rotate_pages');

    const next = removeMacroStep(state, rootStepPath(0));

    expect(next.recipe.steps.map((step) => step.op)).toEqual(['rotate_pages']);
    expect(next.selectedPath).toEqual(rootStepPath(0));
  });

  it('removes final macro step and clears selection', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'select_pages');
    const next = removeMacroStep(state, rootStepPath(0));

    expect(next.recipe.steps).toEqual([]);
    expect(next.selectedPath).toBeNull();
  });

  it('adds nested step to conditional then branch', () => {
    let state = createMacroRecipeBuilderState();
    state = addMacroStep(state, 'conditional');
    state = addMacroStep(state, 'draw_text_on_pages', {
      target: {
        parentPath: [0],
        branch: 'then',
      },
    });

    const conditional = state.recipe.steps[0];

    expect(conditional.op).toBe('conditional');

    if (conditional.op === 'conditional') {
      expect(conditional.then).toHaveLength(2);
      expect(conditional.then[1].op).toBe('draw_text_on_pages');
    }

    expect(state.selectedPath).toEqual(conditionalThenPath(0, 1));
  });

  it('adds nested step to conditional else branch', () => {
    let state = createMacroRecipeBuilderState();
    state = addMacroStep(state, 'conditional');
    state = addMacroStep(state, 'select_pages', {
      target: {
        parentPath: [0],
        branch: 'else',
      },
    });

    const conditional = state.recipe.steps[0];

    expect(conditional.op).toBe('conditional');

    if (conditional.op === 'conditional') {
      expect(conditional.else).toHaveLength(1);
      expect(conditional.else?.[0].op).toBe('select_pages');
    }

    expect(state.selectedPath).toEqual(conditionalElsePath(0, 0));
  });

  it('gets step and schema at path', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'header_footer_text');
    const step = getMacroStepAtPath(state.recipe, rootStepPath(0));
    const schema = getMacroStepSchemaAtPath(state.recipe, rootStepPath(0));

    expect(step?.op).toBe('header_footer_text');
    expect(schema?.op).toBe('header_footer_text');
    expect(schema?.fields.some((field) => field.name === 'text')).toBe(true);
  });

  it('validates builder state after invalid update', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'draw_text_on_pages');
    const next = updateMacroStep(state, rootStepPath(0), {
      text: '',
      fontSize: 0,
    } as Partial<MacroStep>);
    const validated = validateBuilderState(next);

    expect(validated.validation.valid).toBe(false);
    expect(validated.validation.errors.some((error) => error.field.includes('text'))).toBe(true);
    expect(validated.validation.errors.some((error) => error.field.includes('fontSize'))).toBe(true);
  });

  it('exports and imports builder recipe JSON', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(
      createEmptyMacroRecipe('json-recipe', 'JSON Recipe'),
    ), 'select_pages');

    const json = exportBuilderRecipeJson(state);
    const imported = importBuilderRecipeJson(json);

    expect(imported.recipe).toEqual(state.recipe);
    expect(imported.validation.valid).toBe(true);
    expect(imported.lastError).toBeNull();
  });

  it('invalid import returns builder error state instead of throwing', () => {
    const imported = importBuilderRecipeJson('{bad');

    expect(imported.validation.valid).toBe(false);
    expect(imported.lastError).toMatch(/Invalid macro recipe JSON/);
  });

  it('does not mutate previous state when editing', () => {
    const state = addMacroStep(createMacroRecipeBuilderState(), 'select_pages');
    const next = updateMacroStep(state, rootStepPath(0), {
      selector: { mode: 'all' },
    } as Partial<MacroStep>);

    expect(state.recipe.steps[0]).toEqual({
      op: 'select_pages',
      selector: { mode: 'selected' },
    });

    expect(next.recipe.steps[0]).toEqual({
      op: 'select_pages',
      selector: { mode: 'all' },
    });
  });
});