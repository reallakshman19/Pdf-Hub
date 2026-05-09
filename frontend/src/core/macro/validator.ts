import { macroRegistry } from './registry';
import { validateMacroStepByOp } from './validation/op-validators';

export function validateMacroRecipe(recipe: any) {
  if (!recipe || !recipe.steps) return false;
  for (const step of recipe.steps) {
    if (!macroRegistry.has(step.op)) return false;
    if (!validateMacroStepByOp(step, undefined as any)) return false;
  }
  return true;
}
