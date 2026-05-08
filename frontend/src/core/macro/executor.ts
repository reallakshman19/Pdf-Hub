import { macroRegistry } from './registry';
import type { MacroMutableState, StepResult } from './registry';
import { macroValidator } from './validator';
import { templateVarEngine } from './template-vars';
import type { MacroDryRunDiff, MacroRecipe, MacroExecutionContext } from './types';
import { simulateMacroDryRun } from './dry-run';
import {
  applyMacroSideEffects,
  beginMacroTransaction,
  buildMacroRollbackMessage,
  rollbackMacroTransaction,
} from './transaction';

export interface MacroExecutionResult {
  success:           boolean;
  outputFiles:       { name: string; bytes: Uint8Array }[];
  stepResults:       StepResult[];
  validationErrors?: import('./validator').ValidationError[];
  finalBytes:        Uint8Array;
  logs:              string[];
  selectedPages:     number[];
  rolledBack?:       boolean;
  dryRunDiff?:       MacroDryRunDiff;
}

export interface ExecutionProgress {
  current:   number;
  total:     number;
  currentOp: string;
}

export async function executeMacroRecipe(
  recipe: MacroRecipe,
  ctx: MacroExecutionContext,
  onProgress?: (progress: ExecutionProgress) => void,
): Promise<MacroExecutionResult> {
  // 1. Validate before touching the PDF
  const validation = macroValidator.validate(recipe);
  if (!validation.valid) {
    return {
      success: false,
      outputFiles: [],
      stepResults: [],
      validationErrors: validation.errors,
      finalBytes: ctx.workingBytes,
      logs: validation.errors.map(e => `[step ${e.stepIndex}] ${e.op}.${e.field}: ${e.message}`),
      selectedPages: ctx.selectedPages,
    };
  }

  // 2. Dry-run short-circuit — simulate without mutating bytes
  if (recipe.dryRun === true) {
    const dryRunReport = await simulateMacroDryRun(recipe, {
      workingBytes:  ctx.workingBytes,
      pageCount:     ctx.pageCount,
      selectedPages: ctx.selectedPages,
      fileName:      ctx.fileName,
    });
    return {
      success:       dryRunReport.valid,
      outputFiles:   [],
      stepResults:   [],
      finalBytes:    ctx.workingBytes,
      logs:          dryRunReport.diff.logs,
      selectedPages: ctx.selectedPages,
      dryRunDiff:    dryRunReport.diff,
    };
  }

  // 3. Expand template variables once before the loop
  const defaultVars = templateVarEngine.buildDefaultVars({ fileName: ctx.fileName, pageCount: ctx.pageCount });
  const expandedRecipe = templateVarEngine.expandRecipe(recipe, defaultVars);

  // 4. Build mutable state
  const state: MacroMutableState = {
    workingBytes:  ctx.workingBytes,
    pageCount:     ctx.pageCount,
    selectedPages: ctx.selectedPages ?? [],
    templateVars:  defaultVars,
    logs:          [],
    outputFiles:   [],
  };

  const stepResults: StepResult[] = [];
  const snapshot = beginMacroTransaction(state);
  let rolledBack = false;

  // 5. Execute via registry — no step logic here
  for (let i = 0; i < expandedRecipe.steps.length; i++) {
    const step = expandedRecipe.steps[i];
    onProgress?.({ current: i + 1, total: expandedRecipe.steps.length, currentOp: step.op });

    const result = await macroRegistry.execute(step, ctx, state);
    stepResults.push(result);

    applyMacroSideEffects(result.sideEffects, state);

    if (result.message) state.logs.push(`[step ${i+1}/${expandedRecipe.steps.length}] ${step.op}: ${result.message}`);
    if (result.status === 'error' && ctx.options?.abortOnError !== false) {
      rollbackMacroTransaction(state, snapshot);
      rolledBack = true;
      state.logs.push(buildMacroRollbackMessage(ctx, i, step.op, result.message));
      break;
    }
  }

  return {
    success:       !rolledBack && stepResults.every(r => r.status !== 'error'),
    outputFiles:   state.outputFiles,
    stepResults,
    finalBytes:    state.workingBytes,
    logs:          state.logs,
    selectedPages: state.selectedPages,
    rolledBack,
  };
}
