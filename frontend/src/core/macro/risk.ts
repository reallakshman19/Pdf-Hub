import type { MacroRecipe, MacroStep } from './types';

export type MacroWorkflowRisk = 'safe' | 'preview-required';

const PREVIEW_REQUIRED_OPS = new Set<MacroStep['op']>([
  'remove_pages',
  'split_pages',
  'replace_page',
  'reorder_pages',
]);

export interface MacroWorkflowRiskAnalysis {
  risk: MacroWorkflowRisk;
  destructiveOps: MacroStep['op'][];
}

export function analyzeMacroWorkflowRisk(
  recipe: MacroRecipe,
): MacroWorkflowRiskAnalysis {
  const destructiveOps = new Set<MacroStep['op']>();

  visitSteps(recipe.steps, (step) => {
    if (PREVIEW_REQUIRED_OPS.has(step.op)) {
      destructiveOps.add(step.op);
    }
  });

  return {
    risk: destructiveOps.size > 0 ? 'preview-required' : 'safe',
    destructiveOps: [...destructiveOps],
  };
}

function visitSteps(
  steps: MacroStep[],
  visitor: (step: MacroStep) => void,
): void {
  for (const step of steps) {
    visitor(step);

    if (step.op === 'conditional') {
      visitSteps(step.then, visitor);
      if (step.else) visitSteps(step.else, visitor);
    }
  }
}
