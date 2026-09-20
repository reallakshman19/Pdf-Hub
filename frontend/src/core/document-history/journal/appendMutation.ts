import type { PdfCommand } from '@/core/commands/types';
import type { HistoryState } from '../types';
import {
  classifyHistoryReplayability,
} from '../replayability';
import {
  evaluateHistoryPeriodicCheckpoint,
  type HistoryPeriodicCheckpointDecision,
  type HistoryPeriodicCheckpointPolicy,
} from './checkpointPolicy';
import {
  resolveHistoryJournalStore,
} from './registry';
import type {
  HistoryJournalStore,
} from './store';
import {
  createHistoryStateCheckpointPayload,
} from './stateCheckpoint';
import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  resolveHistoryJournalActiveTransactionId,
  type HistoryJournalManifest,
  type HistoryJournalRevisionRef,
} from './types';

export interface PrepareHistoryJournalMutationInput {
  journalStoreId: string | null;
  journalId: string | null;
  revisionStoreId: string | null;
  beforeRevisionId: string | null;
  afterRevisionId: string | null;
  transactionId: string;
  command: PdfCommand;
  createdAt?: string;
  checkpointPolicy?:
    HistoryPeriodicCheckpointPolicy;
}

export interface PreparedHistoryJournalMutation {
  store: HistoryJournalStore;
  manifest: HistoryJournalManifest;
  periodicCheckpointDecision:
    HistoryPeriodicCheckpointDecision | null;
}

export function truncateAbandonedTail(
  manifest: HistoryJournalManifest,
): void {
  const activeTransactionId =
    resolveHistoryJournalActiveTransactionId(
      manifest,
    );

  if (activeTransactionId === null) {
    manifest.entries = [];
    manifest.checkpoints = manifest.checkpoints.filter(
      (checkpoint) =>
        checkpoint.kind === 'ADMISSION',
    );
    return;
  }

  const activeEntryIndex =
    manifest.entries.findIndex(
      (entry) =>
        entry.transactionId
        === activeTransactionId,
    );

  if (activeEntryIndex < 0) {
    throw new Error(
      `History journal cannot locate active transaction ${activeTransactionId} in its retained transaction chain.`,
    );
  }

  const retainedEntries = manifest.entries.slice(
    0,
    activeEntryIndex + 1,
  );
  const retainedTransactionIds = new Set(
    retainedEntries.map(
      (entry) => entry.transactionId,
    ),
  );
  const retainedRevisionIds = new Set([
    manifest.originalRevisionId,
    ...retainedEntries.map(
      (entry) => entry.afterRevision.revisionId,
    ),
  ]);

  manifest.entries = retainedEntries;
  manifest.checkpoints =
    manifest.checkpoints.filter((checkpoint) => {
      if (checkpoint.kind === 'ADMISSION') {
        return true;
      }
      if (checkpoint.transactionId) {
        return retainedTransactionIds.has(
          checkpoint.transactionId,
        );
      }
      return retainedRevisionIds.has(
        checkpoint.revision.revisionId,
      );
    });
}

/**
 * Historical name retained for Phase 8E compatibility.
 *
 * 8E.5C3 extends this boundary to attach recovery-complete state to either
 * the existing BARRIER checkpoint or a scheduled PERIODIC checkpoint for the
 * same committed transaction.
 */
export function attachHistoryJournalBarrierState(input: {
  manifest: HistoryJournalManifest;
  transactionId: string;
  after: HistoryState;
}): boolean {
  const entry = input.manifest.entries.find(
    (candidate) =>
      candidate.transactionId
      === input.transactionId,
  );
  if (!entry) {
    throw new Error(
      `History journal cannot attach checkpoint state for missing transaction ${input.transactionId}.`,
    );
  }

  const expectedKind =
    entry.disposition
      === 'CHECKPOINT_REQUIRED'
      ? 'BARRIER'
      : entry.disposition
          === 'SELF_CONTAINED_REPLAY'
        ? 'PERIODIC'
        : null;

  if (!expectedKind) {
    return false;
  }

  const checkpoint =
    input.manifest.checkpoints.find(
      (candidate) =>
        candidate.kind
          === expectedKind
        && candidate.transactionId
          === input.transactionId,
    );

  if (!checkpoint) {
    if (
      entry.disposition
      === 'CHECKPOINT_REQUIRED'
    ) {
      throw new Error(
        `History journal checkpoint-required transaction ${input.transactionId} has no barrier checkpoint.`,
      );
    }
    return false;
  }

  if (
    !input.after.revision
    || input.after.revision.storeId
      !== checkpoint.revision.storeId
    || input.after.revision.revisionId
      !== checkpoint.revision.revisionId
  ) {
    throw new Error(
      `History journal ${checkpoint.kind.toLowerCase()} checkpoint ${input.transactionId} after-state revision does not match checkpoint revision.`,
    );
  }

  checkpoint.statePayload =
    createHistoryStateCheckpointPayload(
      input.after,
    );
  assertHistoryJournalManifest(
    input.manifest,
  );
  return true;
}

