import { describe, expect, it } from 'vitest';

import { DocumentSourceError } from './errors';
import { MemorySource } from './MemorySource';

describe('MemorySource', () => {
  it('snapshots input bytes and returns caller-owned range copies', async () => {
    const input = Uint8Array.from([10, 20, 30, 40, 50]);
    const source = new MemorySource({
      id: 'memory:test',
      bytes: input,
    });

    input[1] = 99;

    expect(await source.size()).toBe(5);
    const first = await source.read(1, 3);
    expect(first).toEqual(Uint8Array.from([20, 30, 40]));

    first[0] = 77;
    expect(await source.read(1, 3)).toEqual(
      Uint8Array.from([20, 30, 40]),
    );
  });

  it('supports zero-length reads including at EOF', async () => {
    const source = new MemorySource({
      id: 'memory:zero',
      bytes: Uint8Array.from([1, 2, 3]),
    });

    expect(await source.read(1, 0)).toEqual(new Uint8Array());
    expect(await source.read(3, 0)).toEqual(new Uint8Array());
  });

  it.each([
    [-1, 1],
    [0, -1],
    [0.5, 1],
    [0, 1.5],
    [Number.MAX_SAFE_INTEGER + 1, 0],
  ])(
    'rejects invalid range offset=%s length=%s',
    async (offset, length) => {
      const source = new MemorySource({
        id: 'memory:invalid',
        bytes: Uint8Array.from([1, 2, 3]),
      });

      await expect(
        source.read(offset, length),
      ).rejects.toMatchObject({
        code: 'INVALID_RANGE',
      } satisfies Partial<DocumentSourceError>);
    },
  );

  it.each([
    [4, 0],
    [3, 1],
    [2, 2],
  ])(
    'rejects out-of-bounds range offset=%s length=%s',
    async (offset, length) => {
      const source = new MemorySource({
        id: 'memory:bounds',
        bytes: Uint8Array.from([1, 2, 3]),
      });

      await expect(
        source.read(offset, length),
      ).rejects.toMatchObject({
        code: 'OUT_OF_BOUNDS',
      } satisfies Partial<DocumentSourceError>);
    },
  );

  it('exposes immutable random-access memory capabilities', () => {
    const source = new MemorySource({
      id: 'memory:capabilities',
      bytes: new Uint8Array(),
    });

    expect(source.kind).toBe('memory');
    expect(source.capabilities).toEqual({
      randomAccess: true,
      immutableReads: true,
      persistent: false,
    });
    expect(Object.isFrozen(source.capabilities)).toBe(true);
  });
});
