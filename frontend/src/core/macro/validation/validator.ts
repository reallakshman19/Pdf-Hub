import type { MacroDryRunDiff, MacroRecipe, MacroExecutionContext } from '../types';
import { simulateMacroDryRun } from '../dry-run';

export interface PreflightReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dryRunLogs: string[];
  dryRunDiff?: MacroDryRunDiff;
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

  // Dry run simulation
  let dryRunDiff: MacroDryRunDiff | undefined;
  if (recipe.dryRun) {
    const report = await simulateMacroDryRun(recipe, {
      pageCount: ctx.pageCount,
      selectedPages: ctx.selectedPages,
      fileName: ctx.fileName,
    });
    dryRunDiff = report.diff;
    dryRunLogs.push(...report.diff.logs);
    warnings.push(...report.warnings);
    errors.push(...report.errors);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    dryRunLogs,
    dryRunDiff,
  };
}
