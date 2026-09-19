import type { PdfCommand } from '@/core/commands/types';
import type {
  HistoryReplayBarrier,
  HistoryReplayDisposition,
} from '../replayability';
import {
  assertHistoryStateCheckpointPayload,
  type HistoryStateCheckpointPayload,
} from './stateCheckpoint';

export const HISTORY_JOURNAL_SCHEMA_VERSION = 1 as const;

export interface HistoryJournalRevisionRef {
  storeId: string;
  revisionId: string;
}

export type HistoryJournalCheckpointKind =
  | 'ADMISSION'
  | 'BARRIER'
  | 'PERIODIC';

export interface HistoryJournalCheckpoint {
  checkpointId: string;
  kind: HistoryJournalCheckpointKind;
  revision: HistoryJournalRevisionRef;
  createdAt: string;
  transactionId?: string;
  statePayload?: HistoryStateCheckpointPayload;
}

export interface HistoryJournalEntry {
  entryId: string;
  transactionId: string;
  command: PdfCommand;
  disposition: HistoryReplayDisposition;
  barriers: HistoryReplayBarrier[];
  beforeRevision: HistoryJournalRevisionRef;
  afterRevision: HistoryJournalRevisionRef;
  createdAt: string;
}

export interface HistoryJournalManifestV1 {
  schemaVersion: typeof HISTORY_JOURNAL_SCHEMA_VERSION;
  journalId: string;
  revisionStoreId: string;
  originalRevisionId: string;
  activeRevisionId: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  checkpoints: HistoryJournalCheckpoint[];
  entries: HistoryJournalEntry[];
}

export type HistoryJournalManifest = HistoryJournalManifestV1;

export function createHistoryJournalId(): string {
  const cryptoObject = globalThis.crypto;
  if (
    cryptoObject
    && typeof cryptoObject.randomUUID === 'function'
  ) {
    return `history-${cryptoObject.randomUUID()}`;
  }

  return `history-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createInitialHistoryJournalManifest(input: {
  journalId: string;
  revisionStoreId: string;
  revisionId: string;
  fileName: string;
  createdAt?: string;
}): HistoryJournalManifestV1 {
  const createdAt =
    input.createdAt ?? new Date().toISOString();
  const revision: HistoryJournalRevisionRef = {
    storeId: input.revisionStoreId,
    revisionId: input.revisionId,
  };

  const manifest: HistoryJournalManifestV1 = {
    schemaVersion: HISTORY_JOURNAL_SCHEMA_VERSION,
    journalId: input.journalId,
    revisionStoreId: input.revisionStoreId,
    originalRevisionId: input.revisionId,
    activeRevisionId: input.revisionId,
    fileName: input.fileName,
    createdAt,
    updatedAt: createdAt,
    checkpoints: [{
      checkpointId: `${input.journalId}:admission`,
      kind: 'ADMISSION',
      revision,
      createdAt,
    }],
    entries: [],
  };

  assertHistoryJournalManifest(manifest);
  return manifest;
}

export function assertHistoryJournalManifest(
  manifest: HistoryJournalManifest,
): void {
  if (manifest.schemaVersion !== HISTORY_JOURNAL_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported history journal schema version: ${manifest.schemaVersion}`,
    );
  }

  for (const [name, value] of [
    ['journalId', manifest.journalId],
    ['revisionStoreId', manifest.revisionStoreId],
    ['originalRevisionId', manifest.originalRevisionId],
    ['activeRevisionId', manifest.activeRevisionId],
    ['fileName', manifest.fileName],
    ['createdAt', manifest.createdAt],
    ['updatedAt', manifest.updatedAt],
  ] as const) {
    if (!value || value.trim().length === 0) {
      throw new Error(
        `History journal ${name} must be non-empty.`,
      );
    }
  }

  if (
    !Number.isFinite(Date.parse(manifest.createdAt))
    || !Number.isFinite(Date.parse(manifest.updatedAt))
  ) {
    throw new Error(
      'History journal timestamps must be ISO-compatible dates.',
    );
  }

  if (!Array.isArray(manifest.checkpoints)) {
    throw new Error(
      'History journal checkpoints must be an array.',
    );
  }
  if (!Array.isArray(manifest.entries)) {
    throw new Error(
      'History journal entries must be an array.',
    );
  }

  for (const checkpoint of manifest.checkpoints) {
    assertRevisionRef(
      checkpoint.revision,
      manifest.revisionStoreId,
    );
    if (checkpoint.statePayload) {
      if (checkpoint.kind === 'ADMISSION') {
        throw new Error(
          'Admission checkpoints cannot contain statePayload.',
        );
      }
      assertHistoryStateCheckpointPayload(
        checkpoint.statePayload,
      );
    }
  }

  for (const entry of manifest.entries) {
    assertRevisionRef(
      entry.beforeRevision,
      manifest.revisionStoreId,
    );
    assertRevisionRef(
      entry.afterRevision,
      manifest.revisionStoreId,
    );
  }
}

function assertRevisionRef(
  revision: HistoryJournalRevisionRef,
  expectedStoreId: string,
): void {
  if (
    !revision.storeId
    || !revision.revisionId
  ) {
    throw new Error(
      'History journal revision references require storeId and revisionId.',
    );
  }
  if (revision.storeId !== expectedStoreId) {
    throw new Error(
      `History journal revision store ${revision.storeId} does not match manifest store ${expectedStoreId}.`,
    );
  }
}

export function cloneHistoryJournalManifest(
  manifest: HistoryJournalManifest,
): HistoryJournalManifest {
  assertHistoryJournalManifest(manifest);
  return JSON.parse(
    JSON.stringify(manifest),
  ) as HistoryJournalManifest;
}
