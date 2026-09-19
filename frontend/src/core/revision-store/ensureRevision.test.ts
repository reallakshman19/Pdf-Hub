import { describe, expect, it, vi } from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import { ensureStoredRevision } from './ensureRevision';

describe('ensureStoredRevision', () => {
  it('commits a missing content-addressed revision', async () => {
    const store = new MemoryRevisionStore({ id: 'working' });
    const source = new MemorySource({
      id: 'source',
      bytes: Uint8Array.from([1, 2, 3]),
    });

    const result = await ensureStoredRevision({
      store,
      revisionId: 'sha256:abc',
      source,
    });

    expect(result).toMatchObject({
      revisionId: 'sha256:abc',
      storeId: 'working',
      size: 3,
    });
    expect(await store.has('sha256:abc')).toBe(true);
  });

  it('reuses an existing revision when the source size agrees', async () => {
    const store = new MemoryRevisionStore({ id: 'working' });
    const source = new MemorySource({
      id: 'source',
      bytes: Uint8Array.from([4, 5]),
    });

    await store.commit({
      revisionId: 'sha256:same',
      source,
    });

    const result = await ensureStoredRevision({
      store,
      revisionId: 'sha256:same',
      source,
    });

    expect(result).toMatchObject({
      revisionId: 'sha256:same',
      size: 2,
    });
  });

  it('coalesces concurrent publication of the same revision id', async () => {
    const store = new MemoryRevisionStore({ id: 'working' });
    let releaseRead!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let firstRead = true;
    const source = new MemorySource({
      id: 'base',
      bytes: Uint8Array.from([7, 8, 9]),
    });
    const delayedSource = {
      ...source,
      id: 'delayed',
      async size() {
        return source.size();
      },
      async read(offset: number, length: number) {
        if (firstRead) {
          firstRead = false;
          await released;
        }
        return source.read(offset, length);
      },
    };
    const commit = vi.spyOn(store, 'commit');

    const first = ensureStoredRevision({
      store,
      revisionId: 'sha256:coalesced',
      source: delayedSource,
    });
    const second = ensureStoredRevision({
      store,
      revisionId: 'sha256:coalesced',
      source: delayedSource,
    });

    await Promise.resolve();
    releaseRead();

    const [firstResult, secondResult] =
      await Promise.all([first, second]);

    expect(firstResult.revisionId).toBe(
      'sha256:coalesced',
    );
    expect(secondResult.revisionId).toBe(
      'sha256:coalesced',
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('fails closed if a reused revision has a different size', async () => {
    const store = new MemoryRevisionStore({ id: 'working' });
    await store.commit({
      revisionId: 'sha256:collision',
      source: new MemorySource({
        id: 'stored',
        bytes: Uint8Array.from([1]),
      }),
    });

    await expect(
      ensureStoredRevision({
        store,
        revisionId: 'sha256:collision',
        source: new MemorySource({
          id: 'incoming',
          bytes: Uint8Array.from([1, 2]),
        }),
      }),
    ).rejects.toMatchObject({
      code: 'READ_FAILED',
    });
  });
});
