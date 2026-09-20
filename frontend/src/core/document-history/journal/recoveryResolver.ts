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
  | 'REVISION_CHAIN_INVALID'
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

  await assertRevisionExists(
    store,
    plan.originalRevisionId,
    'original recovery revision',
  );
  await assertRevisionExists(
    store,
    plan.revision.revisionId,
    'checkpoint recovery revision',
  );

  let expectedRevision = {
    ...plan.revision,
  };
  for (const entry of plan.replayEntries) {
    if (
      entry.beforeRevision.storeId
        !== expectedRevision.storeId
      || entry.beforeRevision.revisionId
        !== expectedRevision.revisionId
    ) {
      throw new HistoryRecoveryResolutionError(
        'REVISION_CHAIN_INVALID',
        `Recovery transaction ${entry.transactionId} begins at ${entry.beforeRevision.storeId}/${entry.beforeRevision.revisionId}, expected ${expectedRevision.storeId}/${expectedRevision.revisionId}.`,
      );
    }
    if (
      entry.afterRevision.storeId
        !== plan.revision.storeId
    ) {
      throw new HistoryRecoveryResolutionError(
        'REVISION_CHAIN_INVALID',
        `Recovery transaction ${entry.transactionId} targets revision store ${entry.afterRevision.storeId}, expected ${plan.revision.storeId}.`,
      );
    }

    await assertRevisionExists(
      store,
      entry.afterRevision.revisionId,
      `recovery transaction ${entry.transactionId} after-revision`,
    );
    expectedRevision = {
      ...entry.afterRevision,
    };
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


async function assertRevisionExists(
  store: NonNullable<
    ReturnType<typeof resolveWorkingRevisionStore>
  >,
  revisionId: string,
  label: string,
): Promise<void> {
  let exists: boolean;
  try {
    exists = await store.has(revisionId);
  } catch (error) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_MATERIALIZATION_FAILED',
      `Failed to verify ${label} ${revisionId}.`,
      { cause: error },
    );
  }

  if (!exists) {
    throw new HistoryRecoveryResolutionError(
      'REVISION_MISSING',
      `${label} ${revisionId} does not exist in store ${store.id}.`,
    );
  }
}
