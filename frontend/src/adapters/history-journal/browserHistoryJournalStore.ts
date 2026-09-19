import {
  IndexedDbHistoryJournalStore,
} from './IndexedDbHistoryJournalStore';
import {
  MemoryHistoryJournalStore,
} from './MemoryHistoryJournalStore';
import type {
  HistoryJournalStore,
} from '@/core/document-history/journal/store';
import {
  registerHistoryJournalStore,
  resolveHistoryJournalStore,
} from '@/core/document-history/journal/registry';

export const PRIMARY_HISTORY_JOURNAL_STORE_ID =
  'browser-history-journal-v1';

export interface BrowserHistoryJournalStoreSelection {
  readonly store: HistoryJournalStore;
  readonly backend: 'indexeddb' | 'memory';
  readonly fallbackReason?: string;
}

export interface BrowserHistoryJournalStoreOptions {
  readonly storeId?: string;
  readonly createIndexedDbStore?: (
    storeId: string,
  ) => IndexedDbHistoryJournalStore;
}

const pendingSelections = new Map<
  string,
  Promise<BrowserHistoryJournalStoreSelection>
>();

export async function getBrowserHistoryJournalStore(
  options: BrowserHistoryJournalStoreOptions = {},
): Promise<BrowserHistoryJournalStoreSelection> {
  const storeId =
    options.storeId
    ?? PRIMARY_HISTORY_JOURNAL_STORE_ID;
  const existing =
    resolveHistoryJournalStore(storeId);
  if (existing) {
    return selectionForExisting(existing);
  }

  const pending = pendingSelections.get(storeId);
  if (pending) return pending;

  const selection = selectStore(
    storeId,
    options,
  );
  pendingSelections.set(storeId, selection);
  try {
    return await selection;
  } finally {
    if (pendingSelections.get(storeId) === selection) {
      pendingSelections.delete(storeId);
    }
  }
}

async function selectStore(
  storeId: string,
  options: BrowserHistoryJournalStoreOptions,
): Promise<BrowserHistoryJournalStoreSelection> {
  try {
    if (typeof indexedDB === 'undefined') {
      throw new Error(
        'IndexedDB is unavailable.',
      );
    }

    const store =
      options.createIndexedDbStore?.(storeId)
      ?? new IndexedDbHistoryJournalStore({
        id: storeId,
      });
    await store.probe();
    registerHistoryJournalStore(store);
    return {
      store,
      backend: 'indexeddb',
    };
  } catch (error) {
    const concurrent =
      resolveHistoryJournalStore(storeId);
    if (concurrent) {
      return selectionForExisting(concurrent);
    }

    const store = new MemoryHistoryJournalStore({
      id: storeId,
    });
    registerHistoryJournalStore(store);
    return {
      store,
      backend: 'memory',
      fallbackReason:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

function selectionForExisting(
  store: HistoryJournalStore,
): BrowserHistoryJournalStoreSelection {
  return {
    store,
    backend: store.capabilities.persistent
      ? 'indexeddb'
      : 'memory',
  };
}
