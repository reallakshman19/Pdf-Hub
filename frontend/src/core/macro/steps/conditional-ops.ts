import { macroRegistry } from '../registry';
import type { MacroMutableState, StepResult } from '../registry';
import type { MacroExecutionContext, MacroCondition, MacroStep } from '../types';
import { getMacroExecutionBudget } from '../resourceBudget';

type ConditionalStep = Extract<MacroStep, { op: 'conditional' }>;
type ApplyTemplateVarsStep = Extract<MacroStep, { op: 'apply_template_vars' }>;

async function executeConditional(
  step: ConditionalStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  const conditionMet = evaluateCondition(step.condition as MacroCondition, ctx, state);
  const branch = conditionMet ? step.then : (step.else ?? []);
  const mergedSideEffects: StepResult['sideEffects'] = [];
  const subResults: StepResult[] = [];
  const budget = getMacroExecutionBudget(ctx);

  for (const subStep of branch) {
    budget?.beforeStep(subStep);
    const operation = macroRegistry.execute(subStep, ctx, state);
    const result = budget
      ? await budget.run(operation, subStep.op)
      : await operation;
    subResults.push(result);
    mergedSideEffects.push(...result.sideEffects);

    for (const effect of result.sideEffects) {
      if (effect.type === 'bytes_updated') state.workingBytes = effect.bytes;
      if (effect.type === 'page_count_changed') state.pageCount = effect.newCount;
    }
    budget?.afterStep(state, result.sideEffects);

    if (result.status === 'error') break;
  }

  return {
    status: subResults.some((result) => result.status === 'error') ? 'error' :
            subResults.some((result) => result.status === 'warning') ? 'warning' : 'success',
    message: `Conditional: condition=${conditionMet}, ran ${subResults.length} step(s)`,
    sideEffects: mergedSideEffects,
  };
}

function evaluateCondition(condition: MacroCondition, ctx: MacroExecutionContext, state: MacroMutableState): boolean {
  switch (condition.type) {
    case 'page_count_gt': return state.pageCount > condition.value;
    case 'page_count_lt': return state.pageCount < condition.value;
    case 'filename_contains': return (ctx.fileName ?? '').includes(condition.value);
    case 'custom_var_equals': return state.templateVars[condition.key] === condition.value;
    default: return false;
  }
}

async function executeApplyTemplateVars(
  step: ApplyTemplateVarsStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  Object.assign(state.templateVars, step.vars);
  return {
    status: 'success',
    message: `Applied ${Object.keys(step.vars).length} template var(s)`,
    sideEffects: [],
  };
}

macroRegistry.register('conditional', executeConditional);
macroRegistry.register('apply_template_vars', executeApplyTemplateVars);
