import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchPanel } from './SearchPanel';
import { useSessionStore } from '@/core/session/store';
import { useSearchStore } from '@/core/search/store';
import { SearchIndexer } from '@/core/search/indexer';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';

vi.mock('@/adapters/pdf-renderer/activePdfDocumentLease', () => ({
  acquireActivePdfDocumentLease: vi.fn(),
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    searchDocumentTextInDocument: vi.fn(),
  },
}));

describe('SearchPanel active revision rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SearchIndexer.clearCache('sha256:active');
    useSearchStore.setState({
      query: '',
      isSearching: false,
      hits: [],
      activeHitId: null,
      error: null,
    });
    useSessionStore.setState({
      documentKey: 'sha256:active',
      revisionStoreId: 'store-1',
      originalRevisionId: 'sha256:original',
      activeRevisionId: 'sha256:active',
      workingBytes: Uint8Array.from([9, 9]),
      pageCount: 2,
    });
  });

  it('uses an active revision lease for an uncached user-triggered search', async () => {
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
      PdfRendererAdapter.searchDocumentTextInDocument,
    ).mockResolvedValue([{
      id: 'hit-1-0',
      pageNumber: 1,
      snippet: 'needle',
      rects: [],
    }]);

    render(<SearchPanel />);
    const input = screen.getByPlaceholderText(
      'Search in document...',
    );
    fireEvent.change(input, {
      target: { value: 'needle' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    await vi.waitFor(() => {
      expect(
        acquireActivePdfDocumentLease,
      ).toHaveBeenCalled();
    });

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
      PdfRendererAdapter.searchDocumentTextInDocument,
    ).toHaveBeenCalledWith(
      doc,
      'needle',
      expect.any(AbortSignal),
    );
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalled();
    });
  });

  it('keeps SearchIndexer cache hits on the in-memory path without a renderer lease', async () => {
    SearchIndexer.setCache('sha256:active', {
      2: [{
        str: 'cached needle',
        rect: {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
        },
      }],
    });

    render(<SearchPanel />);
    const input = screen.getByPlaceholderText(
      'Search in document...',
    );
    fireEvent.change(input, {
      target: { value: 'needle' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(
      await screen.findByText('needle'),
    ).toBeInTheDocument();
    expect(
      acquireActivePdfDocumentLease,
    ).not.toHaveBeenCalled();
    expect(
      PdfRendererAdapter.searchDocumentTextInDocument,
    ).not.toHaveBeenCalled();
  });
});
