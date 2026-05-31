import type {
  MacroRecipe,
  MacroStep,
} from '../types';
import { macroValidator } from '../validator';
import type {
  ValidationError,
  ValidationResult,
} from '../validator';
import {
  buildDefaultStep,
  getMacroOpSchema,
} from '../schema/opSchema';
import {
  exportMacroRecipeJson,
  importMacroRecipeJson,
} from '../recipes/recipeStorage';

export type MacroStepBranch = 'root' | 'then' | 'else';

export interface MacroStepPath {
  /**
   * Path to the conditional parent.
   * Empty array means root recipe steps.
   */
  parentPath: Array<number | 'then' | 'else'>;
  branch: MacroStepBranch;
  index: number;
}

export interface MacroRecipeBuilderState {
  recipe: MacroRecipe;
  selectedPath: MacroStepPath | null;
  validation: ValidationResult;
  dirty: boolean;
  lastError: string | null;
}

export function createEmptyMacroRecipe(
  id = `custom-${Date.now()}`,
  name = 'Untitled Macro',
): MacroRecipe {
  return {
    id,
    name,
    steps: [],
  };
}

export function createMacroRecipeBuilderState(
  recipe: MacroRecipe = createEmptyMacroRecipe(),
): MacroRecipeBuilderState {
  const cloned = cloneRecipe(recipe);

  return {
    recipe: cloned,
    selectedPath: cloned.steps.length > 0
      ? rootStepPath(0)
      : null,
    validation: macroValidator.validate(cloned),
    dirty: false,
    lastError: null,
  };
}

export function rootStepPath(index: number): MacroStepPath {
  return {
    parentPath: [],
    branch: 'root',
    index,
  };
}

export function conditionalThenPath(
  conditionalIndex: number,
  childIndex: number,
): MacroStepPath {
  return {
    parentPath: [conditionalIndex],
    branch: 'then',
    index: childIndex,
  };
}

export function conditionalElsePath(
  conditionalIndex: number,
  childIndex: number,
): MacroStepPath {
  return {
    parentPath: [conditionalIndex],
    branch: 'else',
    index: childIndex,
  };
}

export function setRecipeIdentity(
  state: MacroRecipeBuilderState,
  patch: {
    id?: string;
    name?: string;
    dryRun?: boolean;
  },
): MacroRecipeBuilderState {
  const nextRecipe: MacroRecipe = {
    ...state.recipe,
    id: patch.id ?? state.recipe.id,
    name: patch.name ?? state.recipe.name,
    dryRun: patch.dryRun ?? state.recipe.dryRun,
  };

  return finalizeState(nextRecipe, state.selectedPath);
}

export function addMacroStep(
  state: MacroRecipeBuilderState,
  op: MacroStep['op'],
  options: {
    target?: Omit<MacroStepPath, 'index'>;
    index?: number;
  } = {},
): MacroRecipeBuilderState {
  const step = buildDefaultStep(op);
  const recipe = cloneRecipe(state.recipe);
  const target = options.target ?? {
    parentPath: [],
    branch: 'root' as const,
  };

  const list = getMutableStepList(recipe, target.parentPath, target.branch);
  const insertIndex = clampInsertIndex(options.index ?? list.length, list.length);

  list.splice(insertIndex, 0, step);

  return finalizeState(
    recipe,
    {
      ...target,
      index: insertIndex,
    },
  );
}

export function replaceMacroStep(
  state: MacroRecipeBuilderState,
  path: MacroStepPath,
  step: MacroStep,
): MacroRecipeBuilderState {
  const recipe = cloneRecipe(state.recipe);
  const list = getMutableStepList(recipe, path.parentPath, path.branch);

  assertIndex(path.index, list.length, 'replaceMacroStep');

  list[path.index] = cloneStep(step);

  return finalizeState(recipe, path);
}

