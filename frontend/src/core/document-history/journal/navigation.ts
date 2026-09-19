import {
  resolveHistoryJournalStore,
} from './registry';
import type {
  HistoryJournalStore,
} from './store';
import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  resolveHistoryJournalActiveTransactionId,
  type HistoryJournalManifest,
} from './types';

export interface PrepareHistoryJournalNavigationInput {
  journalStoreId: string | null;
  journalId: string | null;
  revisionStoreId: string | null;
  currentRevisionId: string | null;
  targetRevisionId: string | null;
  direction: 'undo' | 'redo';
  transactionId: string;
  updatedAt?: string;
}

export interface PreparedHistoryJournalNavigation {
  store: HistoryJournalStore;
  previousManifest: HistoryJournalManifest;
  manifest: HistoryJournalManifest;
}

export async function prepareHistoryJournalNavigation(
  input: PrepareHistoryJournalNavigationInput,
): Promise<PreparedHistoryJournalNavigation | null> {
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
    || !input.currentRevisionId
    || !input.targetRevisionId
  ) {
    throw new Error(
      'Journaled history navigation requires current and target immutable revision identity.',
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
  if (current.activeRevisionId !== input.currentRevisionId) {
    throw new Error(
      `History journal active revision ${current.activeRevisionId} does not match session revision ${input.currentRevisionId}.`,
    );
  }

  const candidateIndex = current.entries.findIndex(
    (entry) =>
      entry.transactionId === input.transactionId,
  );
  if (candidateIndex < 0) {
    throw new Error(
      `History journal does not contain transaction ${input.transactionId}.`,
    );
  }

  const candidate = current.entries[candidateIndex]!;
  const previousTransactionId =
    current.entries[candidateIndex - 1]
      ?.transactionId
    ?? null;
  const activeTransactionId =
    resolveHistoryJournalActiveTransactionId(
      current,
    );

  let targetTransactionId: string | null;
  let expectedTargetRevisionId: string;

  if (input.direction === 'undo') {
    if (
      activeTransactionId
      !== input.transactionId
    ) {
      throw new Error(
        `History journal active transaction ${activeTransactionId ?? '(origin)'} does not match undo candidate ${input.transactionId}.`,
      );
    }
    targetTransactionId =
      previousTransactionId;
    expectedTargetRevisionId =
      candidate.beforeRevision.revisionId;
  } else {
    if (
      activeTransactionId
      !== previousTransactionId
    ) {
      throw new Error(
        `History journal active transaction ${activeTransactionId ?? '(origin)'} is not immediately before redo candidate ${input.transactionId}.`,
      );
    }
    targetTransactionId =
      input.transactionId;
    expectedTargetRevisionId =
      candidate.afterRevision.revisionId;
  }

  if (
    expectedTargetRevisionId
    !== input.targetRevisionId
  ) {
    throw new Error(
      `History journal transaction ${input.transactionId} expects target revision ${expectedTargetRevisionId}, received ${input.targetRevisionId}.`,
    );
  }

  const manifest = cloneHistoryJournalManifest(current);
  manifest.activeRevisionId = input.targetRevisionId;
  manifest.activeTransactionId =
    targetTransactionId;
  manifest.updatedAt =
    input.updatedAt ?? new Date().toISOString();
  assertHistoryJournalManifest(manifest);

  return {
    store,
    previousManifest:
      cloneHistoryJournalManifest(current),
    manifest,
  };
}