export async function prepareHistoryJournalMutation(
  input: PrepareHistoryJournalMutationInput,
): Promise<PreparedHistoryJournalMutation | null> {
  if (!input.journalStoreId && !input.journalId) {
    return null;
  }
  if (!input.journalStoreId || !input.journalId) {
    throw new Error(
      'History journal store and journal identity must be provided together.',
    );
  }
  if (
    !input.revisionStoreId
    || !input.beforeRevisionId
    || !input.afterRevisionId
  ) {
    throw new Error(
      'Journaled document mutation requires before/after immutable revision identity.',
    );
  }

  const store = resolveHistoryJournalStore(
    input.journalStoreId,
  );
  if (!store) {
    throw new Error(
      `HistoryJournalStore ${input.journalStoreId} is not registered.`,
    );
  }

  const current = await store.load(input.journalId);
  if (!current) {
    throw new Error(
      `History journal ${input.journalId} does not exist.`,
    );
  }
  assertHistoryJournalManifest(current);

  if (current.revisionStoreId !== input.revisionStoreId) {
    throw new Error(
      `History journal revision store ${current.revisionStoreId} does not match active revision store ${input.revisionStoreId}.`,
    );
  }
  if (current.activeRevisionId !== input.beforeRevisionId) {
    throw new Error(
      `History journal active revision ${current.activeRevisionId} does not match mutation before revision ${input.beforeRevisionId}.`,
    );
  }

  const classification = classifyHistoryReplayability(
    input.command,
  );
  if (classification.disposition === 'NON_MUTATING') {
    throw new Error(
      `Non-mutating command ${input.command.type} cannot be appended from the document mutation transaction path.`,
    );
  }

  const createdAt =
    input.createdAt ?? new Date().toISOString();
  const beforeRevision: HistoryJournalRevisionRef = {
    storeId: input.revisionStoreId,
    revisionId: input.beforeRevisionId,
  };
  const afterRevision: HistoryJournalRevisionRef = {
    storeId: input.revisionStoreId,
    revisionId: input.afterRevisionId,
  };
  const manifest = cloneHistoryJournalManifest(current);
  truncateAbandonedTail(manifest);

  manifest.entries.push({
    entryId: `${input.journalId}:entry:${input.transactionId}`,
    transactionId: input.transactionId,
    command: input.command,
    disposition: classification.disposition,
    barriers: classification.barriers.map((barrier) => ({
      ...barrier,
      ...(barrier.resourceIds
        ? { resourceIds: [...barrier.resourceIds] }
        : {}),
      ...(barrier.contextKeys
        ? { contextKeys: [...barrier.contextKeys] }
        : {}),
    })),
    beforeRevision,
    afterRevision,
    createdAt,
  });

  let periodicCheckpointDecision:
    HistoryPeriodicCheckpointDecision
    | null = null;

  if (
    classification.disposition
    === 'CHECKPOINT_REQUIRED'
  ) {
    manifest.checkpoints.push({
      checkpointId:
        `${input.journalId}:barrier:${input.transactionId}`,
      kind: 'BARRIER',
      revision: afterRevision,
      createdAt,
      transactionId:
        input.transactionId,
    });
  } else if (
    classification.disposition
    === 'SELF_CONTAINED_REPLAY'
  ) {
    periodicCheckpointDecision =
      evaluateHistoryPeriodicCheckpoint(
        manifest,
        input.transactionId,
        input.checkpointPolicy,
      );

    if (
      periodicCheckpointDecision.due
    ) {
      manifest.checkpoints.push({
        checkpointId:
          `${input.journalId}:periodic:${input.transactionId}`,
        kind: 'PERIODIC',
        revision: afterRevision,
        createdAt,
        transactionId:
          input.transactionId,
      });
    }
  }

  manifest.activeRevisionId =
    input.afterRevisionId;
  manifest.activeTransactionId =
    input.transactionId;
  manifest.updatedAt = createdAt;
  assertHistoryJournalManifest(manifest);

  return {
    store,
    manifest,
    periodicCheckpointDecision,
  };
}