import { macroRegistry } from '../registry';
import type {
  MacroMutableState,
  StepResult,
} from '../registry';
import type {
  MacroCondition,
  MacroExecutionContext,
  MacroStep,
} from '../types';
import { applyMacroSideEffects } from '../transaction';
import { templateVarEngine } from '../template-vars';

type ApplyTemplateVarsStep = Extract<MacroStep, { op: 'apply_template_vars' }>;

async function executeApplyTemplateVars(
  step: ApplyTemplateVarsStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  state.templateVars = {
    ...state.templateVars,
    ...Object.fromEntries(
      Object.entries(step.vars).map(([key, value]) => [key, String(value)]),
    ),
  };

  return {
    status: 'success',
    message: `Applied ${Object.keys(step.vars).length} template variable(s).`,
    sideEffects: [
      {
        type: 'log',
        message: `Applied template vars: ${Object.keys(step.vars).join(', ')}`,
      },
    ],
  };
}

macroRegistry.register('apply_template_vars', executeApplyTemplateVars);

type ConditionalStep = Extract<MacroStep, { op: 'conditional' }>;

async function executeConditional(
  step: ConditionalStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  const branch = evaluateCondition(step.condition, ctx, state)
    ? step.then
    : step.else ?? [];

  for (let index = 0; index < branch.length; index += 1) {
    const child = templateVarEngine.expandStep(branch[index], state.templateVars);
    const result = await macroRegistry.execute(child, ctx, state);

    applyMacroSideEffects(result.sideEffects, state);

    if (result.message) {
      state.logs.push(`[conditional ${index + 1}/${branch.length}] ${child.op}: ${result.message}`);
    }

    if (result.status === 'error' && ctx.options?.abortOnError !== false) {
      return {
        status: 'error',
        message: `Conditional branch failed at nested step ${index + 1}: ${result.message ?? child.op}`,
        sideEffects: [],
      };
    }
  }

  return {
    status: 'success',
    message: `Conditional executed ${branch.length} nested step(s).`,
    sideEffects: [
      {
        type: 'log',
        message: `Conditional executed ${branch.length} nested step(s).`,
      },
    ],
  };
}

macroRegistry.register('conditional', executeConditional);

function evaluateCondition(
  condition: MacroCondition,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): boolean {
  if (condition.type === 'page_count_gt') {
    return state.pageCount > condition.value;
  }

  if (condition.type === 'page_count_lt') {
    return state.pageCount < condition.value;
  }

  if (condition.type === 'filename_contains') {
    return ctx.fileName.includes(condition.value);
  }

  if (condition.type === 'custom_var_equals') {
    return state.templateVars[condition.key] === condition.value;
  }

  return false;
}