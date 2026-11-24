import type { ReactNode } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DocumentWorkspace } from './DocumentWorkspace';
import '@/core/annotations/register-all';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  const doc = {
    numPages: 1,
    destroy: vi.fn(),
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      cleanup: vi.fn(),
    }),
  };

  return {
    PdfRendererAdapter: {
      acquireDocument: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'test-cad-grid',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      acquireDocumentSource: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'test-cad-grid',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      renderPage: vi.fn(),
      getPageTextItems: vi.fn().mockResolvedValue([]),
      getThumbnail: vi.fn(),
    },
  };
});

vi.mock('virtua', () => ({
  VList: ({ children }: { children: ReactNode }) => <div data-testid="vlist">{children}</div>,
}));

describe('DocumentWorkspace - CAD Grid & Polar Tracking Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-cad-grid-key',
      pageCount: 1,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'single',
      },
      setZoom: vi.fn(),
    });
    useEditorStore.setState({
      activeTool: 'select',
      workspaceViewMode: '2d',
      cadGridMode: 'none',
      cadIsoplane: 'all',
      cadGridSnap: false,
      cadGridSpacing: 20,
    });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders CadDraftingToolbar in bottom dock and cycles grid overlay', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    // Drafting toolbar is in the dock
    const toolbar = screen.getByTestId('cad-drafting-toolbar');
    expect(toolbar).toBeInTheDocument();

    // Initially grid is off
    expect(screen.queryByTestId('cad-grid-overlay')).toBeNull();

    // Click grid mode button in toolbar -> Ortho
    const gridBtn = screen.getByTestId('cad-grid-mode-btn');
    await act(async () => {
      fireEvent.click(gridBtn);
    });

    expect(useEditorStore.getState().cadGridMode).toBe('ortho');
    expect(screen.getByTestId('cad-grid-overlay')).toBeInTheDocument();

    // Click again -> Isometric
    await act(async () => {
      fireEvent.click(gridBtn);
    });

    expect(useEditorStore.getState().cadGridMode).toBe('isometric');
    expect(screen.getByTestId('cad-grid-overlay')).toBeInTheDocument();
    // In isometric mode, isoplane button appears in toolbar
    expect(screen.getByTestId('cad-isoplane-btn')).toBeInTheDocument();
  });
});
