import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
} from 'idb';

import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  type HistoryJournalManifest,
} from '@/core/document-history/journal/types';

interface HistoryJournalDb extends DBSchema {
  manifests: {
    key: string;
    value: HistoryJournalManifest;
    indexes: {
      'by-originalRevisionId': string;
    };
  };
}

export class IndexedDbHistoryJournalStore
implements HistoryJournalStore {
  readonly id: string;
  readonly capabilities = Object.freeze({
    persistent: true,
  });

  private readonly dbName: string;
  private dbPromise: Promise<
    IDBPDatabase<HistoryJournalDb>
  > | null = null;

  constructor(input: {
    id: string;
    dbName?: string;
  }) {
    if (!input.id.trim()) {
      throw new Error(
        'HistoryJournalStore id must be non-empty.',
      );
    }
    this.id = input.id;
    this.dbName =
      input.dbName
      ?? `pdf-hub-history-journal-${input.id}`;
  }

  async probe(): Promise<void> {
    await this.db();
  }

  async save(
    manifest: HistoryJournalManifest,
  ): Promise<void> {
    assertHistoryJournalManifest(manifest);
    const db = await this.db();
    await db.put(
      'manifests',
      cloneHistoryJournalManifest(manifest),
    );
  }

  async load(
    journalId: string,
  ): Promise<HistoryJournalManifest | null> {
    const db = await this.db();
    const manifest = await db.get(
      'manifests',
      journalId,
    );
    return manifest
      ? cloneHistoryJournalManifest(manifest)
      : null;
  }

  async listByOriginalRevision(
    originalRevisionId: string,
  ): Promise<HistoryJournalManifest[]> {
    const db = await this.db();
    const manifests = await db.getAllFromIndex(
      'manifests',
      'by-originalRevisionId',
      originalRevisionId,
    );
    return manifests.map(
      cloneHistoryJournalManifest,
    );
  }

  async remove(journalId: string): Promise<void> {
    const db = await this.db();
    await db.delete('manifests', journalId);
  }

  private db(): Promise<IDBPDatabase<HistoryJournalDb>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<HistoryJournalDb>(
        this.dbName,
        1,
        {
          upgrade(db) {
            const store = db.createObjectStore(
              'manifests',
              {
                keyPath: 'journalId',
              },
            );
            store.createIndex(
              'by-originalRevisionId',
              'originalRevisionId',
              { unique: false },
            );
          },
        },
      );
    }
    return this.dbPromise;
  }
}
