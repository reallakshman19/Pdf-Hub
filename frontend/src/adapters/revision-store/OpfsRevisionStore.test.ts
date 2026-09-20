import { describe, expect, it } from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import type { DocumentSource } from '@/core/document-source/types';
import { OpfsRevisionStore } from './OpfsRevisionStore';

class FakeFileHandle {
  private bytes = new Uint8Array();

  async getFile(): Promise<File> {
    return new Blob([Uint8Array.from(this.bytes).buffer]) as File;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let staging = new Uint8Array();
    let closed = false;

    return {
      write: async (value: unknown) => {
        if (closed || !(value instanceof Uint8Array)) {
          throw new Error('Unsupported fake write');
        }
        const next = new Uint8Array(
          staging.byteLength + value.byteLength,
        );
        next.set(staging, 0);
        next.set(value, staging.byteLength);
        staging = next;
      },
      close: async () => {
        closed = true;
        this.bytes = Uint8Array.from(staging);
      },
      abort: async () => {
        closed = true;
      },
    } as unknown as FileSystemWritableFileStream;
  }
}

class FakeDirectory {
  readonly files = new Map<string, FakeFileHandle>();

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle> {
    const existing = this.files.get(name);
    if (existing) {
      return existing as unknown as FileSystemFileHandle;
    }
    if (!options?.create) {
      throw new DOMException('Missing', 'NotFoundError');
    }

    const created = new FakeFileHandle();
    this.files.set(name, created);
    return created as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) {
      throw new DOMException('Missing', 'NotFoundError');
    }
  }

  async *entries(): AsyncIterableIterator<
    [string, FileSystemHandle]
  > {
    for (const [name, handle] of this.files) {
      yield [
        name,
        handle as unknown as FileSystemHandle,
      ];
    }
  }

  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}

describe('OpfsRevisionStore', () => {
  it('commits in bounded chunks and reopens as a persistent OPFS source', async () => {
    const directory = new FakeDirectory();
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: directory.asHandle(),
      chunkBytes: 2,
    });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([1, 2, 3, 4, 5]),
    });

    const descriptor = await store.commit({
      revisionId: 'rev-1',
      source,
    });

    expect(descriptor).toEqual({
      revisionId: 'rev-1',
      sourceId: 'revision:working-opfs:rev-1',
      storeId: 'working-opfs',
      storeKind: 'opfs',
      size: 5,
      persistent: true,
    });

    const reopened = await store.open('rev-1');
    expect(reopened.kind).toBe('opfs');
    expect(reopened.capabilities.persistent).toBe(true);
    expect(await reopened.read(1, 3)).toEqual(
      Uint8Array.from([2, 3, 4]),
    );
  });

  it('rejects overwrite of an immutable revision id', async () => {
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: new FakeDirectory().asHandle(),
    });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([1]),
    });

    await store.commit({ revisionId: 'same', source });
    await expect(
      store.commit({ revisionId: 'same', source }),
    ).rejects.toMatchObject({
      code: 'REVISION_EXISTS',
    });
  });

  it('removes a failed partial revision before publishing it', async () => {
    const directory = new FakeDirectory();
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: directory.asHandle(),
      chunkBytes: 2,
    });
    let reads = 0;
    const source: DocumentSource = {
      id: 'failing',
      kind: 'memory',
      capabilities: {
        randomAccess: true,
        immutableReads: true,
        persistent: false,
      },
      async size() {
        return 4;
      },
      async read(offset, length) {
        reads += 1;
        if (reads === 2) {
          throw new Error('fixture failure');
        }
        return Uint8Array.from(
          [10, 20, 30, 40].slice(offset, offset + length),
        );
      },
    };

    await expect(
      store.commit({ revisionId: 'partial', source }),
    ).rejects.toMatchObject({
      code: 'COMMIT_FAILED',
    });
    expect(await store.has('partial')).toBe(false);
    expect(directory.files.size).toBe(0);
  });

  it('does not expose a pending revision through has/open', async () => {
    const directory = new FakeDirectory();
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: directory.asHandle(),
      chunkBytes: 2,
    });

    let releaseRead: (() => void) | null = null;
    const blocked = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let firstRead = true;
    const source: DocumentSource = {
      id: 'blocked',
      kind: 'memory',
      capabilities: {
        randomAccess: true,
        immutableReads: true,
        persistent: false,
      },
      async size() {
        return 2;
      },
      async read() {
        if (firstRead) {
          firstRead = false;
          await blocked;
        }
        return Uint8Array.from([1, 2]);
      },
    };

    const pending = store.commit({
      revisionId: 'pending',
      source,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(await store.has('pending')).toBe(false);
    await expect(
      store.listRevisionIds(),
    ).resolves.toEqual([]);
    await expect(store.open('pending')).rejects.toMatchObject({
      code: 'REVISION_NOT_FOUND',
    });
    await expect(
      store.commit({
        revisionId: 'pending',
        source: new MemorySource({
          id: 'second',
          bytes: Uint8Array.from([9]),
        }),
      }),
    ).rejects.toMatchObject({
      code: 'REVISION_EXISTS',
    });

    releaseRead?.();
    await pending;
    expect(await store.has('pending')).toBe(true);
    await expect(
      store.listRevisionIds(),
    ).resolves.toEqual(['pending']);
  });

  it('preserves cancellation and cleans the unpublished file', async () => {
    const directory = new FakeDirectory();
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: directory.asHandle(),
      chunkBytes: 2,
    });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([1, 2, 3]),
    });
    const controller = new AbortController();
    controller.abort('cancel fixture');

    await expect(
      store.commit({
        revisionId: 'cancelled',
        source,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });
    expect(await store.has('cancelled')).toBe(false);
    expect(directory.files.size).toBe(0);
  });

  it('removes revisions and clears only revision files', async () => {
    const directory = new FakeDirectory();
    const store = new OpfsRevisionStore({
      id: 'working-opfs',
      directory: directory.asHandle(),
    });
    const source = new MemorySource({
      id: 'input',
      bytes: Uint8Array.from([4, 5]),
    });

    await store.commit({ revisionId: 'b', source });
    await store.commit({ revisionId: 'a', source });
    await expect(
      store.listRevisionIds(),
    ).resolves.toEqual(['a', 'b']);

    await store.remove('a');
    expect(await store.has('a')).toBe(false);
    expect(await store.has('b')).toBe(true);

    await store.clear();
    expect(await store.has('b')).toBe(false);
  });
});
