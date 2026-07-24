import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';
import { isOperationCancelledError, throwIfAborted } from '@/core/cancellation/operationCancellation';

export interface BatchRunOptions {
  files: { name: string; bytes: Uint8Array }[];
  recipe: MacroRecipe;
  continueOnError: boolean;
  donorFiles?: Record<string, Uint8Array>;
  abortSignal?: AbortSignal;
}

export interface BatchRunResult {
  successes: { fileName: string; bytes: Uint8Array; logs: string[] }[];
  failures: { fileName: string; error: string }[];
  cancelled: boolean;
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
  let cancelled = false;

  for (const file of options.files) {
    try {
      throwIfAborted(options.abortSignal, `batch file ${file.name}`);
      const { PdfEditAdapter } = await import('@/adapters/pdf-edit/PdfEditAdapter');
      const pageCount = await PdfEditAdapter.countPages(file.bytes, {
        signal: options.abortSignal,
      });

      const result = await executeMacroRecipe(
        options.recipe,
        {
          workingBytes: file.bytes,
          pageCount,
          selectedPages: [],
          currentPage: 1,
          fileName: file.name,
          donorFiles: options.donorFiles ?? {},
          now: new Date(),
          options: {
            abortSignal: options.abortSignal,
          },
        },
      );

      if (result.status === 'cancelled') {
        cancelled = true;
        failures.push({ fileName: file.name, error: result.logs.at(-1) ?? 'Batch cancelled.' });
        break;
      }
      if (!result.success) {
        failures.push({
          fileName: file.name,
          error: result.logs.at(-1) ?? `Macro ${result.status}.`,
        });
        if (!options.continueOnError) break;
        continue;
      }

      successes.push({
        fileName: file.name,
        bytes: result.finalBytes,
        logs: result.logs,
      });
    } catch (err) {
      if (isOperationCancelledError(err)) cancelled = true;
      failures.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      });

      if (cancelled || !options.continueOnError) break;
    }
  }

  return {
    successes,
    failures,
    cancelled,
    metadata: {
      recipeId: options.recipe.id,
      startTime,
      endTime: new Date(),
    },
  };
}
