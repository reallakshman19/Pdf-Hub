import type {
  HistoryJournalStore,
} from './store';

const stores = new Map<string, HistoryJournalStore>();

export function registerHistoryJournalStore(
  store: HistoryJournalStore,
): void {
  const existing = stores.get(store.id);
  if (existing && existing !== store) {
    throw new Error(
      `A different HistoryJournalStore is already registered for id ${store.id}.`,
    );
  }
  stores.set(store.id, store);
}

export function resolveHistoryJournalStore(
  storeId: string,
): HistoryJournalStore | null {
  return stores.get(storeId) ?? null;
}

export function releaseHistoryJournalStore(
  storeId: string | null | undefined,
): void {
  if (!storeId) return;
  stores.delete(storeId);
}

export function clearHistoryJournalStoreRegistryForTests(): void {
  stores.clear();
}
