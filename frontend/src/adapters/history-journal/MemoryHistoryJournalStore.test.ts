import { describe, expect, it } from 'vitest';

import {
  createInitialHistoryJournalManifest,
} from '@/core/document-history/journal/types';
import { MemoryHistoryJournalStore } from '../MemoryHistoryJournalStore';

describe('MemoryHistoryJournalStore', () => {
  it('round-trips, lists and removes cloned manifests', async () => {
    const store = new MemoryHistoryJournalStore({
      id: 'memory-history',
    });
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-memory',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    await store.save(manifest);
    const other =
      createInitialHistoryJournalManifest({
        journalId: 'history-a',
        revisionStoreId: 'revisions',
        revisionId: 'sha256:other',
        fileName: 'other.pdf',
      });
    await store.save(other);
    manifest.fileName = 'mutated-after-save.pdf';

    const loaded = await store.load('history-memory');
    expect(loaded?.fileName).toBe('fixture.pdf');

    if (loaded) {
      loaded.fileName = 'mutated-after-load.pdf';
    }
    await expect(
      store.load('history-memory'),
    ).resolves.toMatchObject({
      fileName: 'fixture.pdf',
    });

    await expect(
      store.listByOriginalRevision('sha256:initial'),
    ).resolves.toHaveLength(1);
    await expect(
      store.listByOriginalRevision('sha256:missing'),
    ).resolves.toEqual([]);
    await expect(
      store.listAll(),
    ).resolves.toMatchObject([
      { journalId: 'history-a' },
      { journalId: 'history-memory' },
    ]);

    const all = await store.listAll();
    all[0]!.fileName = 'mutated-list.pdf';
    await expect(
      store.load('history-a'),
    ).resolves.toMatchObject({
      fileName: 'other.pdf',
    });

    await store.remove('history-memory');
    await expect(
      store.load('history-memory'),
    ).resolves.toBeNull();
  });
});
