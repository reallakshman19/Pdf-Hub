import type { MacroRecipe } from './types';
import { executeMacroRecipe } from './executor';
import { useSessionStore } from '@/core/session/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';

export async function runMacroRecipeAgainstSession(
  recipe: MacroRecipe,
  options?: {
    donorFiles?: Record<string, Uint8Array>;
    saveOutputs?: boolean;
    dryRun?: boolean;
  },
) {
  const session = useSessionStore.getState();

  if (!session.workingBytes || !session.fileName) {
    throw new Error('No active document in session');
  }

  const donorFiles = options?.donorFiles ?? {};
  const result = await executeMacroRecipe(
    recipe,
    {
      workingBytes: session.workingBytes,
      pageCount: session.pageCount,
      selectedPages: session.selectedPages,
      currentPage: session.viewState.currentPage,
      fileName: session.fileName,
      donorFiles,
      now: new Date(),
    },
  );

  if (!options?.dryRun) {
    const { dispatchCommand } = await import('@/core/commands/dispatch');
    await dispatchCommand({
      source: 'macro-runner',
      command: {
        type: 'REPLACE_WORKING_COPY',
        nextBytes: result.finalBytes,
        nextPageCount: result.stepResults
  .flatMap(r => r.sideEffects)
  .filter(e => e.type === 'page_count_changed')
  .at(-1)?.newCount
  ?? useSessionStore.getState().pageCount,
        reason: `Ran macro recipe ${recipe.name}`,
      },
    });
    useSessionStore.getState().setSelectedPages(result.selectedPages);
  }

  if (options?.saveOutputs) {
    for (const output of result.outputFiles) {
      await FileAdapter.savePdfBytes(output.bytes, output.name, null);
    }
  }

  return result;
}
