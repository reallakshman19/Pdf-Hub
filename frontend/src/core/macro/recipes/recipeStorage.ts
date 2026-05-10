import type { MacroRecipe } from '../types';
import { macroValidator } from '../validator';

export const CUSTOM_MACRO_RECIPE_STORAGE_KEY = 'pdfhub.macro.customRecipes.v1';

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

  storage.setItem(
    CUSTOM_MACRO_RECIPE_STORAGE_KEY,
    JSON.stringify(records, null, 2),
  );
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

export function exportMacroRecipeJson(recipe: MacroRecipe): string {
  assertValidRecipe(recipe);
  return JSON.stringify(recipe, null, 2);
}

export function importMacroRecipeJson(jsonText: string): MacroRecipe {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Invalid macro recipe JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid macro recipe JSON: root value must be an object.');
  }

  const recipe = parsed as MacroRecipe;
  assertValidRecipe(recipe);

  return cloneRecipe(recipe);
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
    parsed = JSON.parse(raw);
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

    records.push({
      recipe: cloneRecipe(candidate.recipe),
      updatedAt: typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : new Date(0).toISOString(),
    });
  }

  return records;
}

function assertValidRecipe(recipe: MacroRecipe): void {
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

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}