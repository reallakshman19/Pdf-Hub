// @ts-nocheck
import type {
  MacroRecipe,
  MacroStep,
} from '../types';
import {
  createDefaultStep,
  getMacroOpSchema,
} from '../schema/opSchema';
import {
  validateMacroRecipe,
} from '../validator';
import {
  validateMacroStepByOp,
} from '../validation/op-validators';

export interface MacroRecipeValidationIssue {
  stepIndex: number;
  op: string;
  field: string;
  message: string;
}

export interface MacroRecipeValidationSummary {
  valid: boolean;
  issues: MacroRecipeValidationIssue[];
}

export function createEmptyMacroRecipe(): MacroRecipe {
  return {
    id: `macro-${Date.now().toString(36)}`,
    name: 'Untitled Macro Recipe',
    dryRun: true,
    steps: [],
  };
}

export function cloneMacroRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

export function insertMacroStep(
  recipe: MacroRecipe,
  index: number,
  step: MacroStep,
): MacroRecipe {
  const steps = [...recipe.steps];
  const safeIndex = Math.max(0, Math.min(index, steps.length));

  steps.splice(safeIndex, 0, cloneStep(step));

  return {
    ...recipe,
    steps,
  };
}

export function appendDefaultMacroStep(
  recipe: MacroRecipe,
  op: MacroStep['op'],
): MacroRecipe {
  return insertMacroStep(recipe, recipe.steps.length, createDefaultStep(op));
}

export function updateMacroStep(
  recipe: MacroRecipe,
  index: number,
  step: MacroStep,
): MacroRecipe {
  if (index < 0 || index >= recipe.steps.length) return recipe;

  return {
    ...recipe,
    steps: recipe.steps.map((existing, currentIndex) =>
      currentIndex === index ? cloneStep(step) : existing,
    ),
  };
}

export function removeMacroStep(
  recipe: MacroRecipe,
  index: number,
): MacroRecipe {
  if (index < 0 || index >= recipe.steps.length) return recipe;

  return {
    ...recipe,
    steps: recipe.steps.filter((_, currentIndex) => currentIndex !== index),
  };
}

export function moveMacroStep(
  recipe: MacroRecipe,
  from: number,
  to: number,
): MacroRecipe {
  if (
    from < 0 ||
    from >= recipe.steps.length ||
    to < 0 ||
    to >= recipe.steps.length ||
    from === to
  ) {
    return recipe;
  }

  const steps = [...recipe.steps];
  const [removed] = steps.splice(from, 1);

  if (!removed) return recipe;

  steps.splice(to, 0, removed);

  return {
    ...recipe,
    steps,
  };
}

export function duplicateMacroStep(
  recipe: MacroRecipe,
  index: number,
): MacroRecipe {
  if (index < 0 || index >= recipe.steps.length) return recipe;

  const step = recipe.steps[index];

  if (!step) return recipe;

  return insertMacroStep(recipe, index + 1, cloneStep(step));
}

export function renameMacroRecipe(
  recipe: MacroRecipe,
  name: string,
): MacroRecipe {
  return {
    ...recipe,
    name,
  };
}

export function setMacroRecipeDryRun(
  recipe: MacroRecipe,
  dryRun: boolean,
): MacroRecipe {
  return {
    ...recipe,
    dryRun,
  };
}

