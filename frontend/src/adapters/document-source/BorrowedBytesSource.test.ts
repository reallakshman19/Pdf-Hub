import { describe, expect, it } from 'vitest';

import { BorrowedBytesSource } from './BorrowedBytesSource';

describe('BorrowedBytesSource', () => {
  it('borrows the full input without a construction clone and returns owned ranges', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const source = new BorrowedBytesSource({
      id: 'borrowed:mutation',
      bytes,
    });

    expect(await source.size()).toBe(4);

    const range = await source.read(1, 2);
    expect(range).toEqual(Uint8Array.from([2, 3]));
    range[0] = 99;
    expect(await source.read(1, 2)).toEqual(
      Uint8Array.from([2, 3]),
    );

    bytes[1] = 8;
    expect(await source.read(1, 1)).toEqual(
      Uint8Array.from([8]),
    );
  });

  it('supports exact zero-length and bounds semantics', async () => {
    const source = new BorrowedBytesSource({
      id: 'borrowed:bounds',
      bytes: Uint8Array.from([1, 2]),
    });

    expect(await source.read(2, 0)).toEqual(
      new Uint8Array(),
    );
    await expect(source.read(2, 1)).rejects.toMatchObject({
      code: 'OUT_OF_BOUNDS',
    });
  });

  it('declares short-lived memory capabilities', () => {
    const source = new BorrowedBytesSource({
      id: 'borrowed:capabilities',
      bytes: new Uint8Array(),
    });

    expect(source.capabilities).toEqual({
      randomAccess: true,
      immutableReads: true,
      persistent: false,
    });
    expect(Object.isFrozen(source.capabilities)).toBe(true);
  });
});
