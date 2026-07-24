import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { macroValidator } from './validator';
import {
  assertMacroInputResources,
  inspectMacroRecipeBudget,
  parseMacroRecipeJson,
} from './resourceBudget';

/**
 * Executes a macro directly from a raw JSON payload representing the DSL,
 * entirely bypassing the UI and Session stores. This enables other apps
 * to pass code-based page creation instructions.
 */
export async function executeHeadlessMacro(
  basePdfBytes: Uint8Array,
  recipeDsl: string | MacroRecipe,
  fileName: string = 'headless.pdf',
  donorFiles: Record<string, Uint8Array> = {},
): Promise<Uint8Array> {
  const recipe = typeof recipeDsl === 'string'
    ? parseMacroRecipeJson(recipeDsl)
    : recipeDsl;

  inspectMacroRecipeBudget(recipe);
  assertMacroInputResources(basePdfBytes, donorFiles);

  const validation = macroValidator.validate(recipe);
  if (!validation.valid) {
    const details = validation.errors
      .map((error) => `${error.field}: ${error.message}`)
      .join('; ');
    throw new Error(`Invalid Headless Macro DSL: ${details}`);
  }

  const pageCount = await PdfEditAdapter.countPages(basePdfBytes);

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
    },
  );

  if (!result.success) {
    throw new Error(result.logs.join('\n') || 'Headless macro execution failed.');
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
