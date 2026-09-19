import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import {
  clearHistoryJournalStoreRegistryForTests,
  registerHistoryJournalStore,
  releaseHistoryJournalStore,
  resolveHistoryJournalStore,
} from '../registry';

describe('history journal store registry', () => {
  beforeEach(() => {
    clearHistoryJournalStoreRegistryForTests();
  });

  it('registers, resolves and releases stores by identity', () => {
    const store = new MemoryHistoryJournalStore({
      id: 'journal-registry',
    });

    registerHistoryJournalStore(store);
    expect(
      resolveHistoryJournalStore(store.id),
    ).toBe(store);

    releaseHistoryJournalStore(store.id);
    expect(
      resolveHistoryJournalStore(store.id),
    ).toBeNull();
  });

  it('rejects a different store under an existing id', () => {
    registerHistoryJournalStore(
      new MemoryHistoryJournalStore({
        id: 'journal-registry',
      }),
    );

    expect(() =>
      registerHistoryJournalStore(
        new MemoryHistoryJournalStore({
          id: 'journal-registry',
        }),
      ),
    ).toThrow(/different HistoryJournalStore/);
  });
});
