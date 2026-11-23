import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { DocumentWorkspace } from './DocumentWorkspace';
import '@/core/annotations/register-all';
import { useSearchStore } from '@/core/search/store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import type { SearchHit } from '@/core/search/types';

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  const doc = {
    numPages: 5,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1100 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      cleanup: vi.fn(),
    }),
  };

  return {
    PdfRendererAdapter: {
      acquireDocument: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'search-test-doc',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      acquireDocumentSource: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'search-test-doc',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      renderPage: vi.fn(),
      getPageTextItems: vi.fn().mockResolvedValue([]),
      getThumbnail: vi.fn(),
    },
  };
});

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 5,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 1100 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      }),
      destroy: vi.fn(),
    }),
  })),
  GlobalWorkerOptions: { workerSrc: '' },
}));

vi.mock('virtua', () => ({
  VList: ({ children }: { children: React.ReactNode }) => <div data-testid="vlist">{children}</div>,
}));

function makeHit(id: string, pageNumber: number): SearchHit {
  return {
    id,
    pageNumber,
    snippet: `Snippet for ${id}`,
    rects: [{ x: 50, y: 100, width: 80, height: 20 }],
  };
}

describe('DocumentWorkspace Search Geometry & Navigation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnotationStore.setState({ annotations: [] });
    useSearchStore.getState().clearSearch();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'search-test-doc',
      revisionStoreId: null,
      originalRevisionId: null,
      activeRevisionId: null,
      pageCount: 5,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'single',
      },
    });
    useEditorStore.setState({ activeTool: 'select' });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders SearchFloatingHud and updates active page when activeHitId switches to another page', async () => {
    const hitP1 = makeHit('hit-p1', 1);
    const hitP3 = makeHit('hit-p3', 3);

    useSearchStore.setState({
      query: 'valve',
      hits: [hitP1, hitP3],
      activeHitId: 'hit-p1',
      isOverlayVisible: true,
    });

    render(<DocumentWorkspace />);

    // Wait for document to load
    expect(await screen.findByTestId('search-floating-hud')).toBeInTheDocument();
    expect(screen.getByTestId('search-hud-match-count')).toHaveTextContent('1 of 2');

    // Page 1 is currently active
    expect(useSessionStore.getState().viewState.currentPage).toBe(1);

    // Click next match in the floating HUD
    act(() => {
      fireEvent.click(screen.getByTestId('search-hud-next'));
    });

    // Active hit should now be hit-p3 on page 3
    expect(useSearchStore.getState().activeHitId).toBe('hit-p3');
    expect(useSessionStore.getState().viewState.currentPage).toBe(3);
    expect(screen.getByTestId('search-hud-match-count')).toHaveTextContent('2 of 2');
  });

  it('clicking a search highlight on the canvas sets it as active hit', async () => {
    const hit1 = makeHit('hit-a', 1);
    const hit2 = makeHit('hit-b', 1);

    useSearchStore.setState({
      query: 'pipe',
      hits: [hit1, hit2],
      activeHitId: 'hit-a',
      isOverlayVisible: true,
    });

    render(<DocumentWorkspace />);

    // Inactive highlight for hit-b
    const inactiveHighlights = await screen.findAllByTestId('search-highlight-inactive');
    expect(inactiveHighlights.length).toBeGreaterThanOrEqual(1);

    act(() => {
      fireEvent.click(inactiveHighlights[0]);
    });

    expect(useSearchStore.getState().activeHitId).toBe('hit-b');
  });
});
