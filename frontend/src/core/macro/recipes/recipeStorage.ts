import type { MacroRecipe } from '../types';
import { macroValidator } from '../validator';
import {
  assertJsonTextWithinBudget,
  DEFAULT_MACRO_RESOURCE_LIMITS,
  parseBoundedJson,
  parseMacroRecipeJson,
} from '../resourceBudget';

export const CUSTOM_MACRO_RECIPE_STORAGE_KEY = 'pdfhub.macro.customRecipes.v1';
export const CUSTOM_MACRO_RECIPES_CHANGED_EVENT = 'pdfhub:macro-custom-recipes-changed';

export interface StoredMacroRecipeRecord {
  recipe: MacroRecipe;
  updatedAt: string;
}

export function loadCustomMacroRecipes(): MacroRecipe[] {
  const storage = getLocalStorage();

  if (!storage) return [];

  const raw = storage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY);

  if (!raw) return [];

  const parsed = parseStoredRecords(raw);

  return parsed.map((record) => record.recipe);
}

export function saveCustomMacroRecipes(recipes: MacroRecipe[]): void {
  const storage = getLocalStorage();

  if (!storage) return;

  const records = normalizeRecipeList(recipes).map((recipe) => ({
    recipe,
    updatedAt: new Date().toISOString(),
  }));
  const serialized = JSON.stringify(records, null, 2);
  assertJsonTextWithinBudget(
    serialized,
    DEFAULT_MACRO_RESOURCE_LIMITS.maxStoredRecipeJsonBytes,
    'Stored macro recipe collection',
  );

  storage.setItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY, serialized);
  dispatchCustomRecipeStorageChanged(records.map((record) => record.recipe));
}

export function upsertCustomMacroRecipe(recipe: MacroRecipe): MacroRecipe[] {
  assertValidRecipe(recipe);

  const existing = loadCustomMacroRecipes();
  const next = [
    ...existing.filter((item) => item.id !== recipe.id),
    cloneRecipe(recipe),
  ].sort((a, b) => a.name.localeCompare(b.name));

  saveCustomMacroRecipes(next);

  return next;
}

export function deleteCustomMacroRecipe(recipeId: string): MacroRecipe[] {
  const next = loadCustomMacroRecipes().filter((recipe) => recipe.id !== recipeId);
  saveCustomMacroRecipes(next);
  return next;
}

export function updateCustomMacroRecipe(
  recipeId: string,
  updates: Partial<MacroRecipe>,
): MacroRecipe[] {
  const existing = loadCustomMacroRecipes();
  const found = existing.find((recipe) => recipe.id === recipeId);

  if (!found) {
    throw new Error(`Custom macro recipe "${recipeId}" was not found.`);
  }

  const updated: MacroRecipe = {
    ...found,
    ...updates,
    id: recipeId,
    steps: updates.steps ?? found.steps,
  };

  return upsertCustomMacroRecipe(updated);
}

export function exportMacroRecipeJson(recipe: MacroRecipe): string {
  assertValidRecipe(recipe);
  const serialized = JSON.stringify(recipe, null, 2);
  assertJsonTextWithinBudget(
    serialized,
    DEFAULT_MACRO_RESOURCE_LIMITS.maxRecipeJsonBytes,
    'Macro recipe JSON',
  );
  return serialized;
}

export function importMacroRecipeJson(jsonText: string): MacroRecipe {
  const recipe = parseMacroRecipeJson(jsonText);
  assertValidRecipe(recipe);
  return cloneRecipe(recipe);
}

export function subscribeCustomMacroRecipeChanges(
  listener: (recipes: MacroRecipe[]) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ recipes?: MacroRecipe[] }>).detail;
    listener(Array.isArray(detail?.recipes) ? cloneRecipeList(detail.recipes) : loadCustomMacroRecipes());
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === CUSTOM_MACRO_RECIPE_STORAGE_KEY) {
      listener(loadCustomMacroRecipes());
    }
  };

  window.addEventListener(CUSTOM_MACRO_RECIPES_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(CUSTOM_MACRO_RECIPES_CHANGED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

function normalizeRecipeList(recipes: MacroRecipe[]): MacroRecipe[] {
  const seen = new Set<string>();
  const out: MacroRecipe[] = [];

  for (const recipe of recipes) {
    assertValidRecipe(recipe);

    if (seen.has(recipe.id)) {
      throw new Error(`Duplicate custom macro recipe id "${recipe.id}".`);
    }

    seen.add(recipe.id);
    out.push(cloneRecipe(recipe));
  }

  return out;
}

function parseStoredRecords(raw: string): StoredMacroRecipeRecord[] {
  let parsed: unknown;

  try {
    parsed = parseBoundedJson(raw, {
      maxBytes: DEFAULT_MACRO_RESOURCE_LIMITS.maxStoredRecipeJsonBytes,
      label: 'stored macro recipe JSON',
    });
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const records: StoredMacroRecipeRecord[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;

    const candidate = item as Partial<StoredMacroRecipeRecord>;
    if (!candidate.recipe) continue;

    const validation = macroValidator.validate(candidate.recipe);

    if (!validation.valid) continue;

    try {
      const recipeJson = JSON.stringify(candidate.recipe);
      const boundedRecipe = parseMacroRecipeJson(recipeJson);
      records.push({
        recipe: cloneRecipe(boundedRecipe),
        updatedAt: typeof candidate.updatedAt === 'string'
          ? candidate.updatedAt
          : new Date(0).toISOString(),
      });
    } catch {
      continue;
    }
  }

  return records;
}

function assertValidRecipe(recipe: MacroRecipe): void {
  parseMacroRecipeJson(JSON.stringify(recipe));
  const result = macroValidator.validate(recipe);

  if (!result.valid) {
    const message = result.errors
      .map((error) => `${error.field}: ${error.message}`)
      .join('; ');

    throw new Error(`Macro recipe is invalid: ${message}`);
  }
}

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

function cloneRecipeList(recipes: MacroRecipe[]): MacroRecipe[] {
  return recipes.map((recipe) => cloneRecipe(recipe));
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function dispatchCustomRecipeStorageChanged(recipes: MacroRecipe[]): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(CUSTOM_MACRO_RECIPES_CHANGED_EVENT, {
      detail: {
        recipes: cloneRecipeList(recipes),
      },
    }),
  );
}
