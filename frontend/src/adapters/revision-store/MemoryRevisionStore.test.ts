import { describe, expect, it } from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import type { DocumentSource } from '@/core/document-source/types';
import { MemoryRevisionStore } from './MemoryRevisionStore';

describe('MemoryRevisionStore', () => {
  it('commits immutable revisions and reopens caller-owned ranges', async () => {
    const store = new MemoryRevisionStore({ id: 'working-memory' });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });

    const descriptor = await store.commit({
      revisionId: 'rev-1',
      source,
    });

    expect(descriptor).toEqual({
      revisionId: 'rev-1',
      sourceId: 'revision:working-memory:rev-1',
      storeId: 'working-memory',
      storeKind: 'memory',
      size: 4,
      persistent: false,
    });
    expect(Object.isFrozen(descriptor)).toBe(true);

    const reopened = await store.open('rev-1');
    const first = await reopened.read(1, 2);
    expect(first).toEqual(Uint8Array.from([2, 3]));
    first[0] = 99;
    expect(await reopened.read(1, 2)).toEqual(
      Uint8Array.from([2, 3]),
    );
  });

  it('rejects overwrite of a committed revision id', async () => {
    const store = new MemoryRevisionStore({ id: 'working-memory' });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([1]),
    });

    await store.commit({ revisionId: 'same', source });
    await expect(
      store.commit({ revisionId: 'same', source }),
    ).rejects.toMatchObject({
      code: 'REVISION_EXISTS',
      revisionId: 'same',
    });
  });

  it('does not publish a revision when materialization fails', async () => {
    const store = new MemoryRevisionStore({ id: 'working-memory' });
    const failing: DocumentSource = {
      id: 'failing-source',
      kind: 'memory',
      capabilities: {
        randomAccess: true,
        immutableReads: true,
        persistent: false,
      },
      async size() {
        return 4;
      },
      async read() {
        throw new Error('fixture failure');
      },
    };

    await expect(
      store.commit({
        revisionId: 'failed',
        source: failing,
      }),
    ).rejects.toThrow('fixture failure');
    expect(await store.has('failed')).toBe(false);
  });

  it('removes individual revisions and clears the store', async () => {
    const store = new MemoryRevisionStore({ id: 'working-memory' });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([7, 8]),
    });

    await store.commit({ revisionId: 'a', source });
    await store.commit({ revisionId: 'b', source });
    await store.remove('a');

    expect(await store.has('a')).toBe(false);
    expect(await store.has('b')).toBe(true);

    await store.clear();
    expect(await store.has('b')).toBe(false);
    await expect(store.open('b')).rejects.toMatchObject({
      code: 'REVISION_NOT_FOUND',
    });
  });
});
