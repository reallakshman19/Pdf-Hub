import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  type HistoryJournalManifest,
} from '@/core/document-history/journal/types';

export class MemoryHistoryJournalStore
implements HistoryJournalStore {
  readonly id: string;
  readonly capabilities = Object.freeze({
    persistent: false,
  });

  private readonly manifests =
    new Map<string, HistoryJournalManifest>();

  constructor(input: { id: string }) {
    if (!input.id.trim()) {
      throw new Error(
        'HistoryJournalStore id must be non-empty.',
      );
    }
    this.id = input.id;
  }

  async save(
    manifest: HistoryJournalManifest,
  ): Promise<void> {
    assertHistoryJournalManifest(manifest);
    this.manifests.set(
      manifest.journalId,
      cloneHistoryJournalManifest(manifest),
    );
  }

  async load(
    journalId: string,
  ): Promise<HistoryJournalManifest | null> {
    const manifest = this.manifests.get(journalId);
    return manifest
      ? cloneHistoryJournalManifest(manifest)
      : null;
  }

  async listByOriginalRevision(
    originalRevisionId: string,
  ): Promise<HistoryJournalManifest[]> {
    return [...this.manifests.values()]
      .filter(
        (manifest) =>
          manifest.originalRevisionId
          === originalRevisionId,
      )
      .map(cloneHistoryJournalManifest);
  }

  async remove(journalId: string): Promise<void> {
    this.manifests.delete(journalId);
  }
}
