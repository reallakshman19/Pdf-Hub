import type { MacroRecipe } from './types';
import type { MacroResourceLimits } from './resourceBudget';
import { executeMacroRecipe, type MacroExecutionResult } from './executor';
import { useSessionStore } from '@/core/session/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';

export interface SessionMacroRunOptions {
  donorFiles?: Record<string, Uint8Array>;
  saveOutputs?: boolean;
  dryRun?: boolean;
  abortSignal?: AbortSignal;
  resourceLimits?: Partial<MacroResourceLimits>;
}

let runPromise: Promise<unknown> = Promise.resolve();

function failedBeforeCommit(
  result: MacroExecutionResult,
  message: string,
): MacroExecutionResult {
  return {
    ...result,
    status: 'failed',
    success: false,
    rolledBack: true,
    outputFiles: [],
    logs: [...result.logs, `[commit-failed] ${message}`],
  };
}

function cancelledBeforeCommit(result: MacroExecutionResult): MacroExecutionResult {
  return {
    ...result,
    status: 'cancelled',
    success: false,
    cancelled: true,
    rolledBack: true,
    outputFiles: [],
    logs: [...result.logs, '[cancelled] Macro was cancelled before session commit.'],
  };
}

async function runMacroRecipeAgainstSessionNow(
  recipe: MacroRecipe,
  options?: SessionMacroRunOptions,
) {
  const session = useSessionStore.getState();

  if (!session.workingBytes || !session.fileName) {
    throw new Error('No active document in session');
  }

  const donorFiles = options?.donorFiles ?? {};
  const runtimeRecipe: MacroRecipe = options?.dryRun
    ? {
        ...recipe,
        dryRun: true,
      }
    : recipe;

  const result = await executeMacroRecipe(
    runtimeRecipe,
    {
      workingBytes: session.workingBytes,
      pageCount: session.pageCount,
      selectedPages: session.selectedPages,
      currentPage: session.viewState.currentPage,
      fileName: session.fileName,
      donorFiles,
      now: new Date(),
      options: {
        abortSignal: options?.abortSignal,
        resourceLimits: options?.resourceLimits,
      },
    },
  );

  const executionSucceeded = result.status === undefined
    ? result.success !== false
    : result.status === 'success';

  if (!options?.dryRun && executionSucceeded) {
    if (options?.abortSignal?.aborted) {
      return cancelledBeforeCommit(result);
    }
    throwIfAborted(options?.abortSignal, 'macro session commit');

    if (options?.abortSignal?.aborted) {
      return cancelledBeforeCommit(result);
    }

    const documentKey = session.documentKey;
    if (!documentKey) {
      return failedBeforeCommit(
        result,
        'The active document has no command identity.',
      );
    }

    const binaryResourceId = 'macro:final-bytes';
    const commitResult = await commandBus.execute({
      command: materializePdfCommand(
        {
          type: 'APPLY_WORKING_COPY',
          payload: {
            binaryResourceId,
            nextPageCount: result.stepResults
              .flatMap((stepResult) => stepResult.sideEffects)
              .filter((effect) => effect.type === 'page_count_changed')
              .at(-1)?.newCount
              ?? useSessionStore.getState().pageCount,
            reason: `Ran macro recipe ${recipe.name}`,
            macro: {
              recipeId: recipe.id,
              recipeName: recipe.name,
              stepCount: recipe.steps.length,
            },
            selectedPages: result.selectedPages,
          },
        },
        'macro-runner',
        documentKey,
      ),
      resources: {
        binaries: {
          [binaryResourceId]: result.finalBytes,
        },
      },
      signal: options?.abortSignal,
    });

    if (!commitResult.success) {
      if (commitResult.error?.code === 'CANCELLED') {
        return cancelledBeforeCommit(result);
      }
      return failedBeforeCommit(
        result,
        commitResult.error?.message ?? commitResult.message,
      );
    }
  }

  if (options?.saveOutputs && executionSucceeded) {
    for (const output of result.outputFiles) {
      throwIfAborted(options.abortSignal, `saving macro output ${output.name}`);
      await FileAdapter.savePdfBytes(output.bytes, output.name, null);
    }
  }

  return result;
}

export async function runMacroRecipeAgainstSession(
  recipe: MacroRecipe,
  options?: SessionMacroRunOptions,
) {
  const run = runPromise.then(() => runMacroRecipeAgainstSessionNow(recipe, options));
  runPromise = run.catch(() => undefined);
  return run;
}
