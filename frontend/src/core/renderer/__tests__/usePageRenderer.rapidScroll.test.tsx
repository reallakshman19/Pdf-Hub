import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePageRenderer } from '../usePageRenderer';
import { CanvasDisposalManager } from '../canvasDisposalManager';
import { useScrollVelocityStore } from '../scrollVelocityStore';
import { PdfRendererAdapter } from '../../../adapters/pdf-renderer/PdfRendererAdapter';

vi.mock('../../../adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    renderPage: vi.fn(),
  },
}));

function createMockDoc(): PDFDocumentProxy {
  return {
    numPages: 5,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000, rotation: 0 }),
      cleanup: vi.fn(),
    }),
  } as unknown as PDFDocumentProxy;
}

interface HarnessProps {
  doc: PDFDocumentProxy;
  documentKey?: string;
  pageNumber: number;
  scale: number;
  onState?: (state: { isRendering: boolean; isPlaceholderActive: boolean }) => void;
}

const RendererHarness: React.FC<HarnessProps> = ({
  doc,
  documentKey = 'doc-1',
  pageNumber,
  scale,
  onState,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const { isRendering, isPlaceholderActive } = usePageRenderer({
    doc,
    documentKey,
    pageNumber,
    scale,
    canvasRef,
  });

  React.useEffect(() => {
    onState?.({ isRendering, isPlaceholderActive });
  }, [isRendering, isPlaceholderActive, onState]);

  return <canvas ref={canvasRef} data-testid="test-canvas" width={800} height={1000} />;
};

describe('usePageRenderer rapid-scroll stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CanvasDisposalManager.resetRegistry();
    useScrollVelocityStore.getState().reset();
    vi.mocked(PdfRendererAdapter.renderPage).mockImplementation(() => ({
      completed: Promise.resolve(),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT purge or re-mount already-rendered canvas when isRapidScrolling toggles', async () => {
    const doc = createMockDoc();
    const purgeSpy = vi.spyOn(CanvasDisposalManager, 'purge');

    await act(async () => {
      render(<RendererHarness doc={doc} pageNumber={1} scale={1} />);
      await Promise.resolve();
    });

    expect(PdfRendererAdapter.renderPage).toHaveBeenCalledTimes(1);
    expect(purgeSpy).not.toHaveBeenCalled();

    // Simulate rapid scroll toggling on and off
    await act(async () => {
      useScrollVelocityStore.setState({ isRapidScrolling: true, velocity: 2500 });
      await Promise.resolve();
    });
    expect(purgeSpy).not.toHaveBeenCalled();
    expect(PdfRendererAdapter.renderPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      useScrollVelocityStore.setState({ isRapidScrolling: false, velocity: 0 });
      await Promise.resolve();
    });
    expect(purgeSpy).not.toHaveBeenCalled();
    expect(PdfRendererAdapter.renderPage).toHaveBeenCalledTimes(1);
  });

  it('debounces initial render during rapid scroll and skips rendering if unmounted early', async () => {
    vi.useFakeTimers();
    const doc = createMockDoc();
    useScrollVelocityStore.setState({ isRapidScrolling: true, velocity: 3000 });

    const { unmount } = render(<RendererHarness doc={doc} pageNumber={2} scale={1} />);

    // Render should not have started immediately
    expect(PdfRendererAdapter.renderPage).not.toHaveBeenCalled();

    // Advance only 60ms (still inside 180ms debounce window) and unmount (page flew past viewport)
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(PdfRendererAdapter.renderPage).not.toHaveBeenCalled();
  });

  it('starts high-res render immediately when rapid scroll settles before 180ms', async () => {
    vi.useFakeTimers();
    const doc = createMockDoc();
    useScrollVelocityStore.setState({ isRapidScrolling: true, velocity: 3000 });

    render(<RendererHarness doc={doc} pageNumber={3} scale={1} />);
    expect(PdfRendererAdapter.renderPage).not.toHaveBeenCalled();

    await act(async () => {
      useScrollVelocityStore.setState({ isRapidScrolling: false, velocity: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(PdfRendererAdapter.renderPage).toHaveBeenCalledTimes(1);
  });

  it('keeps placeholder inactive across scale/zoom updates once page has painted', async () => {
    const doc = createMockDoc();
    const states: Array<{ isRendering: boolean; isPlaceholderActive: boolean }> = [];

    const { rerender } = render(
      <RendererHarness
        doc={doc}
        pageNumber={1}
        scale={1}
        onState={(s) => states.push(s)}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(states.some((s) => s.isPlaceholderActive === false)).toBe(true);
    states.length = 0;

    // Trigger scale update
    await act(async () => {
      rerender(
        <RendererHarness
          doc={doc}
          pageNumber={1}
          scale={1.5}
          onState={(s) => states.push(s)}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Placeholder should remain false even while re-rendering at new zoom
    expect(states.every((s) => s.isPlaceholderActive === false)).toBe(true);
  });
});
