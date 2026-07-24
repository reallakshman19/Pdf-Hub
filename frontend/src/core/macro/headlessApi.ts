import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';
import type { MacroResourceLimits } from './resourceBudget';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { macroValidator } from './validator';
import {
  assertMacroInputResources,
  inspectMacroRecipeBudget,
  parseMacroRecipeJson,
} from './resourceBudget';

export interface HeadlessMacroOptions {
  abortSignal?: AbortSignal;
  resourceLimits?: Partial<MacroResourceLimits>;
}

export async function executeHeadlessMacro(
  basePdfBytes: Uint8Array,
  recipeDsl: string | MacroRecipe,
  fileName: string = 'headless.pdf',
  donorFiles: Record<string, Uint8Array> = {},
  options: HeadlessMacroOptions = {},
): Promise<Uint8Array> {
  const recipe = typeof recipeDsl === 'string'
    ? parseMacroRecipeJson(recipeDsl, options.resourceLimits)
    : recipeDsl;

  inspectMacroRecipeBudget(recipe, options.resourceLimits);
  assertMacroInputResources(basePdfBytes, donorFiles, options.resourceLimits);

  const validation = macroValidator.validate(recipe);
  if (!validation.valid) {
    const details = validation.errors
      .map((error) => `${error.field}: ${error.message}`)
      .join('; ');
    throw new Error(`Invalid Headless Macro DSL: ${details}`);
  }

  const pageCount = await PdfEditAdapter.countPages(basePdfBytes, {
    signal: options.abortSignal,
  });

  const result = await executeMacroRecipe(
    recipe,
    {
      workingBytes: basePdfBytes,
      pageCount,
      selectedPages: [],
      currentPage: 1,
      fileName,
      donorFiles,
      now: new Date(),
      options: {
        abortSignal: options.abortSignal,
        resourceLimits: options.resourceLimits,
      },
    },
  );

  if (!result.success) {
    throw new Error(result.logs.join('
') || `Headless macro execution ${result.status}.`);
  }

  return result.finalBytes;
}

declare global {
  interface Window {
    PDFHubHeadless?: {
      execute: typeof executeHeadlessMacro;
    };
  }
}

if (typeof window !== 'undefined') {
  window.PDFHubHeadless = {
    execute: executeHeadlessMacro,
  };
}
