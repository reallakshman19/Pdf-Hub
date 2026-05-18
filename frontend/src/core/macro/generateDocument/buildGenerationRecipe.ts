import type { MacroRecipe, MacroStep } from '@/core/macro/types';
import { templateVarEngine } from '@/core/macro/template-vars';
import type { BuildGenerationRecipeInput } from './generationTypes';

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

function applyBrandImage(recipe: MacroRecipe, brandImageDataUrl?: string | null): MacroRecipe {
  if (!brandImageDataUrl) {
    return recipe;
  }

  return {
    ...recipe,
    steps: recipe.steps.map((step): MacroStep => {
      if (step.op !== 'add_image_header_page') {
        return step;
      }

      return {
        ...step,
        imageSrc: brandImageDataUrl,
      };
    }),
  };
}

export function buildGenerationRecipe(input: BuildGenerationRecipeInput): MacroRecipe {
  const clonedRecipe = cloneRecipe(input.template.recipe);
  const recipeWithBrandImage = applyBrandImage(clonedRecipe, input.brandImageDataUrl);

  const defaultVars = templateVarEngine.buildDefaultVars({
    fileName: input.fileName,
    pageCount: input.pageCount,
    now: input.now,
  });

  const vars: Record<string, string> = {
    ...defaultVars,
    ...input.values,
  };

  return {
    ...recipeWithBrandImage,
    steps: [
      {
        op: 'apply_template_vars',
        vars,
      },
      ...recipeWithBrandImage.steps,
    ],
  };
}
