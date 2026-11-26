import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { DocumentWorkspace } from '../DocumentWorkspace';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { usePdfStore } from '@/core/session/pdfStore';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Mock adapters and heavy sub-components
vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn(),
    acquireDocumentSource: vi.fn(),
    getPageTextItems: vi.fn().mockResolvedValue([]),
    renderThumbnailResource: vi.fn(),
  },
}));

vi.mock('@/core/renderer/usePageRenderer', () => ({
  usePageRenderer: () => ({
    size: { width: 612, height: 792 },
    isRendering: false,
    ocrViewport: null,
  }),
}));

vi.mock('@/core/renderer/useNativeStampAppearances', () => ({
  useNativeAnnotationAppearances: () => ({}),
}));

vi.mock('../useAnnotationPersistence', () => ({
  useAnnotationPersistence: vi.fn(),
}));

vi.mock('../useWriterPersistence', () => ({
  useWriterPersistence: vi.fn(),
}));

vi.mock('virtua', () => {
  return {
    VList: React.forwardRef<
      {
        scrollOffset: number;
        viewportSize: number;
        scrollSize: number;
        scrollToIndex: (index: number) => void;
        scrollTo: (offset: number) => void;
        scrollBy: (offset: number) => void;
        findItemIndex: (offset: number) => number;
      },
      { children?: React.ReactNode; onScroll?: (offset: number) => void }
    >(({ children, onScroll }, ref) => {
      React.useImperativeHandle(ref, () => ({
        scrollOffset: 500,
        viewportSize: 800,
        scrollSize: 4000,
        scrollToIndex: vi.fn(),
        scrollTo: vi.fn(),
        scrollBy: vi.fn(),
        findItemIndex: (offset: number) => {
          // Assume each page is ~800px tall
          return Math.floor(offset / 800);
        },
      }));

      return (
        <div data-testid="mock-vlist" onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}>
          {children}
        </div>
      );
    }),
  };
});

function createMockPdf(numPages = 5): PDFDocumentProxy {
  return {
    numPages,
    fingerprints: ['mock-fingerprint'],
    getPage: vi.fn().mockImplementation(async (pageNumber: number) => {
      return {
        pageNumber,
        getViewport: ({ scale }: { scale: number }) => ({
          width: 612 * scale,
          height: 792 * scale,
        }),
        cleanup: vi.fn(),
      } as unknown as PDFPageProxy;
    }),
    cleanup: vi.fn(),
    destroy: vi.fn(),
  } as unknown as PDFDocumentProxy;
}

describe('DocumentWorkspace scroll synchronization and tool switching stability', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'select',
      activeMode: 'annotate',
      workspaceViewMode: '2d',
    });
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc-key',
      pageCount: 5,
      viewState: {
        currentPage: 3,
        currentPageId: 'page-3',
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
  });

  it('preserves currentPage on tool change without reverting to page 1', async () => {
    const mockDoc = createMockPdf(5);
    act(() => {
      usePdfStore.getState().setPdfDoc(mockDoc);
    });

    let rendered: ReturnType<typeof render>;
    act(() => {
      rendered = render(<DocumentWorkspace />);
    });

    // Initial state: page is 3
    expect(useSessionStore.getState().viewState.currentPage).toBe(3);

    // Act: User switches tool to 'highlight'
    act(() => {
      useEditorStore.getState().setActiveTool('highlight');
      rendered.rerender(<DocumentWorkspace />);
    });

    // Verify: currentPage must remain 3, NOT jump to page 1
    expect(useSessionStore.getState().viewState.currentPage).toBe(3);

    // Act: User switches tool to 'ink'
    act(() => {
      useEditorStore.getState().setActiveTool('ink');
      rendered.rerender(<DocumentWorkspace />);
    });

    expect(useSessionStore.getState().viewState.currentPage).toBe(3);

    // Act: User switches tool to 'callout'
    act(() => {
      useEditorStore.getState().setActiveTool('callout');
      rendered.rerender(<DocumentWorkspace />);
    });

    expect(useSessionStore.getState().viewState.currentPage).toBe(3);
  });

  it('updates currentPage when programmatic navigation is explicitly requested', () => {
    act(() => {
      render(<DocumentWorkspace />);
    });

    act(() => {
      useSessionStore.getState().setPage(5);
    });

    expect(useSessionStore.getState().viewState.currentPage).toBe(5);

    // Tool switch after programmatic navigation to page 5
    act(() => {
      useEditorStore.getState().setActiveTool('shape-rect');
    });

    expect(useSessionStore.getState().viewState.currentPage).toBe(5);
  });
});
