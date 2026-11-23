import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { PageSurface } from '../DocumentWorkspace';
import * as textSelectionGeometry from '../textSelectionGeometry';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation } from '@/core/annotations/types';

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    getPageTextItems: vi.fn(),
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

function makePage(rotation = 0) {
  return {
    rotate: rotation,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 800 * scale,
      height: 1000 * scale,
      rotation,
    })),
  };
}

function makeDoc(page: ReturnType<typeof makePage>) {
  return {
    getPage: vi.fn().mockResolvedValue(page),
  } as unknown as Parameters<typeof PageSurface>[0]['doc'];
}

function textItem(text: string, x = 20, y = 30, width = 120, height = 16) {
  return {
    id: 'text-1',
    text,
    x,
    y,
    width,
    height,
    fontSize: 14,
    fontFamily: 'sans-serif',
  };
}

function selectText(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe('DocumentWorkspace - Tool Interaction Matrix (WI-A5)', () => {
  const page = makePage(0);
  const doc = makeDoc(page);

  const defaultProps = {
    doc,
    pageNumber: 1,
    scale: 1,
    activeTool: 'select' as const,
    pageAnnotations: [] as PdfAnnotation[],
    selectedAnnotationIds: [] as string[],
    activeAnnotationId: null as string | null,
    onActivate: vi.fn(),
    onCreateAnnotation: vi.fn(),
    onCreateManyAnnotations: vi.fn(),
    onCommitAnnotation: vi.fn(),
    onCommitManyAnnotations: vi.fn(),
    onDeleteAnnotation: vi.fn(),
    onSetSingleSelection: vi.fn(),
    onToggleSelection: vi.fn(),
    onClearSelection: vi.fn(),
    existingTextPageId: null,
    selectedExistingTextSourceIndex: null,
    onSelectExistingText: vi.fn(),
    onSetSelection: vi.fn(),
    drawingLineStart: null,
    drawingLineCurrent: null,
    setDrawingLineStart: vi.fn(),
    setDrawingLineCurrent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({ activeMode: 'annotate' });
    useAnnotationStore.setState({
      annotations: [],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    });
  });

  describe('1. Direct Text-Marking without bubble', () => {
    it('creates highlight annotations directly on mouseup when highlight tool is active', async () => {
      const rects = [{ x: 20, y: 30, width: 60, height: 16 }];
      const geomSpy = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue(rects);
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([textItem('Important Text')]);

      try {
        const props = { ...defaultProps, activeTool: 'highlight' as const };
        const view = render(<PageSurface {...props} />);
        await act(async () => {});

        const textSpan = view.getByText('Important Text');
        selectText(textSpan);

        const interactionLayer = view.getByTestId('annotation-interaction-layer');
        fireEvent.mouseUp(interactionLayer, { button: 0 });

        expect(props.onCreateManyAnnotations).toHaveBeenCalledTimes(1);
        expect(props.onCreateManyAnnotations).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'highlight',
            pageNumber: 1,
            rect: rects[0],
          }),
        ]);
        // Action bubble was NOT displayed
        expect(view.queryByTestId('text-selection-action-bubble')).toBeNull();
      } finally {
        geomSpy.mockRestore();
        window.getSelection()?.removeAllRanges();
      }
    });

    it('creates underline annotations directly on mouseup when underline tool is active', async () => {
      const rects = [{ x: 20, y: 30, width: 60, height: 16 }];
      const geomSpy = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue(rects);
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([textItem('Underline Text')]);

      try {
        const props = { ...defaultProps, activeTool: 'underline' as const };
        const view = render(<PageSurface {...props} />);
        await act(async () => {});

        selectText(view.getByText('Underline Text'));
        fireEvent.mouseUp(view.getByTestId('annotation-interaction-layer'), { button: 0 });

        expect(props.onCreateManyAnnotations).toHaveBeenCalledTimes(1);
        expect(props.onCreateManyAnnotations).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'underline',
            rect: rects[0],
          }),
        ]);
      } finally {
        geomSpy.mockRestore();
        window.getSelection()?.removeAllRanges();
      }
    });

    it('creates strikeout annotations directly on mouseup when strikeout tool is active', async () => {
      const rects = [{ x: 20, y: 30, width: 60, height: 16 }];
      const geomSpy = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue(rects);
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([textItem('Strikeout Text')]);

      try {
        const props = { ...defaultProps, activeTool: 'strikeout' as const };
        const view = render(<PageSurface {...props} />);
        await act(async () => {});

        selectText(view.getByText('Strikeout Text'));
        fireEvent.mouseUp(view.getByTestId('annotation-interaction-layer'), { button: 0 });

        expect(props.onCreateManyAnnotations).toHaveBeenCalledTimes(1);
        expect(props.onCreateManyAnnotations).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'strikeout',
            rect: rects[0],
          }),
        ]);
      } finally {
        geomSpy.mockRestore();
        window.getSelection()?.removeAllRanges();
      }
    });
  });

  describe('2. Fake text-mark prevention', () => {
    it('blocks empty canvas clicks from creating pseudo annotations when highlight tool is active', async () => {
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);
      const props = { ...defaultProps, activeTool: 'highlight' as const };
      const view = render(<PageSurface {...props} />);
      await act(async () => {});

      // Click on interaction layer without text selection
      window.getSelection()?.removeAllRanges();
      const interactionLayer = view.getByTestId('annotation-interaction-layer');
      fireEvent.mouseDown(interactionLayer, { clientX: 200, clientY: 200, button: 0 });
      fireEvent.mouseUp(interactionLayer, { clientX: 200, clientY: 200, button: 0 });

      // Zero annotations created!
      expect(props.onCreateAnnotation).not.toHaveBeenCalled();
      expect(props.onCreateManyAnnotations).not.toHaveBeenCalled();
    });
  });

  describe('3. Text selection action bubble in select mode', () => {
    it('shows action bubble in select mode and creates sticky-note on Note button click', async () => {
      const rects = [{ x: 40, y: 50, width: 100, height: 18 }];
      const geomSpy = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue(rects);
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([textItem('Select Mode Text', 40, 50)]);

      try {
        const props = { ...defaultProps, activeTool: 'select' as const };
        const view = render(<PageSurface {...props} />);
        await act(async () => {});

        selectText(view.getByText('Select Mode Text'));
        fireEvent.mouseUp(view.getByTestId('annotation-interaction-layer'), { button: 0 });

        // Action bubble is rendered
        const bubble = view.getByTestId('text-selection-action-bubble');
        expect(bubble).toBeInTheDocument();

        // Click Note
        fireEvent.click(view.getByTestId('bubble-action-note'));

        expect(props.onCreateAnnotation).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'sticky-note',
            pageNumber: 1,
            data: expect.objectContaining({
              text: expect.stringContaining('Select Mode Text'),
            }),
          }),
        );
      } finally {
        geomSpy.mockRestore();
        window.getSelection()?.removeAllRanges();
      }
    });
  });

  describe('4. Marquee behavior', () => {
    it('allows marquee only in select mode', async () => {
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);

      // In select mode:
      const propsSelect = { ...defaultProps, activeTool: 'select' as const };
      const viewSelect = render(<PageSurface {...propsSelect} />);
      await act(async () => {});

      const layer = viewSelect.getByTestId('annotation-interaction-layer');
      fireEvent.mouseDown(layer, { clientX: 50, clientY: 50, button: 0, buttons: 1 });
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150, buttons: 1 });

      // In select mode, marquee border div is rendered
      const marqueeEl = viewSelect.container.querySelector('.border-blue-500');
      expect(marqueeEl).not.toBeNull();
      viewSelect.unmount();

      // In highlight mode:
      const propsHighlight = { ...defaultProps, activeTool: 'highlight' as const };
      const viewHighlight = render(<PageSurface {...propsHighlight} />);
      await act(async () => {});

      const hlLayer = viewHighlight.getByTestId('annotation-interaction-layer');
      fireEvent.mouseDown(hlLayer, { clientX: 50, clientY: 50, button: 0, buttons: 1 });
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150, buttons: 1 });

      // In highlight mode, NO marquee is drawn
      const hlMarquee = viewHighlight.container.querySelector('.border-blue-500');
      expect(hlMarquee).toBeNull();
    });
  });

  describe('5. Hand tool disables markup interactions', () => {
    it('disables interaction and placement layer pointer events when hand tool is active', async () => {
      const props = { ...defaultProps, activeTool: 'hand' as const };
      const view = render(<PageSurface {...props} />);
      await act(async () => {});

      const interactionLayer = view.getByTestId('annotation-interaction-layer');
      const placementLayer = view.getByTestId('annotation-placement-layer');

      expect(interactionLayer.style.pointerEvents).toBe('none');
      expect(placementLayer.style.pointerEvents).toBe('none');
    });
  });
});
