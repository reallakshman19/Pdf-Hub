import { beforeEach, describe, expect, it } from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import {
  resolveActivePdfRendererInput,
} from './activePdfRendererInput';

function byteOnlySession(
  bytes: Uint8Array | null,
) {
  return {
    documentKey: bytes ? 'legacy-doc' : null,
    revisionStoreId: null,
    originalRevisionId: null,
    activeRevisionId: null,
    workingBytes: bytes,
  };
}

describe('resolveActivePdfRendererInput', () => {
  beforeEach(() => {
    clearWorkingRevisionStoreRegistryForTests();
  });

  it('returns legacy bytes only when all revision metadata is absent', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    await expect(
      resolveActivePdfRendererInput(
        byteOnlySession(bytes),
      ),
    ).resolves.toEqual({
      kind: 'bytes',
      bytes,
    });

    await expect(
      resolveActivePdfRendererInput(
        byteOnlySession(null),
      ),
    ).resolves.toBeNull();
  });

  it('opens the immutable active revision for a revision-aware session', async () => {
    const store = new MemoryRevisionStore({
      id: 'renderer-revisions',
    });
    const bytes = Uint8Array.from([7, 8, 9]);
    await store.commit({
      revisionId: 'sha256:active',
      source: new MemorySource({
        id: 'fixture',
        bytes,
      }),
    });
    registerWorkingRevisionStore(store);

    const resolved =
      await resolveActivePdfRendererInput({
        documentKey: 'sha256:active',
        revisionStoreId: store.id,
        originalRevisionId: 'sha256:original',
        activeRevisionId: 'sha256:active',
        workingBytes: Uint8Array.from([99]),
      });

    expect(resolved?.kind).toBe('source');
    if (!resolved || resolved.kind !== 'source') {
      throw new Error('Expected source renderer input.');
    }
    expect(resolved.cacheKey).toBe('sha256:active');
    expect(await resolved.source.read(0, 3)).toEqual(
      bytes,
    );
  });

  it('rejects a revision-aware session with no published active revision', async () => {
    const store = new MemoryRevisionStore({
      id: 'renderer-revisions',
    });
    registerWorkingRevisionStore(store);

    await expect(
      resolveActivePdfRendererInput({
        documentKey: 'sha256:working',
        revisionStoreId: store.id,
        originalRevisionId: 'sha256:original',
        activeRevisionId: null,
        workingBytes: Uint8Array.from([1]),
      }),
    ).rejects.toThrow(
      /missing a durable active revision/,
    );
  });

  it('rejects stale revision identity instead of falling back to bytes', async () => {
    const store = new MemoryRevisionStore({
      id: 'renderer-revisions',
    });
    registerWorkingRevisionStore(store);

    await expect(
      resolveActivePdfRendererInput({
        documentKey: 'sha256:new',
        revisionStoreId: store.id,
        originalRevisionId: 'sha256:original',
        activeRevisionId: 'sha256:old',
        workingBytes: Uint8Array.from([1]),
      }),
    ).rejects.toThrow(
      /does not match documentKey/,
    );
  });

  it('rejects an unavailable registered store instead of falling back to bytes', async () => {
    await expect(
      resolveActivePdfRendererInput({
        documentKey: 'sha256:active',
        revisionStoreId: 'missing-store',
        originalRevisionId: 'sha256:original',
        activeRevisionId: 'sha256:active',
        workingBytes: Uint8Array.from([1]),
      }),
    ).rejects.toThrow(
      /is not registered for active PDF rendering/,
    );
  });
});
