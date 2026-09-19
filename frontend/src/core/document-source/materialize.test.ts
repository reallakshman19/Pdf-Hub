import { describe, expect, it, vi } from 'vitest';

import type {
  DocumentSource,
  DocumentSourceCapabilities,
} from './types';
import {
  materializeDocumentSource,
} from './materialize';

const capabilities: Readonly<DocumentSourceCapabilities> =
  Object.freeze({
    randomAccess: true,
    immutableReads: true,
    persistent: false,
  });

function sourceFromBytes(
  bytes: Uint8Array,
): DocumentSource & {
  read: ReturnType<typeof vi.fn>;
} {
  return {
    id: 'source:materialize',
    kind: 'memory',
    capabilities,
    size: async () => bytes.byteLength,
    read: vi.fn(
      async (offset: number, length: number) =>
        bytes.slice(offset, offset + length),
    ),
  };
}

describe('materializeDocumentSource', () => {
  it('materializes into one compatibility array using bounded reads', async () => {
    const source = sourceFromBytes(
      Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
    );

    const result = await materializeDocumentSource(
      source,
      { chunkBytes: 3 },
    );

    expect(result).toEqual(
      Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
    );
    expect(source.read.mock.calls).toEqual([
      [0, 3],
      [3, 3],
      [6, 1],
    ]);
  });

  it('does not issue a read for an empty source', async () => {
    const source = sourceFromBytes(new Uint8Array());

    expect(
      await materializeDocumentSource(source),
    ).toEqual(new Uint8Array());
    expect(source.read).not.toHaveBeenCalled();
  });

  it('rejects before reading when source size exceeds the compatibility limit', async () => {
    const source = sourceFromBytes(
      Uint8Array.from([1, 2, 3, 4]),
    );

    await expect(
      materializeDocumentSource(source, {
        maxBytes: 3,
      }),
    ).rejects.toThrow(/exceeding materialization limit/);
    expect(source.read).not.toHaveBeenCalled();
  });

  it('rejects invalid chunk sizes before reading', async () => {
    const source = sourceFromBytes(
      Uint8Array.from([1]),
    );

    await expect(
      materializeDocumentSource(source, {
        chunkBytes: 0,
      }),
    ).rejects.toThrow(/chunkBytes/);
    expect(source.read).not.toHaveBeenCalled();
  });

  it('honors cancellation between source ranges', async () => {
    const controller = new AbortController();
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    let reads = 0;
    const source: DocumentSource = {
      id: 'source:cancel',
      kind: 'memory',
      capabilities,
      size: async () => bytes.byteLength,
      read: async (offset, length) => {
        reads += 1;
        if (reads === 1) {
          controller.abort('stop');
        }
        return bytes.slice(offset, offset + length);
      },
    };

    await expect(
      materializeDocumentSource(source, {
        chunkBytes: 2,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'OperationCancelledError',
    });
    expect(reads).toBe(1);
  });
});
