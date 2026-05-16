import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';

export interface BatchRunOptions {
  files: { name: string; bytes: Uint8Array }[];
  recipe: MacroRecipe;
  continueOnError: boolean;
  donorFiles?: Record<string, Uint8Array>;
}

export interface BatchRunResult {
  successes: { fileName: string; bytes: Uint8Array; logs: string[] }[];
  failures: { fileName: string; error: string }[];
  metadata: {
    recipeId: string;
    startTime: Date;
    endTime: Date;
  };
}

export async function runMacroBatch(options: BatchRunOptions): Promise<BatchRunResult> {
  const successes: BatchRunResult['successes'] = [];
  const failures: BatchRunResult['failures'] = [];
  const startTime = new Date();

  for (const file of options.files) {
    try {
      // In batch context, assume pageCount needs to be calculated.
      // But for now, just mock a fast pass or try to parse if needed.
      // We'll rely on the executor's internal page resolution or basic adapter usage.

      // Let's do a quick page count just for context.
      const { PdfEditAdapter } = await import('@/adapters/pdf-edit/PdfEditAdapter');
      const pageCount = await PdfEditAdapter.countPages(file.bytes);

      const result = await executeMacroRecipe(
        options.recipe,
        {
          workingBytes: file.bytes,
          pageCount,
          selectedPages: [], // In batch mode, no selected pages
          currentPage: 1,
          fileName: file.name,
          donorFiles: options.donorFiles ?? {},
          now: new Date(),
        }
      );

      successes.push({
        fileName: file.name,
        bytes: result.finalBytes,
        logs: result.logs,
      });

    } catch (err) {
      failures.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      });

      if (!options.continueOnError) {
        break; // Stop immediately
      }
    }
  }

  const endTime = new Date();

  return {
    successes,
    failures,
    metadata: {
      recipeId: options.recipe.id,
      startTime,
      endTime,
    },
  };
}
