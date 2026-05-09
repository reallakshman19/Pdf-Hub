import {
  macroRegistry,
  type MacroMutableState,
  type StepResult,
} from '../registry';
import type {
  MacroCondition,
  MacroExecutionContext,
  MacroStep,
} from '../types';
import {
  templateVarEngine,
} from '../template-vars';
import {
  applySideEffectToState,
} from '../side-effects';

type ApplyTemplateVarsStep = Extract<MacroStep, { op: 'apply_template_vars' }>;
type ConditionalStep = Extract<MacroStep, { op: 'conditional' }>;

async function executeApplyTemplateVars(
  step: ApplyTemplateVarsStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  state.templateVars = {
    ...state.templateVars,
    ...step.vars,
  };

  return {
    status: 'success',
    message: `Applied ${Object.keys(step.vars).length} template variable(s).`,
    sideEffects: [],
  };
}

async function executeConditional(
  step: ConditionalStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  const passed = evaluateCondition(step.condition, ctx, state);
  const nestedSteps = passed ? step.then : step.else ?? [];
  const messages: string[] = [`Condition ${passed ? 'passed' : 'failed'}.`];
  const sideEffects: StepResult['sideEffects'] = [];

  for (const nestedRawStep of nestedSteps) {
    const nestedStep = (templateVarEngine as any).expandStep(nestedRawStep, state.templateVars);
    const result = await macroRegistry.execute(nestedStep, ctx, state);

    messages.push(`${nestedStep.op}: ${result.status}${result.message ? ` — ${result.message}` : ''}`);

    for (const effect of result.sideEffects) {
      sideEffects.push(effect);
      applySideEffectToState(state, effect);
    }

    if (result.status === 'error' && ctx.options?.abortOnError !== false) {
      return {
        status: 'error',
        message: messages.join(' '),
        sideEffects,
      };
    }
  }

  return {
    status: nestedSteps.length === 0 ? 'warning' : 'success',
    message:
      nestedSteps.length === 0
        ? `${messages[0]} No nested steps executed.`
        : messages.join(' '),
    sideEffects,
  };
}

function evaluateCondition(
  condition: MacroCondition,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): boolean {
  if (condition.type === 'page_count_gt') return state.pageCount > condition.value;
  if (condition.type === 'page_count_lt') return state.pageCount < condition.value;
  if (condition.type === 'filename_contains') return ctx.fileName.includes(condition.value);
  if (condition.type === 'custom_var_equals') return state.templateVars[condition.key] === condition.value;

  return false;
}

macroRegistry.register('apply_template_vars', executeApplyTemplateVars);
macroRegistry.register('conditional', executeConditional);
