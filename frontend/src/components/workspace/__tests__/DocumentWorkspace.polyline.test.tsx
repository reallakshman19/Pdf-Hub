import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { PageSurface } from '../DocumentWorkspace';
import { ToolbarComment } from '@/components/toolbar/ToolbarComment';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation, Point2D } from '@/core/annotations/types';

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    getPageTextItems: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/core/renderer/usePageRenderer', () => ({
  usePageRenderer: () => ({
    renderState: { status: 'success' },
    renderSize: { width: 800, height: 1000 },
    canvasRef: React.createRef<HTMLCanvasElement>(),
  }),
}));

vi.mock('@/core/renderer/useNativeStampAppearances', () => ({
  useNativeAnnotationAppearances: () => ({}),
}));

vi.mock('@/core/annotations/register-all', () => ({}));

function makeDoc() {
  const page = {
    rotate: 0,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 800 * scale,
      height: 1000 * scale,
      rotation: 0,
    })),
  };
  return {
    getPage: vi.fn().mockResolvedValue(page),
  } as unknown as Parameters<typeof PageSurface>[0]['doc'];
}

describe('Multi-vertex polyline tool (Layer 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({ activeMode: 'annotate', activeTool: 'select' });
    useAnnotationStore.setState({
      annotations: [],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    });
  });

  it('activates perimeter-takeoff tool from ToolbarComment', () => {
    render(<ToolbarComment />);
    const btn = screen.getByTitle(/Polyline \/ Pipe Run/i);
    fireEvent.click(btn);
    expect(useEditorStore.getState().activeTool).toBe('perimeter-takeoff');
  });

  it('creates a page-space multi-vertex perimeter-takeoff annotation via sequential clicks and double-click commit', async () => {
    const onCreateAnnotation = vi.fn();
    const stateRef: {
      polyline: { pageNumber: number; vertices: Point2D[] } | null;
      currentPt: { x: number; y: number } | null;
    } = { polyline: null, currentPt: null };
    const setDrawingPolyline = vi.fn((next: { pageNumber: number; vertices: Point2D[] } | null) => {
      stateRef.polyline = next;
    });
    const setDrawingLineCurrent = vi.fn((next: { x: number; y: number } | null) => {
      stateRef.currentPt = next;
    });

    const doc = makeDoc();
    const baseProps: Parameters<typeof PageSurface>[0] = {
      doc,
      pageNumber: 1,
      scale: 1,
      activeTool: 'perimeter-takeoff',
      pageAnnotations: [] as PdfAnnotation[],
      selectedAnnotationIds: [],
      onActivate: vi.fn(),
      onCreateAnnotation,
      onCreateManyAnnotations: vi.fn(),
      onCommitAnnotation: vi.fn(),
      onCommitManyAnnotations: vi.fn(),
      onSetSingleSelection: vi.fn(),
      onToggleSelection: vi.fn(),
      onClearSelection: vi.fn(),
      existingTextPageId: null,
      selectedExistingTextSourceIndex: null,
      onSelectExistingText: vi.fn(),
      onDeselectExistingText: vi.fn(),
      onSetSelection: vi.fn(),
      drawingLineStart: null,
      drawingPolyline: stateRef.polyline,
      drawingLineCurrent: stateRef.currentPt,
      setDrawingLineStart: vi.fn(),
      setDrawingPolyline,
      setDrawingLineCurrent,
    };

    const view = render(<PageSurface {...baseProps} />);
    await act(async () => {});

    const hitTarget = view.getByTestId('annotation-creation-hit-target');
    Object.defineProperty(hitTarget, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 1000, right: 800, bottom: 1000 }),
    });

    // Click 1: vertex (40, 50)
    fireEvent.mouseDown(hitTarget, { button: 0, clientX: 40, clientY: 50, detail: 1 });
    expect(stateRef.polyline).toEqual({ pageNumber: 1, vertices: [{ x: 40, y: 50 }] });

    // Re-render with updated drawingPolyline preview
    view.rerender(
      <PageSurface
        {...baseProps}
        drawingPolyline={stateRef.polyline}
        drawingLineCurrent={stateRef.currentPt}
      />,
    );
    expect(view.getByTestId('polyline-draft-preview')).toBeInTheDocument();

    // Click 2: vertex (140, 50)
    fireEvent.mouseDown(hitTarget, { button: 0, clientX: 140, clientY: 50, detail: 1 });
    expect(stateRef.polyline?.vertices).toEqual([
      { x: 40, y: 50 },
      { x: 140, y: 50 },
    ]);

    view.rerender(
      <PageSurface
        {...baseProps}
        drawingPolyline={stateRef.polyline}
        drawingLineCurrent={stateRef.currentPt}
      />,
    );

    // Double-click at (140, 130) commits the 3-vertex polyline
    fireEvent.mouseDown(hitTarget, { button: 0, clientX: 140, clientY: 130, detail: 2 });

    expect(onCreateAnnotation).toHaveBeenCalledTimes(1);
    const created = onCreateAnnotation.mock.calls[0][0] as PdfAnnotation;
    expect(created.type).toBe('perimeter-takeoff');
    expect(created.data.coordinateSpace).toBe('page');
    expect(created.data.isPipeRun).toBe(true);
    expect(created.data.points).toEqual([40, 50, 140, 50, 140, 130]);
    expect(created.rect).toEqual({ x: 40, y: 50, width: 100, height: 80 });
  });
});
