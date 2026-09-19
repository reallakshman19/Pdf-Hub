import { describe, expect, it } from 'vitest';

import { OpfsSource } from './OpfsSource';

function fileHandle(
  initial: Uint8Array,
): {
  handle: FileSystemFileHandle;
  replace(bytes: Uint8Array): void;
} {
  let current = Uint8Array.from(initial);
  const handle = {
    async getFile() {
      return new Blob([
        Uint8Array.from(current),
      ]) as File;
    },
  } as FileSystemFileHandle;

  return {
    handle,
    replace(bytes) {
      current = Uint8Array.from(bytes);
    },
  };
}

describe('OpfsSource', () => {
  it('reads exact caller-owned ranges and declares persistence', async () => {
    const fixture = fileHandle(
      Uint8Array.from([10, 20, 30, 40]),
    );
    const source = new OpfsSource({
      id: 'opfs:rev-1',
      handle: fixture.handle,
      expectedSize: 4,
    });

    expect(await source.size()).toBe(4);
    const first = await source.read(1, 2);
    expect(first).toEqual(Uint8Array.from([20, 30]));
    first[0] = 99;
    expect(await source.read(1, 2)).toEqual(
      Uint8Array.from([20, 30]),
    );
    expect(source.capabilities).toEqual({
      randomAccess: true,
      immutableReads: true,
      persistent: true,
    });
  });

  it('fails closed if the immutable backing file size changes', async () => {
    const fixture = fileHandle(
      Uint8Array.from([1, 2, 3]),
    );
    const source = new OpfsSource({
      id: 'opfs:rev-1',
      handle: fixture.handle,
      expectedSize: 3,
    });

    fixture.replace(Uint8Array.from([1, 2]));

    await expect(source.size()).rejects.toMatchObject({
      code: 'READ_FAILED',
    });
    await expect(source.read(0, 1)).rejects.toMatchObject({
      code: 'READ_FAILED',
    });
  });
});
