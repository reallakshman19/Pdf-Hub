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
import {
  assertMacroInputResources,
  inspectMacroRecipeBudget,
  MacroExecutionBudget,
  MacroResourceLimitError,
} from './resourceBudget';
import {
  isOperationCancelledError,
  OperationCancelledError,
} from '@/core/cancellation/operationCancellation';

export type MacroExecutionStatus = 'success' | 'failed' | 'cancelled' | 'timed-out';

export interface MacroExecutionResult {
  status: MacroExecutionStatus;
  success: boolean;
  outputFiles: { name: string; bytes: Uint8Array }[];
  stepResults: StepResult[];
  validationErrors?: import('./validator').ValidationError[];
  finalBytes: Uint8Array;
  logs: string[];
  selectedPages: number[];
  rolledBack?: boolean;
  cancelled?: boolean;
  timedOut?: boolean;
  dryRunDiff?: MacroDryRunDiff;
}

export interface ExecutionProgress {
  current: number;
  total: number;
  currentOp: string;
}

function failedBeforeExecution(
  ctx: MacroExecutionContext,
  error: MacroResourceLimitError,
): MacroExecutionResult {
  const timedOut = error.code === 'MACRO_EXECUTION_TIMEOUT';
  return {
    status: timedOut ? 'timed-out' : 'failed',
    success: false,
    outputFiles: [],
    stepResults: [{ status: 'error', message: error.message, sideEffects: [] }],
    finalBytes: ctx.workingBytes,
    logs: [`[resource-limit:${error.code}] ${error.message}`],
    selectedPages: ctx.selectedPages,
    timedOut,
  };
}

function cancelledBeforeExecution(
  ctx: MacroExecutionContext,
  error: OperationCancelledError,
): MacroExecutionResult {
  return {
    status: 'cancelled',
    success: false,
    outputFiles: [],
    stepResults: [{ status: 'error', message: error.message, sideEffects: [] }],
    finalBytes: ctx.workingBytes,
    logs: [`[cancelled] ${error.message}`],
    selectedPages: ctx.selectedPages,
    cancelled: true,
    rolledBack: true,
  };
}

export async function executeMacroRecipe(
  recipe: MacroRecipe,
  ctx: MacroExecutionContext,
  onProgress?: (progress: ExecutionProgress) => void,
): Promise<MacroExecutionResult> {
  const resourceLimits = ctx.options?.resourceLimits;
  let budget: MacroExecutionBudget;

  try {
    inspectMacroRecipeBudget(recipe, resourceLimits);
    assertMacroInputResources(ctx.workingBytes, ctx.donorFiles ?? {}, resourceLimits);
    budget = new MacroExecutionBudget(resourceLimits, ctx.options?.abortSignal);
    budget.checkpoint('macro start');
  } catch (error) {
    if (isOperationCancelledError(error)) return cancelledBeforeExecution(ctx, error);
    if (error instanceof MacroResourceLimitError) return failedBeforeExecution(ctx, error);
    throw error;
  }

  const validation = macroValidator.validate(recipe);

  if (!validation.valid) {
    return {
      status: 'failed',
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

  const runtimeContext: MacroExecutionContext = {
    ...ctx,
    options: {
      ...ctx.options,
      __runtimeBudget: budget,
    },
  };

  if (recipe.dryRun === true) {
    try {
      const dryRunReport = await budget.run(
        simulateMacroDryRun(recipe, {
          workingBytes: ctx.workingBytes,
          pageCount: ctx.pageCount,
          selectedPages: ctx.selectedPages,
          fileName: ctx.fileName,
        }),
        'dry run',
      );
      budget.checkpoint('dry run result');

      return {
        status: dryRunReport.valid ? 'success' : 'failed',
        success: dryRunReport.valid,
        outputFiles: [],
        stepResults: [],
        finalBytes: ctx.workingBytes,
        logs: dryRunReport.diff.logs,
        selectedPages: ctx.selectedPages,
        dryRunDiff: dryRunReport.diff,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) return cancelledBeforeExecution(ctx, error);
      if (error instanceof MacroResourceLimitError) return failedBeforeExecution(ctx, error);
      throw error;
    }
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
  let status: MacroExecutionStatus = 'success';
  let rolledBack = false;

  try {
    for (let index = 0; index < recipe.steps.length; index += 1) {
      const rawStep = recipe.steps[index];
      const step = templateVarEngine.expandStep(rawStep, state.templateVars);
      budget.beforeStep(step);

      onProgress?.({
        current: index + 1,
        total: recipe.steps.length,
        currentOp: step.op,
      });

      const result = await budget.run(
        macroRegistry.execute(step, runtimeContext, state),
        step.op,
      );
      budget.checkpoint(`${step.op} result`);
      stepResults.push(result);

      budget.afterStep(state, result.sideEffects);
      applyMacroSideEffects(result.sideEffects, state);

      if (result.message) {
        state.logs.push(`[step ${index + 1}/${recipe.steps.length}] ${step.op}: ${result.message}`);
      }

      if (result.status === 'error') {
        status = 'failed';
        if (ctx.options?.abortOnError !== false) {
          state.logs.push(buildMacroRollbackMessage(ctx, index, step.op, result.message));
          break;
        }
      }
    }
  } catch (unexpectedError) {
    rollbackMacroTransaction(state, snapshot);
    rolledBack = true;

    if (isOperationCancelledError(unexpectedError)) {
      status = 'cancelled';
      stepResults.push({ status: 'error', message: unexpectedError.message, sideEffects: [] });
      state.logs.push(`[cancelled] ${unexpectedError.message}`);
    } else if (unexpectedError instanceof MacroResourceLimitError) {
      status = unexpectedError.code === 'MACRO_EXECUTION_TIMEOUT' ? 'timed-out' : 'failed';
      stepResults.push({ status: 'error', message: unexpectedError.message, sideEffects: [] });
      state.logs.push(`[resource-limit:${unexpectedError.code}] ${unexpectedError.message}`);
    } else {
      state.logs.push('[fatal] Unexpected error — document rolled back to pre-macro state');
      throw unexpectedError;
    }
  }

  if (status === 'failed' && ctx.options?.rollbackOnError !== false && !rolledBack) {
    rollbackMacroTransaction(state, snapshot);
    rolledBack = true;
    state.logs.push('[rollback] Macro failed — document restored to pre-run state');
  }

  if ((status === 'cancelled' || status === 'timed-out') && !rolledBack) {
    rollbackMacroTransaction(state, snapshot);
    rolledBack = true;
  }

  return {
    status,
    success: status === 'success',
    outputFiles: state.outputFiles,
    stepResults,
    finalBytes: state.workingBytes,
    logs: state.logs,
    selectedPages: state.selectedPages,
    rolledBack,
    cancelled: status === 'cancelled',
    timedOut: status === 'timed-out',
  };
}
