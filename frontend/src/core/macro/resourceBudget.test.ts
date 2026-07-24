import { describe, expect, it } from 'vitest';
import { executeMacroRecipe } from './executor';
import type { MacroExecutionContext, MacroRecipe } from './types';
import {
  assertMacroInputResources,
  inspectMacroRecipeBudget,
  MacroExecutionBudget,
  MacroResourceLimitError,
  parseMacroRecipeJson,
} from './resourceBudget';

const baseContext: MacroExecutionContext = {
  workingBytes: new Uint8Array([1, 2, 3]),
  pageCount: 1,
  selectedPages: [],
  currentPage: 1,
  fileName: 'budget.pdf',
  donorFiles: {},
};

describe('macro resource budgets', () => {
  it('rejects raw recipe JSON before parsing when the byte cap is exceeded', () => {
    const raw = JSON.stringify({ id: 'large', name: 'x'.repeat(200), steps: [] });

    expect(() => parseMacroRecipeJson(raw, { maxRecipeJsonBytes: 64 }))
      .toThrow(/limit is 64 bytes/i);
  });

  it('counts nested conditional steps and rejects excessive conditional depth', () => {
    const recipe: MacroRecipe = {
      id: 'nested',
      name: 'Nested',
      steps: [{
        op: 'conditional',
        condition: { type: 'page_count_gt', value: 0 },
        then: [{
          op: 'conditional',
          condition: { type: 'page_count_gt', value: 0 },
          then: [{ op: 'apply_template_vars', vars: { ok: 'yes' } }],
        }],
      }],
    };

    expect(inspectMacroRecipeBudget(recipe).steps).toBe(3);
    expect(() => inspectMacroRecipeBudget(recipe, { maxConditionalDepth: 1 }))
      .toThrow(/conditional nesting exceeds 1/i);
    expect(() => inspectMacroRecipeBudget(recipe, { maxRecipeSteps: 2 }))
      .toThrow(/more than 2 total steps/i);
  });

  it('rejects oversized input PDFs and aggregate donor bytes', () => {
    expect(() => assertMacroInputResources(
      new Uint8Array(5),
      {},
      { maxInputPdfBytes: 4 },
    )).toThrow(/input pdf is 5 bytes/i);

    expect(() => assertMacroInputResources(
      new Uint8Array(1),
      { a: new Uint8Array(3), b: new Uint8Array(3) },
      { maxDonorBytes: 5 },
    )).toThrow(/donor pdfs total 6 bytes/i);
  });

  it('shares the executed-step budget with nested conditional branches', async () => {
    const recipe: MacroRecipe = {
      id: 'runtime-nested',
      name: 'Runtime nested',
      steps: [{
        op: 'conditional',
        condition: { type: 'page_count_gt', value: 0 },
        then: [
          { op: 'apply_template_vars', vars: { first: '1' } },
          { op: 'apply_template_vars', vars: { second: '2' } },
        ],
      }],
    };

    const result = await executeMacroRecipe(recipe, {
      ...baseContext,
      options: {
        resourceLimits: {
          maxRecipeSteps: 10,
          maxExecutedSteps: 2,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.stepResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'error' }),
    ]));
    expect(result.logs.join('\n')).toMatch(/more than 2 steps|executed more than 2 steps/i);
  });

  it('checks predicted output side effects before they are committed', () => {
    const budget = new MacroExecutionBudget({ maxOutputFiles: 1, maxOutputBytes: 4 });
    const state = {
      workingBytes: new Uint8Array([1]),
      pageCount: 1,
      selectedPages: [],
      templateVars: {},
      logs: [],
      outputFiles: [],
    };

    expect(() => budget.afterStep(state, [
      { type: 'output_file', name: 'a.pdf', bytes: new Uint8Array(5) },
    ])).toThrow(MacroResourceLimitError);
  });
});