export function updateMacroStep(
  state: MacroRecipeBuilderState,
  path: MacroStepPath,
  patch: Partial<MacroStep>,
): MacroRecipeBuilderState {
  const current = getMacroStepAtPath(state.recipe, path);

  if (!current) {
    return {
      ...state,
      lastError: `updateMacroStep failed: path ${formatStepPath(path)} was not found.`,
    };
  }

  const nextStep = {
    ...current,
    ...patch,
    op: current.op,
  } as MacroStep;

  return replaceMacroStep(state, path, nextStep);
}

export function removeMacroStep(
  state: MacroRecipeBuilderState,
  path: MacroStepPath,
): MacroRecipeBuilderState {
  const recipe = cloneRecipe(state.recipe);
  const list = getMutableStepList(recipe, path.parentPath, path.branch);

  assertIndex(path.index, list.length, 'removeMacroStep');

  list.splice(path.index, 1);

  const selectedPath = list.length === 0
    ? null
    : {
        ...path,
        index: Math.min(path.index, list.length - 1),
      };

  return finalizeState(recipe, selectedPath);
}

export function duplicateMacroStep(
  state: MacroRecipeBuilderState,
  path: MacroStepPath,
): MacroRecipeBuilderState {
  const step = getMacroStepAtPath(state.recipe, path);

  if (!step) {
    return {
      ...state,
      lastError: `duplicateMacroStep failed: path ${formatStepPath(path)} was not found.`,
    };
  }

  const recipe = cloneRecipe(state.recipe);
  const list = getMutableStepList(recipe, path.parentPath, path.branch);

  assertIndex(path.index, list.length, 'duplicateMacroStep');

  const duplicate = cloneStep(step);
  list.splice(path.index + 1, 0, duplicate);

  return finalizeState(
    recipe,
    {
      ...path,
      index: path.index + 1,
    },
  );
}

export function moveMacroStep(
  state: MacroRecipeBuilderState,
  from: MacroStepPath,
  to: MacroStepPath,
): MacroRecipeBuilderState {
  const recipe = cloneRecipe(state.recipe);

  const fromList = getMutableStepList(recipe, from.parentPath, from.branch);
  assertIndex(from.index, fromList.length, 'moveMacroStep.from');

  const [moved] = fromList.splice(from.index, 1);

  if (!moved) {
    return {
      ...state,
      lastError: `moveMacroStep failed: path ${formatStepPath(from)} was not found.`,
    };
  }

  const toList = getMutableStepList(recipe, to.parentPath, to.branch);
  const insertIndex = clampInsertIndex(to.index, toList.length);

  toList.splice(insertIndex, 0, moved);

  return finalizeState(
    recipe,
    {
      ...to,
      index: insertIndex,
    },
  );
}

export function getMacroStepAtPath(
  recipe: MacroRecipe,
  path: MacroStepPath,
): MacroStep | null {
  const list = getReadonlyStepList(recipe, path.parentPath, path.branch);

  if (!list) return null;
  if (path.index < 0 || path.index >= list.length) return null;

  return list[path.index] ?? null;
}

export function getMacroStepSchemaAtPath(
  recipe: MacroRecipe,
  path: MacroStepPath,
) {
  const step = getMacroStepAtPath(recipe, path);

  return step ? getMacroOpSchema(step.op) : null;
}

export function validateBuilderState(
  state: MacroRecipeBuilderState,
): MacroRecipeBuilderState {
  return {
    ...state,
    validation: macroValidator.validate(state.recipe),
  };
}

export function exportBuilderRecipeJson(
  state: MacroRecipeBuilderState,
): string {
  return exportMacroRecipeJson(state.recipe);
}

