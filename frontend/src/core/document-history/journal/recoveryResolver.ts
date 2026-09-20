import {
  materializeDocumentSource,
  type MaterializeDocumentSourceOptions,
} from '@/core/document-source/materialize';
import {
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';
import type {
  HistoryRecoveryPlan,
} from './recoveryPlanner';

export type HistoryRecoveryResolutionErrorCode =
  | 'REVISION_STORE_UNAVAILABLE'
  | 'REVISION_MISSING'
  | 'REVISION_MATERIALIZATION_FAILED';

export class HistoryRecoveryResolutionError extends Error {
  readonly code: HistoryRecoveryResolutionErrorCode;

  constructor(
    code: HistoryRecoveryResolutionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HistoryRecoveryResolutionError';
    this.code = code;
  }
}

export interface ResolvedHistoryRecoveryPlan {
  plan: HistoryRecoveryPlan;
  checkpointBytes: Uint8Array;
}

/**
 * Resolves the immutable PDF revision named by a recovery plan without
 * mutating application/session state.
 *
 * The restore executor must complete this preflight before applying PageGraph,
 * navigation, annotation, Writer or OCR state.
 */
export async function resolveHistoryRecoveryPlan(
  plan: HistoryRecoveryPlan,
  options: MaterializeDocumentSourceOptions = {},
): Promise<ResolvedHistoryRecoveryPlan> {
  if (
    plan.state.documentKey
    !== plan.revision.revisionId
  ) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_MISSING',
      `Recovery checkpoint documentKey ${plan.state.documentKey} does not match revision ${plan.revision.revisionId}.`,
    );
  }

  const store =
    resolveWorkingRevisionStore(
      plan.revision.storeId,
    );
  if (!store) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_STORE_UNAVAILABLE',
      `WorkingRevisionStore ${plan.revision.storeId} is not registered.`,
    );
  }

  let exists: boolean;
  try {
    exists = await store.has(
      plan.revision.revisionId,
    );
  } catch (error) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_MATERIALIZATION_FAILED',
      `Failed to verify recovery revision ${plan.revision.revisionId}.`,
      { cause: error },
    );
  }

  if (!exists) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_MISSING',
      `Recovery revision ${plan.revision.revisionId} does not exist in store ${plan.revision.storeId}.`,
    );
  }

  try {
    const source = await store.open(
      plan.revision.revisionId,
    );
    const checkpointBytes =
      await materializeDocumentSource(
        source,
        options,
      );

    return {
      plan,
      checkpointBytes,
    };
  } catch (error) {
    if (
      error
      instanceof HistoryRecoveryResolutionError
    ) {
      throw error;
    }
    throw new HistoryRecoveryResolutionError(
      'REVISION_MATERIALIZATION_FAILED',
      `Failed to materialize recovery revision ${plan.revision.revisionId}.`,
      { cause: error },
    );
  }
}
