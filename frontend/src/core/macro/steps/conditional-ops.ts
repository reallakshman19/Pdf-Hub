import { macroRegistry } from '../registry';
import type { MacroMutableState, StepResult } from '../registry';
import type { MacroExecutionContext, MacroCondition, MacroStep } from '../types';

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

  for (const subStep of branch) {
    const result = await macroRegistry.execute(subStep, ctx, state);
    subResults.push(result);
    mergedSideEffects.push(...result.sideEffects);
    // Apply side effects immediately — sub-steps must see updated state
    for (const effect of result.sideEffects) {
      if (effect.type === 'bytes_updated')       state.workingBytes = effect.bytes;
      if (effect.type === 'page_count_changed')  state.pageCount = effect.newCount;
      // We only update working bytes and page count for immediate sub-step access
    }
    if (result.status === 'error') break;
  }

  return {
    status: subResults.some(r => r.status === 'error') ? 'error' :
            subResults.some(r => r.status === 'warning') ? 'warning' : 'success',
    message: `Conditional: condition=${conditionMet}, ran ${branch.length} step(s)`,
    sideEffects: mergedSideEffects,
  };
}

function evaluateCondition(condition: MacroCondition, ctx: MacroExecutionContext, state: MacroMutableState): boolean {
  switch (condition.type) {
    case 'page_count_gt':     return state.pageCount > condition.value;
    case 'page_count_lt':     return state.pageCount < condition.value;
    case 'filename_contains': return (ctx.fileName ?? '').includes(condition.value);
    case 'custom_var_equals': return state.templateVars[condition.key] === condition.value;
    default:                  return false;
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

macroRegistry.register('conditional',         executeConditional);
macroRegistry.register('apply_template_vars', executeApplyTemplateVars);
