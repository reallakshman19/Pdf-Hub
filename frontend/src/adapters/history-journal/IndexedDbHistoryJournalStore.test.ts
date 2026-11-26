import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialHistoryJournalManifest, type HistoryJournalManifest } from '@/core/document-history/journal/types';
import { IndexedDbHistoryJournalStore } from './IndexedDbHistoryJournalStore';

const manifestsStore = new Map<string, HistoryJournalManifest>();

vi.mock('idb', () => ({
  openDB: vi.fn(async (_dbName: string, _version: number, opts?: { upgrade?: (db: unknown) => void }) => {
    const createIndex = vi.fn();
    opts?.upgrade?.({
      createObjectStore: vi.fn(() => ({ createIndex })),
    });
    return {
      put: vi.fn(async (_storeName: string, value: HistoryJournalManifest) => {
        manifestsStore.set(value.journalId, value);
      }),
      get: vi.fn(async (_storeName: string, journalId: string) => manifestsStore.get(journalId)),
      getAllFromIndex: vi.fn(async (_storeName: string, _indexName: string, originalRevisionId: string) =>
        [...manifestsStore.values()].filter((item) => item.originalRevisionId === originalRevisionId)),
      getAll: vi.fn(async () => [...manifestsStore.values()]),
      delete: vi.fn(async (_storeName: string, journalId: string) => {
        manifestsStore.delete(journalId);
      }),
    };
  }),
}));

describe('IndexedDbHistoryJournalStore', () => {
  beforeEach(() => {
    manifestsStore.clear();
  });

  it('rejects empty ids and probes, saves, loads, lists, and removes cloned manifests', async () => {
    expect(() => new IndexedDbHistoryJournalStore({ id: '   ' })).toThrow('non-empty');

    const store = new IndexedDbHistoryJournalStore({ id: 'test-journal' });
    await store.probe();

    const m1 = createInitialHistoryJournalManifest({
      journalId: 'j-b',
      revisionStoreId: 'revs',
      revisionId: 'sha256:rev1',
      fileName: 'doc1.pdf',
    });
    const m2 = createInitialHistoryJournalManifest({
      journalId: 'j-a',
      revisionStoreId: 'revs',
      revisionId: 'sha256:rev2',
      fileName: 'doc2.pdf',
    });

    await store.save(m1);
    await store.save(m2);

    const loaded = await store.load('j-b');
    expect(loaded?.fileName).toBe('doc1.pdf');
    expect(await store.load('missing')).toBeNull();

    await expect(store.listByOriginalRevision('sha256:rev1')).resolves.toHaveLength(1);
    const all = await store.listAll();
    expect(all.map((m) => m.journalId)).toEqual(['j-a', 'j-b']);

    await store.remove('j-a');
    await expect(store.listAll()).resolves.toHaveLength(1);
  });
});
