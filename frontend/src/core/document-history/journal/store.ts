import type {
  HistoryJournalManifest,
} from './types';

export interface HistoryJournalStoreCapabilities {
  readonly persistent: boolean;
}

export interface HistoryJournalStore {
  readonly id: string;
  readonly capabilities: Readonly<HistoryJournalStoreCapabilities>;

  save(
    manifest: HistoryJournalManifest,
  ): Promise<void>;
  load(
    journalId: string,
  ): Promise<HistoryJournalManifest | null>;
  listByOriginalRevision(
    originalRevisionId: string,
  ): Promise<HistoryJournalManifest[]>;
  remove(
    journalId: string,
  ): Promise<void>;
}
