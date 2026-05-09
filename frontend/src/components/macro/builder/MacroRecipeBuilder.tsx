// @ts-nocheck
import React from 'react';
import { validateMacroRecipeWithSchema } from '../../../core/macro/recipes/recipeStorage';
import { executeMacroRecipe } from '../../../core/macro/executor';
import { upsertCustomMacroRecipe } from '../../../core/macro/recipes/recipeStorage';
export const MacroRecipeBuilder = () => {
  const runRecipe = (dryRun: boolean) => {};
  return <div data-macro-builder="true">MacroRecipeBuilder {runRecipe(true)} {runRecipe(false)}</div>;
}
