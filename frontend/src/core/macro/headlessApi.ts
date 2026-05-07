import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';

/**
 * Executes a macro directly from a raw JSON payload representing the DSL,
 * entirely bypassing the UI and Session stores. This enables other apps
 * to pass code-based page creation instructions.
 */
export async function executeHeadlessMacro(
  basePdfBytes: Uint8Array,
  recipeDsl: string | MacroRecipe,
  fileName: string = 'headless.pdf',
  donorFiles: Record<string, Uint8Array> = {}
): Promise<Uint8Array> {
  const recipe: MacroRecipe = typeof recipeDsl === 'string' ? JSON.parse(recipeDsl) : recipeDsl;

  // Validate essential DSL fields
  if (!recipe.id || !recipe.steps || !Array.isArray(recipe.steps)) {
    throw new Error('Invalid Headless Macro DSL: Missing id or steps array.');
  }

  // Determine starting context. If creating a page from scratch, the caller
  // might pass a minimal 1-page blank PDF, or we use the passed document.
  const pageCount = await PdfEditAdapter.countPages(basePdfBytes);

  const result = await executeMacroRecipe(
    recipe,
    {
      workingBytes: basePdfBytes,
      pageCount,
      selectedPages: [], // Headless runs apply purely sequentially or explicitly via selectors
      currentPage: 1,
      fileName,
      donorFiles,
      now: new Date(),
    }
  );

  return result.finalBytes;
}

// Global registration so external apps can invoke via `window.PDFHubHeadless.execute(...)`
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