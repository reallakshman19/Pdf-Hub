import { afterEach, describe, expect, it } from 'vitest';

import {
  clearHistoryJournalStoreRegistryForTests,
  resolveHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import {
  getBrowserHistoryJournalStore,
} from '../browserHistoryJournalStore';

afterEach(() => {
  clearHistoryJournalStoreRegistryForTests();
});

function fakePersistentStore(
  id: string,
  probe: () => Promise<void>,
): HistoryJournalStore & { probe(): Promise<void> } {
  return {
    id,
    capabilities: Object.freeze({
      persistent: true,
    }),
    probe,
    async save() {},
    async load() { return null; },
    async listByOriginalRevision() { return []; },
    async remove() {},
  };
}

describe('browser history journal store selection', () => {
  it('registers a persistent IndexedDB-compatible store after probe', async () => {
    const store = fakePersistentStore(
      'history-persistent',
      async () => {},
    );

    const selection =
      await getBrowserHistoryJournalStore({
        storeId: store.id,
        createIndexedDbStore: () => store,
      });

    expect(selection).toMatchObject({
      store,
      backend: 'indexeddb',
    });
    expect(
      resolveHistoryJournalStore(store.id),
    ).toBe(store);
  });

  it('falls back to memory when persistent store probing fails', async () => {
    const selection =
      await getBrowserHistoryJournalStore({
        storeId: 'history-fallback',
        createIndexedDbStore: (id) =>
          fakePersistentStore(
            id,
            async () => {
              throw new Error('blocked');
            },
          ),
      });

    expect(selection.backend).toBe('memory');
    expect(selection.store.capabilities.persistent).toBe(
      false,
    );
    expect(selection.fallbackReason).toMatch(/blocked/);
  });
});
