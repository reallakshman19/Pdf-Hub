import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryRevisionStore } from './MemoryRevisionStore';
import type { WorkingRevisionStore } from '@/core/revision-store/types';
import {
  getBrowserWorkingRevisionStore,
} from './browserWorkingRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  resolveWorkingRevisionStore,
} from '@/core/revision-store/registry';

function fakeOpfsStore(
  id: string,
): WorkingRevisionStore & { readonly kind: 'opfs' } {
  const memory = new MemoryRevisionStore({ id });
  return {
    id,
    kind: 'opfs',
    capabilities: Object.freeze({
      persistent: true,
      atomicCommit: true,
      randomAccess: true,
    }),
    commit: (input) => memory.commit(input),
    open: (revisionId) => memory.open(revisionId),
    has: (revisionId) => memory.has(revisionId),
    remove: (revisionId) => memory.remove(revisionId),
    clear: () => memory.clear(),
  };
}

describe('browser working revision store selection', () => {
  beforeEach(() => {
    clearWorkingRevisionStoreRegistryForTests();
  });

  it('prefers and registers an OPFS store', async () => {
    const opfs = fakeOpfsStore('browser-store');

    const selection = await getBrowserWorkingRevisionStore({
      storeId: 'browser-store',
      createOpfsStore: async () => opfs,
    });

    expect(selection.backend).toBe('opfs');
    expect(selection.store).toBe(opfs);
    expect(
      resolveWorkingRevisionStore('browser-store'),
    ).toBe(opfs);
  });

  it('coalesces concurrent initialization of the same store id', async () => {
    let releaseCreate!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let creates = 0;
    const opfs = fakeOpfsStore('concurrent-store');
    const createOpfsStore = async () => {
      creates += 1;
      await released;
      return opfs;
    };

    const first = getBrowserWorkingRevisionStore({
      storeId: 'concurrent-store',
      createOpfsStore,
    });
    const second = getBrowserWorkingRevisionStore({
      storeId: 'concurrent-store',
      createOpfsStore,
    });

    releaseCreate();

    const [firstSelection, secondSelection] =
      await Promise.all([first, second]);

    expect(creates).toBe(1);
    expect(secondSelection.store).toBe(
      firstSelection.store,
    );
  });

  it('falls back to memory when OPFS initialization fails', async () => {
    const selection = await getBrowserWorkingRevisionStore({
      storeId: 'fallback-store',
      createOpfsStore: async () => {
        throw new Error('OPFS blocked');
      },
    });

    expect(selection.backend).toBe('memory');
    expect(selection.store.kind).toBe('memory');
    expect(selection.fallbackReason).toBe('OPFS blocked');
  });

  it('reuses the registered store instead of reinitializing OPFS', async () => {
    let creates = 0;
    const first = await getBrowserWorkingRevisionStore({
      storeId: 'reuse-store',
      createOpfsStore: async (id) => {
        creates += 1;
        return new MemoryRevisionStore({ id });
      },
    });
    const second = await getBrowserWorkingRevisionStore({
      storeId: 'reuse-store',
      createOpfsStore: async () => {
        creates += 1;
        throw new Error('should not run');
      },
    });

    expect(second.store).toBe(first.store);
    expect(creates).toBe(1);
  });
});
