import type { ReactNode } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DocumentWorkspace } from './DocumentWorkspace';
import '@/core/annotations/register-all';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useCadModelingStore } from '@/core/cad-modeling/store';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  const doc = {
    numPages: 2,
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
        cacheKey: 'test-doc',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      acquireDocumentSource: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'test-doc',
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

describe('DocumentWorkspace - 2D / 3D Canvas Workspace Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc-tabs',
      pageCount: 2,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
      setZoom: vi.fn(),
    });
    useEditorStore.setState({
      activeTool: 'select',
      workspaceViewMode: '2d',
      inspectorTab: 'properties',
    });
    useAnnotationStore.setState({
      annotations: [
        {
          id: 'pipe-1',
          type: 'line',
          pageNumber: 1,
          rect: { x: 100, y: 100, width: 200, height: 0 },
          createdAt: 1,
          updatedAt: 1,
          data: {
            x1: 100,
            y1: 100,
            x2: 300,
            y2: 100,
            systemType: 'pipe',
            nominalSize: '4"',
          },
        },
      ],
      pageCalibrations: {
        1: { scaleRatio: 100, unit: 'mm', precision: 0 },
      },
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

  it('renders workspace tabs (2D Document and 3D Canvas) at top of workspace', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const tabsContainer = screen.getByTestId('workspace-view-tabs');
    expect(tabsContainer).toBeInTheDocument();

    const tab2d = screen.getByTestId('tab-view-2d');
    const tab3d = screen.getByTestId('tab-view-3d');
    expect(tab2d).toBeInTheDocument();
    expect(tab3d).toBeInTheDocument();
    expect(tab2d).toHaveTextContent('2D Document');
    expect(tab3d).toHaveTextContent('3D Canvas');
  });

  it('switches between 2D Document and 3D Canvas views', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    // In 2D mode, the virtualized list wrapper is rendered
    expect(screen.getByTestId('vlist')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-3d-canvas-container')).toBeNull();

    // Click 3D Canvas tab
    const tab3d = screen.getByTestId('tab-view-3d');
    await act(async () => {
      fireEvent.click(tab3d);
    });

    // State in editor store is now '3d' and inspector opened to takeoff
    expect(useEditorStore.getState().workspaceViewMode).toBe('3d');
    expect(useEditorStore.getState().inspectorTab).toBe('takeoff');

    // 3D Canvas container is visible in main workspace
    expect(screen.getByTestId('workspace-3d-canvas-container')).toBeInTheDocument();
    expect(screen.getByTestId('piping-3d-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('vlist')).toBeNull();

    // Click back to 2D Document tab
    const tab2d = screen.getByTestId('tab-view-2d');
    await act(async () => {
      fireEvent.click(tab2d);
    });

    expect(useEditorStore.getState().workspaceViewMode).toBe('2d');
    expect(screen.getByTestId('vlist')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-3d-canvas-container')).toBeNull();
  });

  it('mounts Phase P CAD modeling HUD and 3D extrusion dock and harvests shape-rect loops', async () => {
    useCadModelingStore.getState().reset();
    useAnnotationStore.setState({
      annotations: [
        {
          id: 'rect-loop-1',
          type: 'shape-rect',
          pageNumber: 1,
          rect: { x: 50, y: 50, width: 120, height: 80 },
          createdAt: 1,
          updatedAt: 1,
          data: {},
        },
      ],
    });
    useEditorStore.setState({ activeMode: 'draw', activeTool: 'shape-rect', workspaceViewMode: '2d' });

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    // ContinuousModelingHud is mounted contextually for CAD tools
    expect(screen.getByTestId('cad-continuous-modeling-hud')).toBeInTheDocument();
    // Closed loop harvested into store
    expect(useCadModelingStore.getState().harvestedLoops.length).toBeGreaterThanOrEqual(1);

    // Clicking "3D DOCK" opens Cad3DViewportDock right inside the workspace
    await act(async () => {
      fireEvent.click(screen.getByTestId('hud-toggle-3d-dock'));
    });

    expect(screen.getByTestId('cad-3d-viewport-dock')).toBeInTheDocument();
  });
});
