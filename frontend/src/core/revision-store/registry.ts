import type { WorkingRevisionStore } from './types';

const stores = new Map<string, WorkingRevisionStore>();

export class WorkingRevisionStoreRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkingRevisionStoreRegistryError';
  }
}

export function registerWorkingRevisionStore(
  store: WorkingRevisionStore,
): void {
  const existing = stores.get(store.id);
  if (existing && existing !== store) {
    throw new WorkingRevisionStoreRegistryError(
      `A different WorkingRevisionStore is already registered for id ${store.id}.`,
    );
  }
  stores.set(store.id, store);
}

export function resolveWorkingRevisionStore(
  storeId: string,
): WorkingRevisionStore | null {
  return stores.get(storeId) ?? null;
}

export function releaseWorkingRevisionStore(
  storeId: string | null | undefined,
): void {
  if (!storeId) return;
  stores.delete(storeId);
}

/** Test-only reset for the process-local runtime registry. */
export function clearWorkingRevisionStoreRegistryForTests(): void {
  stores.clear();
}
