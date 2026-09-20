import type { PdfCommand } from '@/core/commands/types';
import {
  classifyHistoryReplayability,
} from '../replayability';
import type { HistoryState } from '../types';
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
import {
  truncateAbandonedTail,
} from './appendMutation';

export interface PrepareHistoryJournalStateTransactionInput {
  journalStoreId: string | null;
  journalId: string | null;
  revisionStoreId: string | null;
  revisionId: string | null;
  transactionId: string;
  currentTransactionId: string | null;
  command: PdfCommand;
  after: HistoryState;
  createdAt?: string;
}

export interface PreparedHistoryJournalStateTransaction {
  store: HistoryJournalStore;
  manifest: HistoryJournalManifest;
}

export async function prepareHistoryJournalStateTransaction(
  input: PrepareHistoryJournalStateTransactionInput,
): Promise<PreparedHistoryJournalStateTransaction | null> {
  if (!input.journalStoreId && !input.journalId) {
    return null;
  }
  if (!input.journalStoreId || !input.journalId) {
    throw new Error(
      'History journal store and journal identity must be provided together.',
    );
  }
  if (!input.revisionStoreId || !input.revisionId) {
    throw new Error(
      'Journaled state transaction requires an immutable revision identity.',
    );
  }
  if (
    input.command.type !== 'ANNOTATION_CHANGE'
    && input.command.type !== 'WRITER_CHANGE'
  ) {
    throw new Error(
      `Command ${input.command.type} is not a state-only history command.`,
    );
  }

  const classification =
    classifyHistoryReplayability(input.command);
  if (
    classification.disposition
      !== 'CHECKPOINT_REQUIRED'
    || !classification.barriers.some(
      (barrier) =>
        barrier.code
        === 'DESCRIPTIVE_STATE_COMMAND',
    )
  ) {
    throw new Error(
      `State-only command ${input.command.type} must require a descriptive-state checkpoint.`,
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
  if (current.activeRevisionId !== input.revisionId) {
    throw new Error(
      `History journal active revision ${current.activeRevisionId} does not match state transaction revision ${input.revisionId}.`,
    );
  }
  const activeTransactionId =
    resolveHistoryJournalActiveTransactionId(
      current,
    );
  if (
    activeTransactionId
    !== input.currentTransactionId
  ) {
    throw new Error(
      `History journal active transaction ${activeTransactionId ?? '(origin)'} does not match in-memory history cursor ${input.currentTransactionId ?? '(origin)'}.`,
    );
  }

  const createdAt =
    input.createdAt ?? new Date().toISOString();
  const revision: HistoryJournalRevisionRef = {
    storeId: input.revisionStoreId,
    revisionId: input.revisionId,
  };
  const statePayload =
    createHistoryStateCheckpointPayload(
      input.after,
    );
  const manifest =
    cloneHistoryJournalManifest(current);

  truncateAbandonedTail(manifest);

  manifest.entries.push({
    entryId:
      `${input.journalId}:entry:${input.transactionId}`,
    transactionId: input.transactionId,
    command: input.command,
    disposition: classification.disposition,
    barriers: classification.barriers.map(
      (barrier) => ({
        ...barrier,
        ...(barrier.resourceIds
          ? {
              resourceIds: [
                ...barrier.resourceIds,
              ],
            }
          : {}),
        ...(barrier.contextKeys
          ? {
              contextKeys: [
                ...barrier.contextKeys,
              ],
            }
          : {}),
      }),
    ),
    beforeRevision: revision,
    afterRevision: revision,
    createdAt,
  });
  manifest.checkpoints.push({
    checkpointId:
      `${input.journalId}:state:${input.transactionId}`,
    kind: 'BARRIER',
    revision,
    createdAt,
    transactionId: input.transactionId,
    statePayload,
  });
  manifest.activeRevisionId = input.revisionId;
  manifest.activeTransactionId =
    input.transactionId;
  manifest.updatedAt = createdAt;

  assertHistoryJournalManifest(manifest);

  return {
    store,
    manifest,
  };
}
