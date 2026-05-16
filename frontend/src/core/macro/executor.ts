import './register-all';
import { macroRegistry } from './registry';
import type { MacroMutableState, StepResult } from './registry';
import { macroValidator } from './validator';
import { templateVarEngine } from './template-vars';
import type {
  MacroDryRunDiff,
  MacroRecipe,
  MacroExecutionContext,
} from './types';
import { simulateMacroDryRun } from './dry-run';
import {
  applyMacroSideEffects,
  beginMacroTransaction,
  buildMacroRollbackMessage,
  rollbackMacroTransaction,
} from './transaction';

export interface MacroExecutionResult {
  success: boolean;
  outputFiles: { name: string; bytes: Uint8Array }[];
  stepResults: StepResult[];
  validationErrors?: import('./validator').ValidationError[];
  finalBytes: Uint8Array;
  logs: string[];
  selectedPages: number[];
  rolledBack?: boolean;
  dryRunDiff?: MacroDryRunDiff;
}

export interface ExecutionProgress {
  current: number;
  total: number;
  currentOp: string;
}

export async function executeMacroRecipe(
  recipe: MacroRecipe,
  ctx: MacroExecutionContext,
  onProgress?: (progress: ExecutionProgress) => void,
): Promise<MacroExecutionResult> {
  const validation = macroValidator.validate(recipe);

  if (!validation.valid) {
    return {
      success: false,
      outputFiles: [],
      stepResults: [],
      validationErrors: validation.errors,
      finalBytes: ctx.workingBytes,
      logs: validation.errors.map((error) =>
        `[step ${error.stepIndex}] ${error.op}.${error.field}: ${error.message}`,
      ),
      selectedPages: ctx.selectedPages,
    };
  }

  if (recipe.dryRun === true) {
    const dryRunReport = await simulateMacroDryRun(recipe, {
      workingBytes: ctx.workingBytes,
      pageCount: ctx.pageCount,
      selectedPages: ctx.selectedPages,
      fileName: ctx.fileName,
    });

    return {
      success: dryRunReport.valid,
      outputFiles: [],
      stepResults: [],
      finalBytes: ctx.workingBytes,
      logs: dryRunReport.diff.logs,
      selectedPages: ctx.selectedPages,
      dryRunDiff: dryRunReport.diff,
    };
  }

  const defaultVars = templateVarEngine.buildDefaultVars({
    fileName: ctx.fileName,
    pageCount: ctx.pageCount,
    now: ctx.now,
  });

  const state: MacroMutableState = {
    workingBytes: ctx.workingBytes,
    pageCount: ctx.pageCount,
    selectedPages: ctx.selectedPages ?? [],
    templateVars: defaultVars,
    logs: [],
    outputFiles: [],
  };

  const stepResults: StepResult[] = [];
  const snapshot = beginMacroTransaction(state);
  let rolledBack = false;

  for (let index = 0; index < recipe.steps.length; index += 1) {
    const rawStep = recipe.steps[index];
    const step = templateVarEngine.expandStep(rawStep, state.templateVars);

    onProgress?.({
      current: index + 1,
      total: recipe.steps.length,
      currentOp: step.op,
    });

    const result = await macroRegistry.execute(step, ctx, state);
    stepResults.push(result);

    applyMacroSideEffects(result.sideEffects, state);

    if (result.message) {
      state.logs.push(`[step ${index + 1}/${recipe.steps.length}] ${step.op}: ${result.message}`);
    }

    if (result.status === 'error' && ctx.options?.abortOnError !== false) {
      rollbackMacroTransaction(state, snapshot);
      rolledBack = true;
      state.logs.push(buildMacroRollbackMessage(ctx, index, step.op, result.message));
      break;
    }
  }

  return {
    success: !rolledBack && stepResults.every((result) => result.status !== 'error'),
    outputFiles: state.outputFiles,
    stepResults,
    finalBytes: state.workingBytes,
    logs: state.logs,
    selectedPages: state.selectedPages,
    rolledBack,
  };
}