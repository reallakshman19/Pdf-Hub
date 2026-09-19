import { describe, expect, it } from 'vitest';

import { BrowserFileSource } from './BrowserFileSource';
import type { BrowserFileReadable } from './BrowserFileSource';
import type { DocumentSourceError } from '@/core/document-source/errors';

function readableBlob(
  bytes: Uint8Array,
): BrowserFileReadable {
  return {
    size: bytes.byteLength,
    slice(start = 0, end = bytes.byteLength) {
      const copy = bytes.slice(start, end);
      return {
        arrayBuffer: async () =>
          Uint8Array.from(copy).buffer,
      } as Blob;
    },
  };
}

describe('BrowserFileSource', () => {
  it('materializes only the requested Blob/File slice', async () => {
    const sliceCalls: Array<[number | undefined, number | undefined]> = [];
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const file: BrowserFileReadable = {
      size: bytes.byteLength,
      slice(start, end) {
        sliceCalls.push([start, end]);
        const copy = bytes.slice(start, end);
        return {
          arrayBuffer: async () =>
            Uint8Array.from(copy).buffer,
        } as Blob;
      },
    };
    const source = new BrowserFileSource({
      id: 'browser:file',
      file,
    });

    expect(await source.size()).toBe(6);
    expect(await source.read(2, 3)).toEqual(
      Uint8Array.from([3, 4, 5]),
    );
    expect(sliceCalls).toEqual([[2, 5]]);
  });

  it('returns independent byte arrays across reads', async () => {
    const source = new BrowserFileSource({
      id: 'browser:copy',
      file: readableBlob(
        Uint8Array.from([11, 22, 33, 44]),
      ),
    });

    const first = await source.read(0, 2);
    first[0] = 99;

    expect(await source.read(0, 2)).toEqual(
      Uint8Array.from([11, 22]),
    );
  });

  it('supports zero-length reads without materializing a Blob slice', async () => {
    let slices = 0;
    const source = new BrowserFileSource({
      id: 'browser:zero',
      file: {
        size: 3,
        slice() {
          slices += 1;
          return readableBlob(
            Uint8Array.from([1]),
          ).slice();
        },
      },
    });

    expect(await source.read(3, 0)).toEqual(new Uint8Array());
    expect(slices).toBe(0);
  });

  it('rejects invalid and out-of-bounds ranges before slicing', async () => {
    let slices = 0;
    const source = new BrowserFileSource({
      id: 'browser:bounds',
      file: {
        size: 3,
        slice() {
          slices += 1;
          return readableBlob(
            Uint8Array.from([1]),
          ).slice();
        },
      },
    });

    await expect(source.read(-1, 1)).rejects.toMatchObject({
      code: 'INVALID_RANGE',
    } satisfies Partial<DocumentSourceError>);
    await expect(source.read(2, 2)).rejects.toMatchObject({
      code: 'OUT_OF_BOUNDS',
    } satisfies Partial<DocumentSourceError>);
    expect(slices).toBe(0);
  });

  it('wraps Blob read failures in a typed READ_FAILED error', async () => {
    const source = new BrowserFileSource({
      id: 'browser:failure',
      file: {
        size: 4,
        slice() {
          return {
            arrayBuffer: async () => {
              throw new Error('fixture read failed');
            },
          } as Blob;
        },
      },
    });

    await expect(source.read(0, 2)).rejects.toMatchObject({
      code: 'READ_FAILED',
      sourceId: 'browser:failure',
    } satisfies Partial<DocumentSourceError>);
  });

  it('exposes immutable random-access non-persistent capabilities', () => {
    const source = new BrowserFileSource({
      id: 'browser:capabilities',
      file: readableBlob(new Uint8Array()),
    });

    expect(source.kind).toBe('browser-file');
    expect(source.capabilities).toEqual({
      randomAccess: true,
      immutableReads: true,
      persistent: false,
    });
    expect(Object.isFrozen(source.capabilities)).toBe(true);
  });
});
