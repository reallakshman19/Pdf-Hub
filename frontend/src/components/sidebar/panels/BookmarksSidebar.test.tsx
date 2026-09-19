import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BookmarksSidebar from './BookmarksSidebar';
import { useSessionStore } from '@/core/session/store';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  loadAppBookmarks,
} from '@/core/bookmarks/persistence';

vi.mock('@/adapters/pdf-renderer/activePdfDocumentLease', () => ({
  acquireActivePdfDocumentLease: vi.fn(),
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    getOutlineFlat: vi.fn(),
  },
}));

vi.mock('@/core/bookmarks/persistence', () => ({
  loadAppBookmarks: vi.fn(),
  saveAppBookmarks: vi.fn().mockResolvedValue(undefined),
}));

describe('BookmarksSidebar active revision rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      documentKey: 'sha256:active',
      revisionStoreId: 'store-1',
      originalRevisionId: 'sha256:original',
      activeRevisionId: 'sha256:active',
      workingBytes: Uint8Array.from([7, 8]),
      pageCount: 2,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
    vi.mocked(loadAppBookmarks).mockResolvedValue([{
      id: 'custom-1',
      title: 'My page',
      pageNumber: 1,
      createdAt: 1,
    }]);
  });

  it('loads the native outline through an active revision lease and releases it', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const doc = { numPages: 2 } as never;
    vi.mocked(
      acquireActivePdfDocumentLease,
    ).mockResolvedValue({
      doc,
      cacheKey: 'sha256:active',
      release,
    });
    vi.mocked(
      PdfRendererAdapter.getOutlineFlat,
    ).mockResolvedValue([{
      id: 'outline-1',
      title: 'Native section',
      pageNumber: 2,
      depth: 0,
    }]);

    render(<BookmarksSidebar />);

    expect(
      await screen.findByText('Native section'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('My page'),
    ).toBeInTheDocument();

    expect(
      vi.mocked(acquireActivePdfDocumentLease)
        .mock.calls[0]?.[0],
    ).toMatchObject({
      documentKey: 'sha256:active',
      revisionStoreId: 'store-1',
      originalRevisionId: 'sha256:original',
      activeRevisionId: 'sha256:active',
    });
    expect(
      PdfRendererAdapter.getOutlineFlat,
    ).toHaveBeenCalledWith(
      doc,
      expect.any(AbortSignal),
    );
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledTimes(1);
    });
  });
});
