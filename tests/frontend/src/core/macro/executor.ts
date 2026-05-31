import { macroRegistry } from './registry';
import type { MacroMutableState, StepResult } from './registry';
import { macroValidator } from './validator';
import { templateVarEngine } from './template-vars';
import type { MacroRecipe, MacroExecutionContext } from './types';

export interface MacroExecutionResult {
  success:           boolean;
  outputFiles:       { name: string; bytes: Uint8Array }[];
  stepResults:       StepResult[];
  validationErrors?: import('./validator').ValidationError[];
  finalBytes:        Uint8Array;
  logs:              string[];
  selectedPages:     number[];
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
      selectedPages: ctx.selectedPages ?? [],
      finalBytes: ctx.workingBytes,
      logs: validation.errors.map(e => `[step ${e.stepIndex}] ${e.op}.${e.field}: ${e.message}`),
    };
  }

  // 2. Expand template variables once before the loop
  const defaultVars = templateVarEngine.buildDefaultVars({ fileName: ctx.fileName, pageCount: ctx.pageCount });
  const expandedRecipe = templateVarEngine.expandRecipe(recipe, defaultVars);

  // 3. Build mutable state
  const state: MacroMutableState = {
    workingBytes:  ctx.workingBytes,
    pageCount:     ctx.pageCount,
    selectedPages: ctx.selectedPages ?? [],
    templateVars:  defaultVars,
    logs:          [],
    outputFiles:   [],
  };

  const stepResults: StepResult[] = [];

  // 4. Execute via registry — no step logic here
  for (let i = 0; i < expandedRecipe.steps.length; i++) {
    const step = expandedRecipe.steps[i];
    onProgress?.({ current: i + 1, total: expandedRecipe.steps.length, currentOp: step.op });

    const result = await macroRegistry.execute(step, ctx, state);
    stepResults.push(result);

    for (const effect of result.sideEffects) {
      if (effect.type === 'bytes_updated')       state.workingBytes = effect.bytes;
      if (effect.type === 'page_count_changed')  state.pageCount = effect.newCount;
      if (effect.type === 'output_file')         state.outputFiles.push({ name: effect.name, bytes: effect.bytes });
    }

    if (result.message) state.logs.push(`[step ${i+1}/${expandedRecipe.steps.length}] ${step.op}: ${result.message}`);
    if (result.status === 'error' && ctx.options?.abortOnError !== false) break;
  }

  return {
    success:     stepResults.every(r => r.status !== 'error'),
    outputFiles: state.outputFiles,
    stepResults,
    finalBytes:  state.workingBytes,
    logs:        state.logs,
    selectedPages: state.selectedPages,
  };
}
