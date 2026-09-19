import {
  resolveHistoryJournalStore,
} from './registry';
import type {
  HistoryJournalStore,
} from './store';
import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  type HistoryJournalManifest,
} from './types';

export interface PrepareHistoryJournalNavigationInput {
  journalStoreId: string | null;
  journalId: string | null;
  revisionStoreId: string | null;
  currentRevisionId: string | null;
  targetRevisionId: string | null;
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

  const knownRevisionIds = new Set([
    current.originalRevisionId,
    ...current.entries.flatMap((entry) => [
      entry.beforeRevision.revisionId,
      entry.afterRevision.revisionId,
    ]),
    ...current.checkpoints.map(
      (checkpoint) => checkpoint.revision.revisionId,
    ),
  ]);
  if (!knownRevisionIds.has(input.targetRevisionId)) {
    throw new Error(
      `History journal does not contain target revision ${input.targetRevisionId}.`,
    );
  }

  const manifest = cloneHistoryJournalManifest(current);
  manifest.activeRevisionId = input.targetRevisionId;
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