export function validateMacroRecipeWithSchema(
  recipe: MacroRecipe,
): MacroRecipeValidationSummary {
  const issues: MacroRecipeValidationIssue[] = [];

  if (!recipe || typeof recipe !== 'object') {
    return {
      valid: false,
      issues: [
        {
          stepIndex: -1,
          op: 'recipe',
          field: 'recipe',
          message: 'Recipe must be an object.',
        },
      ],
    };
  }

  if (!recipe.id || typeof recipe.id !== 'string') {
    issues.push({
      stepIndex: -1,
      op: 'recipe',
      field: 'id',
      message: 'Recipe id is required.',
    });
  }

  if (!recipe.name || recipe.name.trim().length === 0) {
    issues.push({
      stepIndex: -1,
      op: 'recipe',
      field: 'name',
      message: 'Recipe name is required.',
    });
  }

  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    issues.push({
      stepIndex: -1,
      op: 'recipe',
      field: 'steps',
      message: 'Recipe must contain at least one step.',
    });
  }

  if (Array.isArray(recipe.steps)) {
    issues.push(...validateMacroStepsWithSchema(recipe.steps, 'steps'));
  }

  const runtimeValidation = validateMacroRecipe(recipe);

  for (const issue of runtimeValidation.errors) {
    pushUniqueIssue(issues, issue);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateMacroStepsWithSchema(
  steps: MacroStep[],
  path: string,
): MacroRecipeValidationIssue[] {
  const issues: MacroRecipeValidationIssue[] = [];

  steps.forEach((step, stepIndex) => {
    const op = String((step as { op?: unknown }).op ?? 'unknown');

    try {
      const schema = getMacroOpSchema(step.op);

      for (const field of schema.fields) {
        if (!field.required) continue;

        const value = getPath(step, field.key);

        if (value === undefined || value === null || value === '') {
          issues.push({
            stepIndex,
            op: step.op,
            field: `${path}.${stepIndex}.${field.key}`,
            message: `${schema.label}: ${field.label} is required.`,
          });
        }

        if (
          field.type === 'number' &&
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            issues.push({
              stepIndex,
              op: step.op,
              field: `${path}.${stepIndex}.${field.key}`,
              message: `${schema.label}: ${field.label} must be a finite number.`,
            });
          } else {
            if (typeof field.min === 'number' && value < field.min) {
              issues.push({
                stepIndex,
                op: step.op,
                field: `${path}.${stepIndex}.${field.key}`,
                message: `${schema.label}: ${field.label} must be >= ${field.min}.`,
              });
            }

            if (typeof field.max === 'number' && value > field.max) {
              issues.push({
                stepIndex,
                op: step.op,
                field: `${path}.${stepIndex}.${field.key}`,
                message: `${schema.label}: ${field.label} must be <= ${field.max}.`,
              });
            }
          }
        }
      }

      for (const issue of validateMacroStepByOp(step, stepIndex)) {
        pushUniqueIssue(issues, {
          ...issue,
          field: issue.field.includes('.')
            ? `${path}.${stepIndex}.${issue.field}`
            : `${path}.${stepIndex}.${issue.field}`,
        });
      }

      if (step.op === 'conditional') {
        if (Array.isArray(step.then)) {
          issues.push(...validateMacroStepsWithSchema(step.then, `${path}.${stepIndex}.then`));
        }

        if (Array.isArray(step.else)) {
          issues.push(...validateMacroStepsWithSchema(step.else, `${path}.${stepIndex}.else`));
        }
      }
    } catch (err) {
      issues.push({
        stepIndex,
        op,
        field: `${path}.${stepIndex}.op`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return dedupeIssues(issues);
}

function cloneStep(step: MacroStep): MacroStep {
  return JSON.parse(JSON.stringify(step)) as MacroStep;
}

function getPath(value: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = value as Record<string, unknown>;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part] as Record<string, unknown>;
  }

  return current;
}

function pushUniqueIssue(
  issues: MacroRecipeValidationIssue[],
  issue: MacroRecipeValidationIssue,
): void {
  if (!issues.some((existing) =>
    existing.stepIndex === issue.stepIndex &&
    existing.op === issue.op &&
    existing.field === issue.field &&
    existing.message === issue.message
  )) {
    issues.push(issue);
  }
}

function dedupeIssues(
  issues: MacroRecipeValidationIssue[],
): MacroRecipeValidationIssue[] {
  const out: MacroRecipeValidationIssue[] = [];

  for (const issue of issues) {
    pushUniqueIssue(out, issue);
  }

  return out;
}
