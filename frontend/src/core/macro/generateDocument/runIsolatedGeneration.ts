import { executeMacroRecipe, type MacroExecutionResult } from '@/core/macro/executor';
import type { MacroRecipe } from '@/core/macro/types';

export interface GenerationSourceSnapshot {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages: number[];
  currentPage?: number;
  fileName: string;
  now: Date;
}

/** Generate a PDF in detached bytes; never mutate the source session or journal. */
export function runGenerationRecipeOnSnapshot(
  recipe: MacroRecipe,
  source: GenerationSourceSnapshot,
  abortSignal?: AbortSignal,
): Promise<MacroExecutionResult> {
  return executeMacroRecipe(recipe, {
    workingBytes: Uint8Array.from(source.workingBytes),
    pageCount: source.pageCount,
    selectedPages: [...source.selectedPages],
    currentPage: source.currentPage,
    fileName: source.fileName,
    donorFiles: {},
    now: source.now,
    options: { abortSignal },
  });
}
