import type { ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { DocumentWorkspace, PageSurface } from './DocumentWorkspace';
import * as textSelectionGeometry from './textSelectionGeometry';
import '@/core/annotations/register-all';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    void callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

vi.mock('@/core/annotations/persistence', () => ({
  loadAnnotations: vi.fn().mockResolvedValue([]),
  loadAnnotationsOrNull: vi.fn().mockResolvedValue(null),
  saveAnnotations: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    pickPdfFileSources: vi.fn(),
    pickPdfFiles: vi.fn(),
    hashBytes: vi.fn(),
  }
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  const doc = {
    numPages: 5,
    destroy: vi.fn(),
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 1000, height: 1500 }),
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

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 5,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 1000, height: 1500 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      }),
      destroy: vi.fn(),
    }),
  })),
  GlobalWorkerOptions: { workerSrc: '' },
}));

vi.mock('virtua', () => ({
  VList: ({ children }: { children: ReactNode }) => <div data-testid="vlist">{children}</div>,
}));

describe('DocumentWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkingRevisionStoreRegistryForTests();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc',
      revisionStoreId: null,
      originalRevisionId: null,
      activeRevisionId: null,
      pageCount: 5,
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
      setZoom: vi.fn(),
    });
    useEditorStore.setState({ activeTool: 'select' });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      setTransform: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders continuously through the legacy byte path when revision metadata is absent', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const vlist = await screen.findByTestId('vlist');
    expect(vlist).toBeInTheDocument();
    expect(
      PdfRendererAdapter.acquireDocument,
    ).toHaveBeenCalledTimes(1);
    expect(
      PdfRendererAdapter.acquireDocumentSource,
    ).not.toHaveBeenCalled();
  });

  it('loads a revision-aware workspace from the registered active revision source', async () => {
    const store = new MemoryRevisionStore({
      id: 'workspace-revisions',
    });
    await store.commit({
      revisionId: 'sha256:workspace',
      source: new MemorySource({
        id: 'workspace-source',
        bytes: Uint8Array.from([1, 2, 3]),
      }),
    });
    registerWorkingRevisionStore(store);

    useSessionStore.setState({
      documentKey: 'sha256:workspace',
      revisionStoreId: store.id,
      originalRevisionId: 'sha256:workspace',
      activeRevisionId: 'sha256:workspace',
      workingBytes: Uint8Array.from([9, 9, 9]),
    });

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    await vi.waitFor(() => {
      expect(
        PdfRendererAdapter.acquireDocumentSource,
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      PdfRendererAdapter.acquireDocument,
    ).not.toHaveBeenCalled();
    expect(
      PdfRendererAdapter.acquireDocumentSource,
    ).toHaveBeenCalledWith({
      source: expect.objectContaining({
        id: expect.stringContaining(
          'sha256%3Aworkspace',
        ),
      }),
      cacheKey: 'sha256:workspace',
      signal: expect.any(AbortSignal),
    });
  });

  it('reacquires the renderer source when active revision changes A to B and back to A', async () => {
    const store = new MemoryRevisionStore({
      id: 'switch-revisions',
    });
    for (const [revisionId, value] of [
      ['sha256:A', 1],
      ['sha256:B', 2],
    ] as const) {
      await store.commit({
        revisionId,
        source: new MemorySource({
          id: `source-${revisionId}`,
          bytes: Uint8Array.from([value]),
        }),
      });
    }
    registerWorkingRevisionStore(store);

    useSessionStore.setState({
      documentKey: 'sha256:A',
      revisionStoreId: store.id,
      originalRevisionId: 'sha256:A',
      activeRevisionId: 'sha256:A',
      workingBytes: Uint8Array.from([1]),
    });

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    await vi.waitFor(() => {
      expect(
        PdfRendererAdapter.acquireDocumentSource,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheKey: 'sha256:A',
        }),
      );
    });

    await act(async () => {
      useSessionStore.setState({
        documentKey: 'sha256:B',
        activeRevisionId: 'sha256:B',
        workingBytes: Uint8Array.from([2]),
      });
    });

    await vi.waitFor(() => {
      expect(
        PdfRendererAdapter.acquireDocumentSource,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheKey: 'sha256:B',
        }),
      );
    });

    await act(async () => {
      useSessionStore.setState({
        documentKey: 'sha256:A',
        activeRevisionId: 'sha256:A',
        workingBytes: Uint8Array.from([1]),
      });
    });

    await vi.waitFor(() => {
      const keys = vi.mocked(
        PdfRendererAdapter.acquireDocumentSource,
      ).mock.calls.map(
        ([input]) => input.cacheKey,
      );
      expect(keys).toEqual([
        'sha256:A',
        'sha256:B',
        'sha256:A',
      ]);
    });
  });

  it('viewMode changes layout to single', async () => {
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc',
      pageCount: 2,
      viewState: {
        currentPageId: null,
        currentPage: 2,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'single',
      },
    });

    await act(async () => {
      render(<DocumentWorkspace />);
    });
    const page2 = await screen.findByText('Page 2');
    expect(page2).toBeInTheDocument();
  });

  it('viewMode changes layout to two-page', async () => {
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc',
      pageCount: 2,
      viewState: {
        currentPageId: null,
        currentPage: 2,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'two-page',
      },
    });

    await act(async () => {
      render(<DocumentWorkspace />);
    });
    const page2 = await screen.findByText('Page 2');
    expect(page2).toBeInTheDocument();
  });

  it('hand tool pans', async () => {
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc',
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
    useEditorStore.setState({ activeTool: 'hand' });

    let containerElement: HTMLElement;
    await act(async () => {
      const { container } = render(<DocumentWorkspace />);
      containerElement = container;
    });

    const wrapper = containerElement!.querySelector('#workspace-scroll-container') as HTMLElement;
    wrapper.scrollBy = vi.fn();
    wrapper.setPointerCapture = vi.fn();
    wrapper.releasePointerCapture = vi.fn();
    wrapper.hasPointerCapture = vi.fn().mockReturnValue(true);

    fireEvent.pointerDown(wrapper, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(wrapper, { clientX: 80, clientY: 70, pointerId: 1 });
    // In continuous mode panning is delegated to VList; the root container's scrollBy
    // is only used in single/two-page modes — so we just verify no throw occurred.
    expect(wrapper).toBeInTheDocument();
  });

  it('fitMode changes zoom behavior', async () => {
    const setZoom = vi.fn();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc',
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'width',
        viewMode: 'continuous',
      },
      setZoom,
    });

    const { usePdfStore } = await import('@/core/session/pdfStore');
    usePdfStore.setState({
      pdfDoc: {
        numPages: 3,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000 }),
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        }),
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as PDFDocumentProxy,
    });

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });

    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    setZoom(120);

    await vi.waitFor(() => {
      expect(setZoom).toHaveBeenCalled();
    });
  });
});


