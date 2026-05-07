import type { MacroRecipe, MacroExecutionContext } from '../types';

export interface PreflightReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dryRunLogs: string[];
}

export async function validateRecipeBeforeRun(
  recipe: MacroRecipe,
  ctx: Omit<MacroExecutionContext, 'workingBytes'>
): Promise<PreflightReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dryRunLogs: string[] = [];

  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    const prefix = `Step ${i + 1} (${step.op}):`;

    switch (step.op) {
      case 'insert_pdf':
        if (!(ctx.donorFiles && ctx.donorFiles[step.donorFileId])) {
          errors.push(`${prefix} Missing donor file ID '${step.donorFileId}'`);
        }
        break;
      case 'replace_page':
        if (!(ctx.donorFiles && ctx.donorFiles[step.donorFileId])) {
          errors.push(`${prefix} Missing donor file ID '${step.donorFileId}'`);
        }
        break;
      case 'merge_files':
        if (step.donorFileIds.length === 0) {
          warnings.push(`${prefix} No donor files provided to merge`);
        }
        step.donorFileIds.forEach(id => {
          if (!(ctx.donorFiles && ctx.donorFiles[id])) {
            errors.push(`${prefix} Missing donor file ID '${id}'`);
          }
        });
        break;
      case 'insert_blank_page':
        if (step.count && step.count < 1) {
          errors.push(`${prefix} Invalid blank page count`);
        }
        break;
    }
  }

  // Dry run simulation (simplified for validation)
  if (recipe.dryRun) {
    dryRunLogs.push('Dry run validation complete.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    dryRunLogs,
  };
}
