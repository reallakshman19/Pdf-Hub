import type { MacroRecipe } from './types';
import type { MacroResourceLimits } from './resourceBudget';
import { executeMacroRecipe, type MacroExecutionResult } from './executor';
import { useSessionStore } from '@/core/session/store';
import { useMacroOutputQueueStore } from './outputQueueStore';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { sameMacroPreview, snapshotMacroPreview, type MacroPreviewIdentity } from './previewIdentity';

export interface SessionMacroRunOptions {
  donorFiles?: Record<string, Uint8Array>;
  saveOutputs?: boolean;
  dryRun?: boolean;
  abortSignal?: AbortSignal;
  resourceLimits?: Partial<MacroResourceLimits>;
  /** Exact Test Run source identity; verified again after queue waiting. */
  expectedPreview?: MacroPreviewIdentity;
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

  const executionIdentity = snapshotMacroPreview(
    options?.expectedPreview?.recipeSignature ?? JSON.stringify(recipe),
    session,
  );
  if (
    options?.expectedPreview
    && !sameMacroPreview(options.expectedPreview, executionIdentity)
  ) {
    throw new Error('Document or selection changed after workflow Test Run; preview again.');
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
    // A queued run may outlive the document or selection it originally read.
    // The command bus guards commit ownership; reject the stale source earlier.
    if (!sameMacroPreview(
      executionIdentity,
      snapshotMacroPreview(executionIdentity.recipeSignature, useSessionStore.getState()),
    )) {
      return failedBeforeCommit(result, 'Document or selection changed during macro execution.');
    }
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
      workingBytes: session.workingBytes,
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
            nextCurrentPage: result.currentPage,
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

  if (!options?.dryRun && options?.saveOutputs && executionSucceeded && result.outputFiles.length > 0) {
    // External filesystem/download writes are not transactional with the
    // document commit. Keep every output recoverable in the shared UI queue
    // instead of starting silent downloads that can fail after commit.
    useMacroOutputQueueStore.getState().enqueueOutputs(result.outputFiles, {
      sourceKind: 'macro',
      sourceDocumentKey: session.documentKey ?? undefined,
      sourceRecipeId: recipe.id,
    });
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
