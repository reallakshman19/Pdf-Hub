// @ts-nocheck
import type {
  MacroExecutionContext,

  MacroRecipe,
} from './types';
import {
  macroRegistry,
  type MacroMutableState,
  type StepResult,
} from './registry';
import {
  templateVarEngine,
} from './template-vars';
import {
  beginMacroTransaction,
  rollbackMacroTransaction,
} from './transaction';
import {
  simulateMacroDryRun,
} from './dry-run';
import {
  applySideEffectToState,
} from './side-effects';
import './register-all';

export interface MacroExecutionResultOld {
  success: boolean;
  finalBytes: Uint8Array;
  outputFiles: Array<{ name: string; bytes: Uint8Array }>;
  selectedPages: number[];
  stepResults: StepResult[];
  logs: string[];
}

export interface ExecuteMacroRecipeOptions {
  onProgress?: (progress: any) => void;
}

export async function executeMacroRecipe(
  recipe: MacroRecipe,
  ctx: MacroExecutionContext,
  options: ExecuteMacroRecipeOptions = {},
): Promise<MacroExecutionResult> {
  if (recipe.dryRun) {
    return simulateMacroDryRun(recipe, ctx);
  }

  const state: MacroMutableState = {
    workingBytes: new Uint8Array(ctx.workingBytes),
    pageCount: ctx.pageCount,
    selectedPages: [...ctx.selectedPages],
    outputFiles: [],
    logs: [],
    templateVars: templateVarEngine.buildDefaultVars(ctx),
  };

  const stepResults: StepResult[] = [];
  const transaction = beginMacroTransaction(state);
  let abortedWithError = false;

  for (let i = 0; i < recipe.steps.length; i += 1) {
    const rawStep = recipe.steps[i];

    const step =
      rawStep.op === 'apply_template_vars'
        ? rawStep
        : (templateVarEngine as any).expandStep(rawStep, state.templateVars);

    options.onProgress?.({
      current: i + 1,
      total: recipe.steps.length,
      currentOp: step.op,
    });

    const result = await macroRegistry.execute(step, ctx, state);
    stepResults.push(result);

    for (const effect of result.sideEffects) {
      applySideEffectToState(state, effect);
    }

    if (result.message) {
      state.logs.push(`[step ${i + 1}/${recipe.steps.length}] ${step.op}: ${result.message}`);
    }

    if (result.status === 'error' && ctx.options?.abortOnError !== false) {
      abortedWithError = true;
      rollbackMacroTransaction(state, transaction);
      break;
    }
  }

  const success =
    !abortedWithError &&
    stepResults.length === recipe.steps.length &&
    stepResults.every((result) => result.status !== 'error');

  return {
    success,
    finalBytes: state.workingBytes,
    outputFiles: state.outputFiles,
    selectedPages: state.selectedPages,
    stepResults,
    logs: state.logs,
  };
}

export {
  applySideEffectToState,
} from './side-effects';
