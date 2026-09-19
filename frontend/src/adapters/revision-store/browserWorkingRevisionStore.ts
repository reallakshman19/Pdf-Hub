import { MemoryRevisionStore } from './MemoryRevisionStore';
import { OpfsRevisionStore } from './OpfsRevisionStore';
import type { WorkingRevisionStore } from '@/core/revision-store/types';
import {
  registerWorkingRevisionStore,
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';

export const PRIMARY_WORKING_REVISION_STORE_ID =
  'browser-working-revisions-v1';

export interface BrowserWorkingRevisionStoreSelection {
  readonly store: WorkingRevisionStore;
  readonly backend: 'opfs' | 'memory';
  readonly fallbackReason?: string;
}

type OpfsWorkingRevisionStore =
  WorkingRevisionStore & { readonly kind: 'opfs' };

export interface BrowserWorkingRevisionStoreOptions {
  readonly storeId?: string;
  readonly createOpfsStore?: (
    storeId: string,
  ) => Promise<OpfsWorkingRevisionStore>;
}

const pendingSelections = new Map<
  string,
  Promise<BrowserWorkingRevisionStoreSelection>
>();

/**
 * Resolve one process-local browser working-revision store.
 *
 * OPFS is preferred. Initialization failures fall back to the bounded in-memory
 * implementation so unsupported/private browser modes keep current behavior.
 */
export async function getBrowserWorkingRevisionStore(
  options: BrowserWorkingRevisionStoreOptions = {},
): Promise<BrowserWorkingRevisionStoreSelection> {
  const storeId =
    options.storeId ?? PRIMARY_WORKING_REVISION_STORE_ID;
  const existing = resolveWorkingRevisionStore(storeId);
  if (existing) {
    return selectionForExisting(existing);
  }

  const pending = pendingSelections.get(storeId);
  if (pending) return pending;

  const selection = createBrowserWorkingRevisionStore(
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

async function createBrowserWorkingRevisionStore(
  storeId: string,
  options: BrowserWorkingRevisionStoreOptions,
): Promise<BrowserWorkingRevisionStoreSelection> {
  try {
    const createOpfsStore =
      options.createOpfsStore
      ?? (async (id: string) =>
        OpfsRevisionStore.create({ id }));
    const opfsStore = await createOpfsStore(storeId);
    registerWorkingRevisionStore(opfsStore);
    return {
      store: opfsStore,
      backend: 'opfs',
    };
  } catch (error) {
    const concurrent = resolveWorkingRevisionStore(storeId);
    if (concurrent) {
      return selectionForExisting(concurrent);
    }

    const memoryStore = new MemoryRevisionStore({
      id: storeId,
    });
    registerWorkingRevisionStore(memoryStore);
    return {
      store: memoryStore,
      backend: 'memory',
      fallbackReason:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

function selectionForExisting(
  store: WorkingRevisionStore,
): BrowserWorkingRevisionStoreSelection {
  return {
    store,
    backend: store.kind,
  };
}