export function importBuilderRecipeJson(
  jsonText: string,
): MacroRecipeBuilderState {
  try {
    const recipe = importMacroRecipeJson(jsonText);
    return createMacroRecipeBuilderState(recipe);
  } catch (err) {
    return {
      recipe: createEmptyMacroRecipe(),
      selectedPath: null,
      validation: {
        valid: false,
        errors: [
          {
            stepIndex: -1,
            op: 'import',
            field: 'json',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      },
      dirty: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getValidationErrorsForPath(
  state: MacroRecipeBuilderState,
  path: MacroStepPath,
): ValidationError[] {
  const prefix = formatValidationPath(path);

  return state.validation.errors.filter((error) => {
    return error.field.startsWith(prefix) || error.stepIndex === path.index;
  });
}

function finalizeState(
  recipe: MacroRecipe,
  selectedPath: MacroStepPath | null,
): MacroRecipeBuilderState {
  return {
    recipe,
    selectedPath,
    validation: macroValidator.validate(recipe),
    dirty: true,
    lastError: null,
  };
}

function getReadonlyStepList(
  recipe: MacroRecipe,
  parentPath: Array<number | 'then' | 'else'>,
  branch: MacroStepBranch,
): readonly MacroStep[] | null {
  const parent = resolveParent(recipe, parentPath);

  if (!parent) return null;

  if (branch === 'root') {
    if (parentPath.length !== 0) return null;
    return recipe.steps;
  }

  if (!('op' in parent) || parent.op !== 'conditional') return null;

  if (branch === 'then') return parent.then;
  if (branch === 'else') return parent.else ?? [];

  return null;
}

function getMutableStepList(
  recipe: MacroRecipe,
  parentPath: Array<number | 'then' | 'else'>,
  branch: MacroStepBranch,
): MacroStep[] {
  if (branch === 'root') {
    if (parentPath.length !== 0) {
      throw new Error('Root branch must use an empty parentPath.');
    }

    return recipe.steps;
  }

  const parent = resolveParent(recipe, parentPath);

  if (!parent) {
    throw new Error(`Parent path not found: ${parentPath.join('.')}`);
  }

  if (!('op' in parent) || parent.op !== 'conditional') {
    throw new Error(`Parent path ${parentPath.join('.')} is not a conditional step.`);
  }

  if (branch === 'then') {
    return parent.then;
  }

  if (!parent.else) {
    parent.else = [];
  }

  return parent.else;
}

function resolveParent(
  recipe: MacroRecipe,
  parentPath: Array<number | 'then' | 'else'>,
): MacroRecipe | MacroStep | null {
  if (parentPath.length === 0) {
    return recipe;
  }

  let currentList: MacroStep[] = recipe.steps;
  let currentStep: MacroStep | null = null;

  for (let index = 0; index < parentPath.length; index += 1) {
    const token = parentPath[index];

    if (typeof token === 'number') {
      currentStep = currentList[token] ?? null;

      if (!currentStep) return null;

      if (index === parentPath.length - 1) {
        return currentStep;
      }

      continue;
    }

    if (!currentStep || currentStep.op !== 'conditional') {
      return null;
    }

    currentList = token === 'then'
      ? currentStep.then
      : currentStep.else ?? [];
  }

  return currentStep;
}

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

function cloneStep(step: MacroStep): MacroStep {
  return JSON.parse(JSON.stringify(step)) as MacroStep;
}

function assertIndex(
  index: number,
  length: number,
  source: string,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`${source}: index ${index} is outside range 0..${Math.max(0, length - 1)}.`);
  }
}

function clampInsertIndex(index: number, length: number): number {
  if (!Number.isInteger(index)) return length;
  return Math.max(0, Math.min(index, length));
}

function formatStepPath(path: MacroStepPath): string {
  return [
    ...path.parentPath.map((part) => String(part)),
    path.branch,
    String(path.index),
  ].join('.');
}

function formatValidationPath(path: MacroStepPath): string {
  if (path.branch === 'root') {
    return `steps.${path.index}`;
  }

  return [
    'steps',
    ...path.parentPath.map((part) => String(part)),
    path.branch,
    String(path.index),
  ].join('.');
}
