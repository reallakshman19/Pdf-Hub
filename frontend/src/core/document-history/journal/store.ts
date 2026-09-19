import type {
  HistoryJournalManifest,
} from './types';

export interface HistoryJournalStoreCapabilities {
  readonly persistent: boolean;
}

export interface HistoryJournalStore {
  readonly id: string;
  readonly capabilities: Readonly<HistoryJournalStoreCapabilities>;

  /**
   * Atomically replace one manifest. A rejected save must leave the previously
   * visible manifest unchanged so document transactions can roll back safely.
   */
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