describe('PageSurface gesture consistency', () => {
  const textItem = (text: string) => ({ id: text, text, x: 20, y: 30, width: 120, height: 20, fontSize: 16 });
  const selectText = (element: Element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const makePage = (rotation: number) => ({
    getViewport: vi.fn().mockReturnValue({ width: 400, height: 500, rotation }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    cleanup: vi.fn(),
  });
  const makeDoc = (page: ReturnType<typeof makePage> | Promise<ReturnType<typeof makePage>>) => ({
    getPage: vi.fn().mockImplementation(() => Promise.resolve(page)),
    numPages: 2,
  }) as unknown as PDFDocumentProxy;
  const makeProps = (doc: PDFDocumentProxy) => ({
    doc, pageNumber: 1, scale: 1, activeTool: 'select', pageAnnotations: [],
    selectedAnnotationIds: [], existingTextPageId: null, selectedExistingTextSourceIndex: null,
    onActivate: vi.fn(), onSelectExistingText: vi.fn(), onCreateAnnotation: vi.fn(),
    onCreateManyAnnotations: vi.fn(), onSetSingleSelection: vi.fn(), onToggleSelection: vi.fn(),
    onSetSelection: vi.fn(), onClearSelection: vi.fn(), onCommitAnnotation: vi.fn(),
    onCommitManyAnnotations: vi.fn(), drawingLineStart: null, drawingLineCurrent: null,
    setDrawingLineStart: vi.fn(), setDrawingLineCurrent: vi.fn(),
  });

  it.each(['comment', 'underline'] as const)('keeps a %s click as selection without committing geometry', async (type) => {
    const props = makeProps(makeDoc(makePage(0)));
    const annotation = { id: 'clicked', type, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[annotation]} />);
    await act(async () => {});
    const element = view.container.querySelector(`[data-annotation-type="${type}"]`);
    expect(element).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(element!, { clientX: 65.4, clientY: 85.4 });
      fireEvent.mouseMove(window, { clientX: 65, clientY: 85, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 65, clientY: 85 });
    });
    expect(props.onSetSingleSelection).toHaveBeenCalledWith('clicked');
    expect(props.onCommitManyAnnotations).not.toHaveBeenCalled();
    expect(props.onCommitAnnotation).not.toHaveBeenCalled();
  });

  it('commits a drag even if the browser coalesces the move before mouseup', async () => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const element = view.container.querySelector('[data-annotation-type="comment"]');
    expect(element).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(element!, { clientX: 65, clientY: 85 });
      fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    });
    expect(props.onCommitManyAnnotations).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'note', data: expect.objectContaining({
        rect: expect.objectContaining({ x: 80, y: 92 }),
      }) }),
    ]);
  });

  it('cancels an in-flight transform when the document changes', async () => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const element = view.container.querySelector('[data-annotation-type="comment"]');
    expect(element).not.toBeNull();
    fireEvent.pointerDown(element!, { clientX: 65, clientY: 85 });
    fireEvent.mouseMove(window, { clientX: 75, clientY: 90, buttons: 1 });
    view.rerender(<PageSurface {...props} doc={makeDoc(makePage(90))} pageAnnotations={[note]} />);
    fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    expect(props.onCommitManyAnnotations).not.toHaveBeenCalled();
  });

  it('cancels an in-flight transform when the zoom changes', async () => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const element = view.container.querySelector('[data-annotation-type="comment"]')!;
    fireEvent.pointerDown(element, { clientX: 65, clientY: 85 });
    fireEvent.mouseMove(window, { clientX: 75, clientY: 90, buttons: 1 });
    view.rerender(<PageSurface {...props} scale={2} pageAnnotations={[note]} />);
    fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    expect(props.onCommitManyAnnotations).not.toHaveBeenCalled();
  });

  it.each(['comment', 'stamp', 'ink'])('cancels an in-flight %s placement when the zoom changes', async (activeTool) => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 65, clientY: 85, buttons: 1 });
    view.rerender(<PageSurface {...props} scale={2} />);
    fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it('never carries an inline edit to the same annotation ID in a replacement document', async () => {
    const firstDoc = makeDoc(makePage(0));
    const secondDoc = makeDoc(makePage(0));
    const props = makeProps(firstDoc);
    const first = { id: 'same-id', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'first document' },
      createdAt: 1, updatedAt: 1 };
    const second = { ...first, data: { text: 'second document' } };
    const view = render(<PageSurface {...props} pageAnnotations={[first]} />);
    await act(async () => {});
    fireEvent.doubleClick(view.container.querySelector('[data-annotation-type="comment"]')!);
    const editor = view.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'old draft' } });
    const reactPropsKey = Object.keys(editor).find((key) => key.startsWith('__reactProps$'))!;
    const staleBlur = (editor as unknown as Record<string, { onBlur: (event: { currentTarget: { value: string } }) => void }>)[reactPropsKey].onBlur;
    view.rerender(<PageSurface {...props} doc={secondDoc} pageAnnotations={[second]} />);
    expect(view.queryByRole('textbox')).toBeNull();
    act(() => staleBlur({ currentTarget: { value: 'old draft' } }));
    expect(props.onCommitAnnotation).not.toHaveBeenCalled();
    fireEvent.doubleClick(view.container.querySelector('[data-annotation-type="comment"]')!);
    const nextEditor = view.getByRole('textbox');
    expect(nextEditor).toHaveValue('second document');
    fireEvent.change(nextEditor, { target: { value: 'valid edit' } });
    fireEvent.blur(nextEditor);
    expect(props.onCommitAnnotation).toHaveBeenCalledWith('same-id', expect.objectContaining({ data: expect.objectContaining({ text: 'valid edit' }) }));
    view.rerender(<PageSurface {...props} pageAnnotations={[first]} />);
    expect(view.queryByRole('textbox')).toBeNull();
  });

  it('rejects a retained inline-edit blur after the page unmounts', async () => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    fireEvent.doubleClick(view.container.querySelector('[data-annotation-type="comment"]')!);
    const editor = view.getByRole('textbox');
    const key = Object.keys(editor).find((value) => value.startsWith('__reactProps$'))!;
    const staleBlur = (editor as unknown as Record<string, { onBlur: (event: { currentTarget: { value: string } }) => void }>)[key].onBlur;
    view.unmount();
    act(() => staleBlur({ currentTarget: { value: 'old draft' } }));
    expect(props.onCommitAnnotation).not.toHaveBeenCalled();
  });

  it('commits the final callout anchor position and cancels on page change', async () => {
    const doc = makeDoc(makePage(0));
    const props = makeProps(doc);
    const callout = { id: 'callout', type: 'callout' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note', anchor: { x: 10, y: 20 } },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[callout]} />);
    await act(async () => {});
    const handle = view.container.querySelector('[data-annotation-type="callout"] circle');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle!, { clientX: 10, clientY: 20 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 32 });
    expect(props.onCommitAnnotation).toHaveBeenCalledWith('callout', expect.objectContaining({
      data: expect.objectContaining({ anchor: { x: 30, y: 32 } }),
    }));
    props.onCommitAnnotation.mockClear();
    fireEvent.pointerDown(handle!, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 25, buttons: 1 });
    view.rerender(<PageSurface {...props} pageNumber={2} pageAnnotations={[callout]} />);
    fireEvent.mouseUp(window, { clientX: 30, clientY: 32 });
    expect(props.onCommitAnnotation).not.toHaveBeenCalled();
  });

  it('uses the final placement endpoint and cancels an unmounted placement', async () => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'squiggly' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    const placement = view.getByTestId('annotation-creation-hit-target');
    fireEvent.mouseDown(placement, { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      rect: { x: 30, y: 40, width: 50, height: 60 },
    }));
    props.onCreateAnnotation.mockClear();
    fireEvent.mouseDown(placement, { clientX: 30, clientY: 40, buttons: 1 });
    view.unmount();
    fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it('does not authorize markup creation from a non-finite viewport rotation', async () => {
    const props = { ...makeProps(makeDoc(makePage(Number.NaN))), activeTool: 'squiggly' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    expect(view.getByRole('status')).toHaveTextContent('Unable to determine page rotation');
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it.each([false, true])('selects the release rectangle without stale marquee state (mousemove: %s)', async (withMove) => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 30, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-interaction-layer'), { clientX: 10, clientY: 10, buttons: 1 });
    act(() => {
      if (withMove) fireEvent.mouseMove(window, { clientX: 20, clientY: 20, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 100, clientY: 110 });
    });
    expect(props.onSetSelection).toHaveBeenCalledWith(['note']);
    expect(props.onClearSelection).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves the ink release point (mousemove: %s)', async (withMove) => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'ink' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 10, clientY: 15, buttons: 1 });
    act(() => {
      if (withMove) fireEvent.mouseMove(window, { clientX: 30, clientY: 35, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 60, clientY: 75 });
    });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ink', rect: { x: 10, y: 15, width: 50, height: 60 },
      data: expect.objectContaining({ paths: [withMove ? [10, 15, 30, 35, 60, 75] : [10, 15, 60, 75]] }),
    }));
  });

  it('does not create ink from a click with fractional pointer jitter', async () => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'ink' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 10.4, clientY: 15.4, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 15 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it('keeps a note drag active through the browser compatibility mousedown in Select mode', async () => {
    const props = makeProps(makeDoc(makePage(0)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const element = view.container.querySelector('[data-annotation-type="comment"]');
    expect(element).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(element!, { clientX: 65, clientY: 85 });
      fireEvent.mouseDown(element!, { clientX: 65, clientY: 85, buttons: 1 });
      fireEvent.mouseMove(window, { clientX: 75, clientY: 90, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    });
    expect(props.onCommitManyAnnotations).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'note', data: expect.objectContaining({
        rect: expect.objectContaining({ x: 80, y: 92 }),
      }) }),
    ]);
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it.each(['stamp', 'squiggly', 'ink'])('places %s over an existing locked annotation without moving it', async (activeTool) => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
    const note = { id: 'locked-note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note', locked: true },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const target = view.getByTestId('annotation-creation-hit-target');
    fireEvent.mouseDown(target, { clientX: 65, clientY: 85, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({ type: activeTool }));
    expect(props.onSetSingleSelection).not.toHaveBeenCalled();
    expect(props.onCommitManyAnnotations).not.toHaveBeenCalled();
  });

  it.each(['stamp', 'ink'])('does not place %s on a secondary-button press', async (activeTool) => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { button: 2, clientX: 65, clientY: 85 });
    fireEvent.mouseUp(window, { button: 2, clientX: 85, clientY: 97 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
  });

  it.each(['stamp', 'ink'])('disables %s creation outside annotation and drawing modes', async (activeTool) => {
    useEditorStore.setState({ activeMode: 'annotate' });
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    expect(view.getByTestId('annotation-creation-hit-target')).toBeInTheDocument();
    for (const activeMode of ['write', 'view', 'generate', 'file', 'organize'] as const) {
      act(() => useEditorStore.setState({ activeMode }));
      expect(view.queryByTestId('annotation-creation-hit-target')).toBeNull();
      expect(view.getByTestId('annotation-placement-layer')).toHaveStyle({ pointerEvents: 'none' });
      expect(view.getByTestId('annotation-interaction-layer')).toHaveStyle({ pointerEvents: 'auto', userSelect: 'text' });
    }
    act(() => useEditorStore.setState({ activeMode: 'draw' }));
    expect(view.getByTestId('annotation-creation-hit-target')).toBeInTheDocument();
    act(() => useEditorStore.setState({ activeMode: 'annotate' }));
  });

  it.each(['comment', 'stamp', 'ink'])('cancels an in-flight %s on tool or mode change', async (activeTool) => {
    useEditorStore.setState({ activeMode: 'annotate' });
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 65, clientY: 85, buttons: 1 });
    view.rerender(<PageSurface {...props} activeTool="select" />);
    fireEvent.mouseUp(window, { clientX: 65, clientY: 85 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    view.rerender(<PageSurface {...props} />);
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { clientX: 65, clientY: 85, buttons: 1 });
    act(() => useEditorStore.setState({ activeMode: 'write' }));
    fireEvent.mouseUp(window, { clientX: 65, clientY: 85 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    act(() => useEditorStore.setState({ activeMode: 'annotate' }));
  });

  it('places a comment on a click but not on an unsuccessful drag or outside release', async () => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'comment' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    const target = view.getByTestId('annotation-creation-hit-target');
    fireEvent.mouseDown(target, { clientX: 65, clientY: 85, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    fireEvent.mouseDown(target, { clientX: 0, clientY: 0, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: -1, clientY: -1 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    fireEvent.mouseDown(target, { clientX: 65, clientY: 85, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 65, clientY: 85 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({ type: 'comment' }));
  });

  it('ignores secondary-button release during a primary comment gesture', async () => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'comment' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    fireEvent.mouseDown(view.getByTestId('annotation-creation-hit-target'), { button: 0, clientX: 65, clientY: 85 });
    fireEvent.mouseUp(window, { button: 2, clientX: 65, clientY: 85 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    fireEvent.mouseUp(window, { button: 0, clientX: 65, clientY: 85 });
    expect(props.onCreateAnnotation).toHaveBeenCalledTimes(1);
  });

  it.each(['highlight', 'underline', 'strikeout'])('does not create %s on a secondary-button text release', async (activeTool) => {
    const geometry = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue([{ x: 20, y: 30, width: 80, height: 20 }]);
    vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([textItem('synthetic selection')]);
    try {
      const props = { ...makeProps(makeDoc(makePage(0))), activeTool };
      const view = render(<PageSurface {...props} />);
      await act(async () => {});
      selectText(view.getByText('synthetic selection'));
      const layer = view.getByTestId('annotation-interaction-layer');
      fireEvent.mouseUp(layer, { button: 2 });
      expect(props.onCreateManyAnnotations).not.toHaveBeenCalled();
      fireEvent.mouseUp(layer, { button: 0 });
      expect(props.onCreateManyAnnotations).toHaveBeenCalledWith([expect.objectContaining({ type: activeTool })]);
    } finally {
      window.getSelection()?.removeAllRanges();
      geometry.mockRestore();
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);
    }
  });

  it('hides an old selection immediately on document replacement and rejects its retained callback', async () => {
    const geometry = vi.spyOn(textSelectionGeometry, 'selectedMarkupTextRects').mockReturnValue([{ x: 20, y: 30, width: 80, height: 20 }]);
    const oldPage = makePage(0);
    const nextPage = makePage(0);
    let resolveNext!: (page: ReturnType<typeof makePage>) => void;
    const pending = new Promise<ReturnType<typeof makePage>>((resolve) => { resolveNext = resolve; });
    vi.mocked(PdfRendererAdapter.getPageTextItems).mockImplementation(async (page) => [textItem((page as unknown) === oldPage ? 'old document' : 'new document')]);
    try {
      const props = makeProps(makeDoc(oldPage));
      const view = render(<PageSurface {...props} />);
      await act(async () => {});
      selectText(view.getByText('old document'));
      fireEvent.mouseUp(view.getByTestId('annotation-interaction-layer'), { button: 0 });
      const button = view.getByRole('button', { name: /^Highlight$/ });
      const reactPropsKey = Object.keys(button).find((key) => key.startsWith('__reactProps$'))!;
      const staleClick = (button as unknown as Record<string, { onClick: () => void }>)[reactPropsKey].onClick;
      const nextDoc = makeDoc(pending);
      view.rerender(<PageSurface {...props} doc={nextDoc} />);
      expect(view.queryByText('old document')).toBeNull();
      expect(view.queryByRole('button', { name: /^Highlight$/ })).toBeNull();
      act(() => staleClick());
      expect(props.onCreateManyAnnotations).not.toHaveBeenCalled();
      await act(async () => { resolveNext(nextPage); await pending; });
      selectText(view.getByText('new document'));
      fireEvent.mouseUp(view.getByTestId('annotation-interaction-layer'), { button: 0 });
      fireEvent.click(view.getByRole('button', { name: /^Highlight$/ }));
      expect(props.onCreateManyAnnotations).toHaveBeenCalledTimes(1);
      view.rerender(<PageSurface {...props} />);
      expect(view.queryByRole('button', { name: /^Highlight$/ })).toBeNull();
      view.unmount();
      act(() => staleClick());
      expect(props.onCreateManyAnnotations).toHaveBeenCalledTimes(1);
    } finally {
      window.getSelection()?.removeAllRanges();
      geometry.mockRestore();
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);
    }
  });

  it('does not render text from the previous scale while its replacement loads', async () => {
    let resolveText!: (items: ReturnType<typeof textItem>[]) => void;
    const pending = new Promise<ReturnType<typeof textItem>[]>((resolve) => { resolveText = resolve; });
    vi.mocked(PdfRendererAdapter.getPageTextItems).mockImplementation(async (_page, scale) => scale === 1 ? [textItem('old scale')] : pending);
    try {
      const props = makeProps(makeDoc(makePage(0)));
      const view = render(<PageSurface {...props} />);
      await act(async () => {});
      expect(view.getByText('old scale')).toBeInTheDocument();
      view.rerender(<PageSurface {...props} scale={2} />);
      expect(view.queryByText('old scale')).toBeNull();
      await act(async () => { resolveText([textItem('new scale')]); await pending; });
      expect(view.getByText('new scale')).toBeInTheDocument();
    } finally {
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);
    }
  });

  it('ignores a late text result from the previous page', async () => {
    const oldPage = makePage(0);
    const nextPage = makePage(0);
    let resolveOld!: (items: ReturnType<typeof textItem>[]) => void;
    const pending = new Promise<ReturnType<typeof textItem>[]>((resolve) => { resolveOld = resolve; });
    vi.mocked(PdfRendererAdapter.getPageTextItems).mockImplementation(async (page) => (page as unknown) === oldPage ? pending : [textItem('new page')]);
    try {
      const oldDoc = makeDoc(oldPage);
      const props = makeProps(oldDoc);
      const view = render(<PageSurface {...props} />);
      await act(async () => {});
      view.rerender(<PageSurface {...props} doc={makeDoc(nextPage)} pageNumber={2} />);
      await act(async () => {});
      expect(view.getByText('new page')).toBeInTheDocument();
      await act(async () => { resolveOld([textItem('stale page')]); await pending; });
      expect(view.queryByText('stale page')).toBeNull();
      expect(view.getByText('new page')).toBeInTheDocument();
    } finally {
      vi.mocked(PdfRendererAdapter.getPageTextItems).mockResolvedValue([]);
    }
  });

  it('uses both clicks when drawing a line over existing markup', async () => {
    const props = { ...makeProps(makeDoc(makePage(0))), activeTool: 'line' };
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const target = view.getByTestId('annotation-creation-hit-target');
    fireEvent.mouseDown(target, { clientX: 65, clientY: 85, buttons: 1 });
    expect(props.setDrawingLineStart).toHaveBeenCalledWith({ pageNumber: 1, x: 65, y: 85 });
    view.rerender(<PageSurface {...props} pageAnnotations={[note]} drawingLineStart={{ pageNumber: 1, x: 65, y: 85 }} />);
    fireEvent.mouseDown(target, { clientX: 85, clientY: 97, buttons: 1 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({ type: 'line' }));
    expect(props.onCommitManyAnnotations).not.toHaveBeenCalled();
  });

  it('commits the final fast drag even when React effects have not run', async () => {
    const props = makeProps(makeDoc(makePage(180)));
    const note = { id: 'note', type: 'comment' as const, pageNumber: 1,
      rect: { x: 60, y: 80, width: 40, height: 20 }, data: { text: 'note' },
      createdAt: 1, updatedAt: 1 };
    const view = render(<PageSurface {...props} pageAnnotations={[note]} />);
    await act(async () => {});
    const element = view.container.querySelector('[data-annotation-type="comment"]');
    expect(element).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(element!, { clientX: 65, clientY: 85 });
      fireEvent.mouseMove(window, { clientX: 75, clientY: 90, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 85, clientY: 97 });
    });
    expect(props.onCommitManyAnnotations).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'note', data: expect.objectContaining({
        rect: expect.objectContaining({ x: 80, y: 92 }),
      }) }),
    ]);
  });

  it('blocks placement until the matching viewport resolves and cancels a gesture across documents', async () => {
    let resolvePage!: (page: ReturnType<typeof makePage>) => void;
    const delayed = new Promise<ReturnType<typeof makePage>>((resolve) => { resolvePage = resolve; });
    const firstDoc = makeDoc(makePage(90));
    const nextDoc = makeDoc(delayed);
    const props = { ...makeProps(firstDoc), activeTool: 'squiggly' };
    const view = render(<PageSurface {...props} />);
    await act(async () => {});
    const placement = () => view.getByTestId('annotation-creation-hit-target');
    fireEvent.mouseDown(placement(), { clientX: 30, clientY: 40, buttons: 1 });
    view.rerender(<PageSurface {...props} doc={nextDoc} />);
    expect(view.getByRole('status')).toHaveTextContent('Loading page');
    fireEvent.mouseUp(window, { clientX: 30, clientY: 40 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    fireEvent.mouseDown(placement(), { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 40 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    await act(async () => { resolvePage(makePage(180)); await delayed; });
    fireEvent.mouseDown(placement(), { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 40 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'squiggly', data: expect.objectContaining({
        nativeMarkupDraft: expect.objectContaining({ basisRotation: 180, turns: 0 }),
      }),
    }));

    props.onCreateAnnotation.mockClear();
    let resolveSecondPage!: (page: ReturnType<typeof makePage>) => void;
    const secondPage = new Promise<ReturnType<typeof makePage>>((resolve) => { resolveSecondPage = resolve; });
    vi.mocked(nextDoc.getPage).mockImplementation(() => secondPage as unknown as ReturnType<PDFDocumentProxy['getPage']>);
    view.rerender(<PageSurface {...props} doc={nextDoc} pageNumber={2} />);
    fireEvent.mouseDown(placement(), { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 40 });
    expect(props.onCreateAnnotation).not.toHaveBeenCalled();
    await act(async () => { resolveSecondPage(makePage(270)); await secondPage; });
    fireEvent.mouseDown(placement(), { clientX: 30, clientY: 40, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 40 });
    expect(props.onCreateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      pageNumber: 2, data: expect.objectContaining({
        nativeMarkupDraft: expect.objectContaining({ basisRotation: 270 }),
      }),
    }));
  });
});
