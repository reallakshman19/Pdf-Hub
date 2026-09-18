import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ThumbnailSidebar from './ThumbnailSidebar';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSearchStore } from '@/core/search/store';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';

vi.mock('virtua', () => ({
  VList: ({
    children,
    data,
  }: {
    children: (item: { pageNumber: number }) => ReactNode;
    data: Array<{ pageNumber: number }>;
  }) => (
    <div data-testid="vlist">{data && data.length > 0 ? data.map((item) => <div key={item.pageNumber}>{children(item)}</div>) : null}</div>
  ),
}));

vi.mock('@/core/session/store', () => ({
  useSessionStore: vi.fn(),
}));

vi.mock('@/core/editor/store', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('@/core/annotations/store', () => ({
  useAnnotationStore: vi.fn(),
}));

vi.mock('@/core/search/store', () => ({
  useSearchStore: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: vi.fn().mockResolvedValue({ success: true, mutated: true }),
  },
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn(),
    getThumbnail: vi.fn(),
  },
}));

describe('ThumbnailSidebar', () => {
  it.skip('handles keyboard navigation and selection', async () => {
    const mockSetPage = vi.fn();
    const mockSetSelectedPages = vi.fn();
    const mockToggleSelectedPage = vi.fn();
    const mockSetSidebarTab = vi.fn();

    const mockedUseSessionStore = useSessionStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseEditorStore = useEditorStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseAnnotationStore = useAnnotationStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseSearchStore = useSearchStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };

    mockedUseSessionStore.mockReturnValue({
      workingBytes: new Uint8Array([1, 2, 3]),
      viewState: { currentPage: 1 },
      setPage: mockSetPage,
      selectedPages: [],
      setSelectedPages: mockSetSelectedPages,
      toggleSelectedPage: mockToggleSelectedPage,
    });

    const { usePdfStore } = await import('@/core/session/pdfStore');
    usePdfStore.setState({
      pdfDoc: {
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({}),
      } as unknown as PDFDocumentProxy,
    });
    mockedUseEditorStore.mockReturnValue({ setSidebarTab: mockSetSidebarTab });
    mockedUseAnnotationStore.mockReturnValue({ annotations: [] });
    mockedUseSearchStore.mockReturnValue({ hits: [] });

    type MockDoc = {
      numPages: number;
      getPage: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    type MockLease = {
      doc: MockDoc;
      cacheKey: string;
      release: ReturnType<typeof vi.fn>;
    };
    let mockLeaseDeferredResolve: (value: MockLease) => void = () => {};
    const mockLeasePromise = new Promise<MockLease>((resolve) => {
      mockLeaseDeferredResolve = resolve;
    });

    const mockDoc = {
      numPages: 2,
      getPage: vi.fn().mockResolvedValue({
        cleanup: vi.fn(),
      }),
      destroy: vi.fn(),
    };
    const mockLease: MockLease = {
      doc: mockDoc,
      cacheKey: 'thumbnail-doc',
      release: vi.fn().mockResolvedValue(undefined),
    };
    const mockedAcquireDocument = PdfRendererAdapter.acquireDocument as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedGetThumbnail = PdfRendererAdapter.getThumbnail as unknown as {
      mockResolvedValue: (value: string) => void;
    };
    mockedAcquireDocument.mockReturnValue(mockLeasePromise);
    mockedGetThumbnail.mockResolvedValue('mock-url');

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await act(async () => {
      mockLeaseDeferredResolve(mockLease);
    });

    await vi.waitFor(() => {
      expect(screen.queryByText(/Generating thumbnails.../i)).not.toBeInTheDocument();
    });

    const thumbnails = await screen.findAllByRole('button', { name: /Page \d+/ }, { timeout: 2000 });
    expect(thumbnails).toHaveLength(2);

    await act(async () => {
      fireEvent.keyDown(thumbnails[0], { key: 'Enter' });
    });
    expect(mockSetPage).toHaveBeenCalledWith(1);
    expect(mockSetSelectedPages).toHaveBeenCalledWith([1]);

    const nextThumb = thumbnails[1];
    nextThumb.focus = vi.fn();
    document.getElementById = vi.fn().mockReturnValue(nextThumb);

    await act(async () => {
      fireEvent.keyDown(thumbnails[0], { key: 'ArrowDown' });
    });
    expect(nextThumb.focus).toHaveBeenCalled();
  });
});
