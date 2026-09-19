import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentSource } from '@/core/document-source/types';
import {
  OperationCancelledError,
} from '@/core/cancellation/operationCancellation';
import {
  acquireActivePdfDocumentLease,
  type ActivePdfRendererSessionSnapshot,
} from './activePdfDocumentLease';
import { PdfRendererAdapter } from './PdfRendererAdapter';
import {
  resolveActivePdfRendererInput,
} from '@/core/session/activePdfRendererInput';

vi.mock('@/core/session/activePdfRendererInput', () => ({
  resolveActivePdfRendererInput: vi.fn(),
}));

vi.mock('./PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn(),
    acquireDocumentSource: vi.fn(),
  },
}));

function snapshot(): ActivePdfRendererSessionSnapshot {
  return {
    documentKey: 'sha256:active',
    revisionStoreId: 'store-1',
    originalRevisionId: 'sha256:original',
    activeRevisionId: 'sha256:active',
    workingBytes: Uint8Array.from([9, 9]),
  };
}

function source(): DocumentSource {
  return {
    id: 'revision-source',
    kind: 'opfs',
    capabilities: {
      randomAccess: true,
      immutableReads: true,
      persistent: true,
    },
    size: async () => 4,
    read: async () => Uint8Array.from([1, 2, 3, 4]),
  };
}

describe('acquireActivePdfDocumentLease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquires revision-aware input through the source-backed renderer path', async () => {
    const controller = new AbortController();
    const lease = {
      doc: {} as never,
      cacheKey: 'sha256:active',
      release: vi.fn().mockResolvedValue(undefined),
    };
    const activeSource = source();

    vi.mocked(resolveActivePdfRendererInput).mockResolvedValue({
      kind: 'source',
      source: activeSource,
      cacheKey: 'sha256:active',
    });
    vi.mocked(
      PdfRendererAdapter.acquireDocumentSource,
    ).mockResolvedValue(lease);

    await expect(
      acquireActivePdfDocumentLease(
        snapshot(),
        controller.signal,
      ),
    ).resolves.toBe(lease);

    expect(
      PdfRendererAdapter.acquireDocumentSource,
    ).toHaveBeenCalledWith({
      source: activeSource,
      cacheKey: 'sha256:active',
      signal: controller.signal,
    });
    expect(
      PdfRendererAdapter.acquireDocument,
    ).not.toHaveBeenCalled();
  });

  it('retains the legacy byte-backed path when the resolver returns bytes', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const lease = {
      doc: {} as never,
      cacheKey: 'sha256:legacy',
      release: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(resolveActivePdfRendererInput).mockResolvedValue({
      kind: 'bytes',
      bytes,
    });
    vi.mocked(
      PdfRendererAdapter.acquireDocument,
    ).mockResolvedValue(lease);

    await expect(
      acquireActivePdfDocumentLease(snapshot()),
    ).resolves.toBe(lease);

    expect(
      PdfRendererAdapter.acquireDocument,
    ).toHaveBeenCalledWith(bytes);
    expect(
      PdfRendererAdapter.acquireDocumentSource,
    ).not.toHaveBeenCalled();
  });

  it('returns null when no active PDF renderer input exists', async () => {
    vi.mocked(
      resolveActivePdfRendererInput,
    ).mockResolvedValue(null);

    await expect(
      acquireActivePdfDocumentLease(snapshot()),
    ).resolves.toBeNull();

    expect(
      PdfRendererAdapter.acquireDocument,
    ).not.toHaveBeenCalled();
    expect(
      PdfRendererAdapter.acquireDocumentSource,
    ).not.toHaveBeenCalled();
  });

  it('releases a byte lease that resolves after cancellation', async () => {
    const bytes = Uint8Array.from([4, 5]);
    const release = vi.fn().mockResolvedValue(undefined);
    let resolveLease!: (
      value: Awaited<
        ReturnType<typeof PdfRendererAdapter.acquireDocument>
      >,
    ) => void;

    vi.mocked(resolveActivePdfRendererInput).mockResolvedValue({
      kind: 'bytes',
      bytes,
    });
    vi.mocked(
      PdfRendererAdapter.acquireDocument,
    ).mockReturnValue(
      new Promise((resolve) => {
        resolveLease = resolve;
      }),
    );

    const controller = new AbortController();
    const pending = acquireActivePdfDocumentLease(
      snapshot(),
      controller.signal,
    );

    await Promise.resolve();
    controller.abort('superseded');

    await expect(pending).rejects.toBeInstanceOf(
      OperationCancelledError,
    );

    resolveLease({
      doc: {} as never,
      cacheKey: 'sha256:late',
      release,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not start resolver work for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort('already cancelled');

    await expect(
      acquireActivePdfDocumentLease(
        snapshot(),
        controller.signal,
      ),
    ).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });

    expect(
      resolveActivePdfRendererInput,
    ).not.toHaveBeenCalled();
  });
});
