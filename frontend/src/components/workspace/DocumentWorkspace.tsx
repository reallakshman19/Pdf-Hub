import React from 'react';
import { UploadCloud } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { VList } from 'virtua';

import { PdfRendererAdapter, type TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation, Rect, AnnotationType, Point2D, AnnotationNodeProps } from '@/core/annotations/types';
import { isAnnotationType, TEXT_SELECTION_TYPES } from '@/core/annotations/annotationTypes';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useReviewStore } from '@/core/review/store';
import { annotationRegistry } from '../../core/annotations/registry';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';
import { useAnnotationPersistence } from './useAnnotationPersistence';

import { usePageRenderer } from '@/core/renderer/usePageRenderer';

import { useSearchStore } from '@/core/search/store';
import { SearchIndexer } from '@/core/search/indexer';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { WriterOverlay } from '@/components/writer/WriterOverlay';
import { WriterOverlayLayer } from '@/components/writer-v2/WriterOverlayLayer';
import { resetInteractionState } from '@/core/editor/resetInteraction';
import { error as logError } from '@/core/logger/service';

type TransformState =
  | {
      ids: string[];
      targetId: string;
      mode: 'move' | 'resize';
      startClientX: number;
      startClientY: number;
      startRects: Record<string, Rect>;
      startAnchors: Record<string, Point2D | null>;
      startKnees: Record<string, Point2D | null>;
      startPoints: Record<string, number[] | null>;
      pageWidth: number;
      pageHeight: number;
    }
  | null;

type AnchorDragState =
  | {
      id: string;
      startClientX: number;
      startClientY: number;
      startAnchor: Point2D;
      startKnee: Point2D | null;
      pageWidth: number;
      pageHeight: number;
    }
  | null;

type TextSelectionDraft = {
  text: string;
  rects: Rect[];
  unionRect: Rect;
};

type AnnotationRendererProps = AnnotationNodeProps<AnnotationType> & {
  anchorPoint?: Point2D | null;
  kneePoint?: Point2D | null;
  onAnchorDragStart?: (event: React.PointerEvent<SVGCircleElement>) => void;
};

export const DocumentWorkspace: React.FC = () => {
  const {
    annotations,
    setAnnotations,
    addAnnotation,
    updateAnnotation,
    updateManyAnnotations,
    setActiveAnnotationId,
    selectedAnnotationIds,
    setSelection,
    toggleSelection,
    clearSelection,
  } = useAnnotationStore();

  const {
    workingBytes,
    documentKey,
    viewState,
    setPage,
    setZoom,
    openDocument,
  } = useSessionStore();

  const { activeTool } = useEditorStore();
  const { hideResolved } = useReviewStore();
  const setSharedPdfDoc = usePdfStore((state) => state.setPdfDoc);

  const [pdfDoc, setPdfDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [restoredCount, setRestoredCount] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const lastPanPos = React.useRef<{ x: number; y: number } | null>(null);

  const handleBrowse = async () => {
    try {
      const [picked] = await FileAdapter.pickPdfFiles(false);
      if (!picked) return;

      const safeBytes = new Uint8Array(picked.bytes);
      const pageCount = await PdfEditAdapter.countPages(safeBytes);
      const nextDocumentKey = await FileAdapter.hashBytes(safeBytes);

      openDocument({
        documentKey: nextDocumentKey,
        fileName: picked.name,
        bytes: safeBytes,
        pageCount,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setLoadError(String(err));
    }
  };

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!workingBytes) {
        setPdfDoc(null);
        setSharedPdfDoc(null);
        setLoadError(null);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const doc = await PdfRendererAdapter.loadDocument(workingBytes);
        if (cancelled) {
          return;
        }

        setPdfDoc(doc);
        setSharedPdfDoc(doc);

        if (documentKey && !SearchIndexer.getCache(documentKey)) {
          // Cache text indexing for regex/word search
          const pagesText: Record<number, import('@/core/search/types').PageTextItem[]> = {};
          for (let i = 1; i <= doc.numPages; i++) {
            if (cancelled) break;
            const pageProxy = await doc.getPage(i);
            const textItems = await PdfRendererAdapter.getPageTextItems(pageProxy, 1.0);
            pagesText[i] = textItems.map(item => ({
              str: item.text,
              rect: { x: item.x, y: item.y, width: item.width, height: item.height }
            }));
            pageProxy.cleanup();
          }
          SearchIndexer.setCache(documentKey, pagesText);
        }

      } catch (err) {
        if (!cancelled) {
          setLoadError(String(err));
          setPdfDoc(null);
          setSharedPdfDoc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [workingBytes, documentKey, setSharedPdfDoc]);

  useAnnotationPersistence({
    documentKey,
    pdfDoc,
    annotations,
    setAnnotations,
    setRestoredCount,
  });

  React.useLayoutEffect(() => {
    if (!pdfDoc || !containerRef.current || viewState.fitMode === 'manual') return;

    let resizeTimer: number;

    const handleResize = async () => {
      if (!pdfDoc || !containerRef.current) return;
      try {
        const page = await pdfDoc.getPage(viewState.currentPage);
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current.clientWidth - 32;
        const containerHeight = containerRef.current.clientHeight - 32;

        if (viewState.fitMode === 'width') {
          const newZoom = (containerWidth / viewport.width) * 100;
          setZoom(Math.floor(newZoom));
        } else if (viewState.fitMode === 'page') {
          const scaleWidth = containerWidth / viewport.width;
          const scaleHeight = containerHeight / viewport.height;
          const newZoom = Math.min(scaleWidth, scaleHeight) * 100;
          setZoom(Math.floor(newZoom));
        }
      } catch {
        // Ignore viewport calculation failures during transitional renders.
      }
    };

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => void handleResize(), 100);
    });

    observer.observe(containerRef.current);
    void handleResize();

    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [pdfDoc, viewState.fitMode, viewState.currentPage, setZoom]);

  // Track which page is most visible in the scroll container and update currentPage accordingly.
  // This keeps the thumbnail strip and status bar in sync when the user scrolls continuously.
  const visibleRatiosRef = React.useRef(new Map<number, number>());
  React.useEffect(() => {
    const root = containerRef.current;
    if (!root || !pdfDoc) return;

    visibleRatiosRef.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (Number.isFinite(page) && page > 0) {
            visibleRatiosRef.current.set(page, entry.intersectionRatio);
          }
        }
        const best = [...visibleRatiosRef.current.entries()]
          .sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0.2) {
          setPage(best[0]);
        }
      },
      { root, threshold: [0.1, 0.25, 0.5, 0.75, 1] },
    );

    root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdfDoc, viewState.viewMode, setPage]);

  const sortedVisibleAnnotations = React.useMemo(
    () =>
      annotations
        .filter((annotation) => !hideResolved || annotation.data.review?.status !== 'resolved')
        .slice()
        .sort((a, b) => {
          if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
          return readZIndex(a) - readZIndex(b);
        }),
    [annotations, hideResolved],
  );

  const pageAnnotationsMap = React.useMemo(() => {
    const byPage = new Map<number, PdfAnnotation[]>();
    for (const annotation of sortedVisibleAnnotations) {
      const existing = byPage.get(annotation.pageNumber);
      if (existing) {
        existing.push(annotation);
      } else {
        byPage.set(annotation.pageNumber, [annotation]);
      }
    }
    return byPage;
  }, [sortedVisibleAnnotations]);

  const emptyPageAnnotations = React.useMemo<PdfAnnotation[]>(() => [], []);

  if (!workingBytes) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-100 dark:bg-slate-950/50">
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-6">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Open a PDF to get started
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
            Drag &amp; drop a file here, or click below.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-8">
            Supports PDF up to 500 MB.
          </p>
          <button
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
            onClick={handleBrowse}
          >
            Browse Files
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            or paste a file with <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">⌘V</kbd>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-500">Loading PDF…</div>;
  }

  if (loadError) {
    return <div className="h-full flex items-center justify-center text-red-600">Failed to load PDF: {loadError}</div>;
  }

  if (!pdfDoc) return null;

  const renderPage = (index: number) => {
    const pageNumber = index + 1;
    return (
      <div key={pageNumber} className="flex justify-center mb-8">
        <PageSurfaceMemo
          doc={pdfDoc}
          pageNumber={pageNumber}
          scale={viewState.zoom / 100}
          activeTool={activeTool}
          pageAnnotations={pageAnnotationsMap.get(pageNumber) ?? emptyPageAnnotations}
          selectedAnnotationIds={selectedAnnotationIds}
          onActivate={() => setPage(pageNumber)}
          onCreateAnnotation={(annotation) => {
            addAnnotation(annotation);
            setSelection([annotation.id]);
            setActiveAnnotationId(annotation.id);
          }}
          onCreateManyAnnotations={(items) => {
            items.forEach((item) => addAnnotation(item));
            if (items.length > 0) {
              const ids = items.map((item) => item.id);
              setSelection(ids);
              setActiveAnnotationId(ids[0] ?? null);
            }
          }}
          onSetSingleSelection={(id) => {
            setSelection([id]);
            setActiveAnnotationId(id);
          }}
          onToggleSelection={(id) => {
            toggleSelection(id);
            setActiveAnnotationId(id);
          }}
          onSetSelection={(ids) => {
            setSelection(ids);
            setActiveAnnotationId(ids[0] ?? null);
          }}
          onClearSelection={clearSelection}
          onCommitAnnotation={(id, patch) => {
            updateAnnotation(id, patch);
          }}
          onCommitManyAnnotations={(updates) => {
            updateManyAnnotations(updates);
          }}
        />
      </div>
    );
  };

  const renderSingle = () => (
    <div className="flex flex-col items-center">
      {renderPage(viewState.currentPage - 1)}
    </div>
  );

  const renderTwoPage = () => {
    const pages: React.ReactNode[] = [];
    let i = 0;
    while (i < pdfDoc.numPages) {
      if (i === 0) {
        pages.push(
          <div key={`spread-${i}`} className="flex justify-center gap-8 mb-8 w-full">
            <div className="flex-1 flex justify-end" />
            <div className="flex-1 flex justify-start">{renderPage(i)}</div>
          </div>,
        );
        i += 1;
      } else {
        const leftIndex = i;
        const rightIndex = i + 1 < pdfDoc.numPages ? i + 1 : null;
        pages.push(
          <div key={`spread-${i}`} className="flex justify-center gap-8 mb-8 w-full max-w-[2000px]">
            <div className="flex-1 flex justify-end">{renderPage(leftIndex)}</div>
            <div className="flex-1 flex justify-start">
              {rightIndex !== null ? renderPage(rightIndex) : null}
            </div>
          </div>,
        );
        i += 2;
      }
    }

    const currentSpreadIndex =
      viewState.currentPage === 1 ? 0 : Math.floor(viewState.currentPage / 2);

    return <div className="flex flex-col items-center w-full">{pages[currentSpreadIndex]}</div>;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'hand') return;
    setIsPanning(true);
    lastPanPos.current = { x: event.clientX, y: event.clientY };
    if (containerRef.current) {
      containerRef.current.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || activeTool !== 'hand' || !lastPanPos.current || !containerRef.current) return;
    const dx = event.clientX - lastPanPos.current.x;
    const dy = event.clientY - lastPanPos.current.y;
    containerRef.current.scrollBy(-dx, -dy);
    lastPanPos.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'hand') return;
    setIsPanning(false);
    lastPanPos.current = null;
    if (containerRef.current && containerRef.current.hasPointerCapture(event.pointerId)) {
      containerRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      id="workspace-scroll-container"
      className={`flex flex-col h-full bg-slate-200 dark:bg-slate-950 overflow-auto ${
        activeTool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {restoredCount > 0 && (
        <div className="sticky top-0 z-50 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 shadow-sm">
          <span>📋 {restoredCount} annotation{restoredCount !== 1 ? 's' : ''} restored from previous session.</span>
          <button
            className="ml-auto text-xs underline hover:text-amber-900 shrink-0"
            onClick={() => { setAnnotations([]); setRestoredCount(0); }}
          >
            Clear all
          </button>
          <button
            className="text-xs text-amber-500 hover:text-amber-700 shrink-0"
            onClick={() => setRestoredCount(0)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="min-h-full flex flex-col items-center py-8">
        {viewState.viewMode === 'continuous' ? (
          <VList
            style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {Array.from({ length: pdfDoc.numPages }, (_, index) => renderPage(index))}
          </VList>
        ) : viewState.viewMode === 'single' ? (
          renderSingle()
        ) : (
          renderTwoPage()
        )}
      </div>
    </div>
  );
};

interface PageSurfaceProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  activeTool: string;
  pageAnnotations: PdfAnnotation[];
  selectedAnnotationIds: string[];
  onActivate: () => void;
  onCreateAnnotation: (annotation: PdfAnnotation) => void;
  onCreateManyAnnotations: (annotations: PdfAnnotation[]) => void;
  onSetSingleSelection: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onSetSelection: (ids: string[]) => void;
  onClearSelection: () => void;
  onCommitAnnotation: (id: string, patch: Partial<PdfAnnotation>) => void;
  onCommitManyAnnotations: (updates: Array<{ id: string; data: Partial<PdfAnnotation> }>) => void;
}

const PageSurface: React.FC<PageSurfaceProps> = ({
  doc,
  pageNumber,
  scale,
  activeTool,
  pageAnnotations,
  selectedAnnotationIds,
  onActivate,
  onCreateAnnotation,
  onCreateManyAnnotations,
  onSetSingleSelection,
  onToggleSelection,
  onSetSelection,
  onClearSelection,
  onCommitAnnotation,
  onCommitManyAnnotations,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const { hits, activeHitId } = useSearchStore();
  const isSelectTool = activeTool === 'select';
  const isTextMarkTool = isAnnotationType(activeTool) && TEXT_SELECTION_TYPES.includes(activeTool);
  const isNoteTool = activeTool === 'comment';
  const isPlacementOnlyTool =
    activeTool === 'textbox' ||
    activeTool === 'shape-rect' ||
    activeTool === 'shape-ellipse' ||
    activeTool === 'shape-polygon' ||
    activeTool === 'shape-cloud' ||
    activeTool === 'redaction' ||
    activeTool === 'squiggly' ||
    // 'ink' is intentionally excluded — it is handled by the text-layer's startMarquee
    activeTool === 'sticky-note' ||
    activeTool === 'line' ||
    activeTool === 'arrow' ||
    activeTool === 'stamp' ||
    activeTool === 'callout' ||
    activeTool === 'comment';

  const [size, setSize] = React.useState({ width: 800, height: 1000 });
  const [textItems, setTextItems] = React.useState<TextLayerItem[]>([]);
  const [draftRects, setDraftRects] = React.useState<Record<string, Rect>>({});
  const [draftAnchors, setDraftAnchors] = React.useState<Record<string, Point2D | null>>({});
  const [draftKnees, setDraftKnees] = React.useState<Record<string, Point2D | null>>({});
  const [draftLinePoints, setDraftLinePoints] = React.useState<Record<string, number[]>>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingValue, setEditingValue] = React.useState('');
  const [marquee, setMarquee] = React.useState<Rect | null>(null);
  const [shapeDraft, setShapeDraft] = React.useState<Rect | null>(null);
  const [textSelectionDraft, setTextSelectionDraft] = React.useState<TextSelectionDraft | null>(null);
  const transformRef = React.useRef<TransformState>(null);
  const anchorDragRef = React.useRef<AnchorDragState>(null);
  const draftRectsRef = React.useRef<Record<string, Rect>>({});
  const draftAnchorsRef = React.useRef<Record<string, Point2D | null>>({});
  const draftKneesRef = React.useRef<Record<string, Point2D | null>>({});
  const draftLinePointsRef = React.useRef<Record<string, number[]>>({});

  const { size: renderSize } = usePageRenderer({
    doc,
    pageNumber,
    scale,
    canvasRef,
  });

  React.useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const page = await doc.getPage(pageNumber);
      if (!cancelled) {
        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
      }

      const items = await PdfRendererAdapter.getPageTextItems(page, scale);
      if (!cancelled) {
        setTextItems(items);
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  React.useEffect(() => {
    draftRectsRef.current = draftRects;
  }, [draftRects]);

  React.useEffect(() => {
    draftAnchorsRef.current = draftAnchors;
  }, [draftAnchors]);

  React.useEffect(() => {
    draftKneesRef.current = draftKnees;
  }, [draftKnees]);

  React.useEffect(() => {
    draftLinePointsRef.current = draftLinePoints;
  }, [draftLinePoints]);

  React.useEffect(() => {
    if (activeHitId) {
      const activeHitElement = document.getElementById(`search-hit-${activeHitId}`);
      if (activeHitElement) {
        activeHitElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeHitId]);

  const pageWidth = (renderSize?.width || size.width) / scale;
  const pageHeight = (renderSize?.height || size.height) / scale;

  const clampRect = React.useCallback(
    (rect: Rect): Rect => {
      const width = Math.max(8, Math.min(rect.width, pageWidth));
      const height = Math.max(8, Math.min(rect.height, pageHeight));
      const x = Math.max(0, Math.min(rect.x, pageWidth - width));
      const y = Math.max(0, Math.min(rect.y, pageHeight - height));

      return { x, y, width, height };
    },
    [pageHeight, pageWidth],
  );

  const clearTextSelectionDraft = React.useCallback(() => {
    setTextSelectionDraft(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Ignore browser selection API edge cases.
    }
  }, []);

  const commitTextEdit = (annotation: PdfAnnotation, value: string) => {
    const currentRect = draftRectsRef.current[annotation.id];
    const nextRect =
      annotation.data.autoSize !== false && isTextLike(annotation.type)
        ? autoSizeRectForText(
            value,
            readFontSize(annotation),
            currentRect ?? annotation.rect,
          )
        : currentRect ?? annotation.rect;

    onCommitAnnotation(annotation.id, {
      rect: nextRect,
      data: {
        ...annotation.data,
        text: value,
      },
    });
    setEditingId(null);
  };

  const startTransform = (
    event: React.MouseEvent<HTMLDivElement>,
    annotation: PdfAnnotation,
    mode: 'move' | 'resize',
  ) => {
    if (annotation.data.locked === true) return;

    event.stopPropagation();
    clearTextSelectionDraft();

    const selectedOnPage = pageAnnotations
      .filter((item) => selectedAnnotationIds.includes(item.id) && item.data.locked !== true)
      .map((item) => item.id);

    const ids =
      mode === 'move' &&
      selectedOnPage.includes(annotation.id) &&
      selectedOnPage.length > 1
        ? selectedOnPage
        : [annotation.id];

    if (!(mode === 'move' && ids.length > 1)) {
      onSetSingleSelection(annotation.id);
    }

    const startRects: Record<string, Rect> = {};
    const startAnchors: Record<string, Point2D | null> = {};
    const startKnees: Record<string, Point2D | null> = {};
    const startPoints: Record<string, number[] | null> = {};

    ids.forEach((id) => {
      const item = pageAnnotations.find((value) => value.id === id);
      if (!item) return;
      startRects[id] = draftRectsRef.current[id] ?? item.rect;
      startAnchors[id] = readAnchor(item, draftAnchorsRef.current[id] ?? null);
      startKnees[id] = readKnee(
        item,
        draftKneesRef.current[id] ?? null,
        startAnchors[id],
        startRects[id],
      );
      startPoints[id] = readPoints(item, draftLinePointsRef.current[id] ?? null);
    });

    transformRef.current = {
      ids,
      targetId: annotation.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRects,
      startAnchors,
      startKnees,
      startPoints,
      pageWidth: size.width / scale,
      pageHeight: size.height / scale,
    };

    const onMove = (moveEvent: MouseEvent) => {
      const current = transformRef.current;
      if (!current) return;

      const dx = (moveEvent.clientX - current.startClientX) / scale;
      const dy = (moveEvent.clientY - current.startClientY) / scale;

      if (current.mode === 'move') {
        const nextRects: Record<string, Rect> = {};
        const nextAnchors: Record<string, Point2D | null> = {};
        const nextKnees: Record<string, Point2D | null> = {};

        current.ids.forEach((id) => {
          const baseRect = current.startRects[id];
          nextRects[id] = clampRect({
            ...baseRect,
            x: baseRect.x + dx,
            y: baseRect.y + dy,
          });

          const anchor = current.startAnchors[id];
          nextAnchors[id] = anchor
            ? {
                x: clamp(anchor.x + dx, 0, current.pageWidth),
                y: clamp(anchor.y + dy, 0, current.pageHeight),
              }
            : null;

          const knee = current.startKnees[id];
          nextKnees[id] = knee
            ? {
                x: clamp(knee.x + dx, 0, current.pageWidth),
                y: clamp(knee.y + dy, 0, current.pageHeight),
              }
            : null;
        });

        setDraftRects((state) => ({ ...state, ...nextRects }));
        setDraftAnchors((state) => ({ ...state, ...nextAnchors }));
        setDraftKnees((state) => ({ ...state, ...nextKnees }));
      } else {
        const baseRect = current.startRects[current.targetId];
        const target = pageAnnotations.find((item) => item.id === current.targetId);
        if (!target) return;

        const resized = clampRect({
          ...baseRect,
          width: baseRect.width + dx,
          height: baseRect.height + dy,
        });

        const scaled =
          target.type === 'line' || target.type === 'arrow'
            ? resizeLineLikeRect(baseRect, resized, current.startPoints[current.targetId])
            : { rect: resized, points: null };

        if (target.type === 'line' || target.type === 'arrow') {
          const linePoints = scaled.points;
          if (Array.isArray(linePoints)) {
            setDraftLinePoints((state) => ({
              ...state,
              [current.targetId]: linePoints,
            }));
          }
        }

        setDraftRects((state) => ({
          ...state,
          [current.targetId]: scaled.rect,
        }));
      }
    };

    const onUp = () => {
      const current = transformRef.current;
      if (!current) return;

      if (current.mode === 'move') {
        const liveRects = draftRectsRef.current;
        const liveAnchors = draftAnchorsRef.current;
        const liveKnees = draftKneesRef.current;
        onCommitManyAnnotations(
          current.ids.map((id) => ({
            id,
            data: {
              rect: liveRects[id] ?? current.startRects[id],
              data: {
                ...(pageAnnotations.find((item) => item.id === id)?.data ?? {}),
                ...(current.startAnchors[id]
                  ? { anchor: liveAnchors[id] ?? current.startAnchors[id] }
                  : {}),
                ...(current.startKnees[id]
                  ? { knee: liveKnees[id] ?? current.startKnees[id] }
                  : {}),
              },
            } as Partial<PdfAnnotation>,
          })),
        );
      } else {
        const item = pageAnnotations.find((value) => value.id === current.targetId);
        if (item) {
          const liveRects = draftRectsRef.current;
          const livePoints = draftLinePointsRef.current;
          const nextRect = liveRects[current.targetId] ?? current.startRects[current.targetId];
          const nextPoints = livePoints[current.targetId];
          const patch: Partial<PdfAnnotation> = { rect: nextRect };
          if (
            (item.type === 'line' || item.type === 'arrow') &&
            Array.isArray(nextPoints)
          ) {
            patch.data = { ...item.data, points: nextPoints };
          }
          onCommitAnnotation(current.targetId, patch);
        }
      }

      setDraftRects((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setDraftAnchors((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setDraftKnees((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setDraftLinePoints((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      transformRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startAnchorDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    annotation: PdfAnnotation,
  ) => {
    if (annotation.data.locked === true) return;

    const anchor = readAnchor(annotation, draftAnchors[annotation.id] ?? null);
    if (!anchor) return;
    const rect = draftRectsRef.current[annotation.id] ?? annotation.rect;
    const knee = readKnee(
      annotation,
      draftKnees[annotation.id] ?? null,
      anchor,
      rect,
    );

    event.stopPropagation();
    clearTextSelectionDraft();
    onSetSingleSelection(annotation.id);

    anchorDragRef.current = {
      id: annotation.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAnchor: anchor,
      startKnee: knee,
      pageWidth,
      pageHeight,
    };

    const onMove = (moveEvent: MouseEvent) => {
      const current = anchorDragRef.current;
      if (!current) return;

      const dx = (moveEvent.clientX - current.startClientX) / scale;
      const dy = (moveEvent.clientY - current.startClientY) / scale;
      const nextAnchor = {
        x: clamp(current.startAnchor.x + dx, 0, current.pageWidth),
        y: clamp(current.startAnchor.y + dy, 0, current.pageHeight),
      };

      setDraftAnchors((state) => ({
        ...state,
        [current.id]: nextAnchor,
      }));

      const source = pageAnnotations.find((value) => value.id === current.id);
      const sourceRect = source
        ? draftRectsRef.current[current.id] ?? source.rect
        : null;
      if (source && sourceRect && source.type === 'callout') {
        const style = source.data.leaderStyle === 'straight' ? 'straight' : 'elbow';
        if (style === 'elbow') {
          const nextKnee = computeDefaultCalloutKnee(sourceRect, nextAnchor);
          setDraftKnees((state) => ({
            ...state,
            [current.id]: nextKnee,
          }));
        }
      }
    };

    const onUp = () => {
      const current = anchorDragRef.current;
      if (!current) return;

      const item = pageAnnotations.find((value) => value.id === current.id);
      if (item) {
        const liveAnchors = draftAnchorsRef.current;
        const liveKnees = draftKneesRef.current;
        const nextData = {
          ...item.data,
          anchor: liveAnchors[current.id] ?? current.startAnchor,
        };
        const committedKnee =
          item.type === 'callout'
            ? liveKnees[current.id] ?? current.startKnee
            : null;
        if (item.type === 'callout' && committedKnee) {
          nextData.knee = committedKnee;
        }
        onCommitAnnotation(current.id, {
          data: nextData,
        });
      }

      setDraftAnchors((state) => {
        const next = { ...state };
        delete next[current.id];
        return next;
      });
      setDraftKnees((state) => {
        const next = { ...state };
        delete next[current.id];
        return next;
      });

      anchorDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTextSelectionMouseUp = () => {
    if (!(isSelectTool || isTextMarkTool || isNoteTool) || !pageRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setTextSelectionDraft(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setTextSelectionDraft(null);
      return;
    }

    const pageEl = pageRef.current;
    const pageRect = pageEl.getBoundingClientRect();
    const range = selection.getRangeAt(0);

    // Use text-item span positions (derived from PDF.js coordinates) rather than
    // range.getClientRects() — the latter uses browser font metrics which differ
    // from the PDF's embedded fonts, causing visible annotation offsets.
    const textSpans = Array.from(
      pageEl.querySelectorAll<HTMLSpanElement>('[data-text-item="true"]'),
    );
    const spanRects = textSpans
      .filter((span) => {
        try { return range.intersectsNode(span); } catch { return false; }
      })
      .map((span) => {
        const br = span.getBoundingClientRect();
        return {
          x: (br.left - pageRect.left) / scale,
          y: (br.top  - pageRect.top)  / scale,
          width:  br.width  / scale,
          height: br.height / scale,
        };
      })
      .filter((r) => r.width > 2 && r.height > 2);

    // Fallback to client rects if no span intersection found (e.g. cross-page edge case)
    const rects = spanRects.length > 0
      ? mergeAdjacentLineRects(spanRects)
      : Array.from(range.getClientRects())
          .map((domRect) => domRectToPageRect(domRect, pageRect, scale))
          .filter((rect) => rect.width > 2 && rect.height > 2);

    if (rects.length === 0) {
      setTextSelectionDraft(null);
      return;
    }

    const draft = {
      text,
      rects,
      unionRect: unionRects(rects),
    };

    if (isTextMarkTool || isNoteTool) {
      if (activeTool === 'highlight') {
        const items = draft.rects.map((rect) => buildHighlightAnnotation(pageNumber, rect));
        onCreateManyAnnotations(items);
      } else if (activeTool === 'underline') {
        const items = draft.rects.map((rect) => buildUnderlineAnnotation(pageNumber, rect));
        onCreateManyAnnotations(items);
      } else if (activeTool === 'strikeout') {
        const items = draft.rects.map((rect) => buildStrikeoutAnnotation(pageNumber, rect));
        onCreateManyAnnotations(items);
      } else if (activeTool === 'comment') {
        const item = buildCalloutFromSelection(
          pageNumber,
          draft.unionRect,
          draft.text,
          pageWidth,
          pageHeight,
        );
        if (activeTool === 'comment') {
          item.type = 'comment';
          item.data.backgroundColor = '#fff7cc';
          item.data.borderColor = '#d4b106';
          item.data.title = 'Note';
        }
        onCreateAnnotation(item);
      }

      clearTextSelectionDraft();
      resetInteractionState();
    } else {
      setTextSelectionDraft(draft);
    }
  };

  const createHighlightsFromSelection = () => {
    if (!textSelectionDraft) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildHighlightAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createUnderlineFromSelection = () => {
    if (!textSelectionDraft) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildUnderlineAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createStrikeoutFromSelection = () => {
    if (!textSelectionDraft) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildStrikeoutAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createSquigglyFromSelection = () => {
    if (!textSelectionDraft) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildSquigglyAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createNoteFromSelection = (type: 'comment' | 'callout' = 'comment') => {
    if (!textSelectionDraft) return;
    const item = buildCalloutFromSelection(
      pageNumber,
      textSelectionDraft.unionRect,
      textSelectionDraft.text,
      pageWidth,
      pageHeight,
    );
    if (type === 'comment') {
      item.type = 'comment';
      item.data.backgroundColor = '#fff7cc';
      item.data.borderColor = '#d4b106';
      item.data.title = 'Note';
    }
    onCreateAnnotation(item);
    clearTextSelectionDraft();
  };

  const marqueeRef = React.useRef<Rect | null>(null);
  React.useEffect(() => {
    marqueeRef.current = marquee;
  }, [marquee]);

  const [inkPaths, setInkPaths] = React.useState<number[][]>([]);
  const currentPathRef = React.useRef<number[]>([]);

  const startMarquee = (event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'ink') {
      const hostRect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - hostRect.left) / scale;
      const y = (event.clientY - hostRect.top) / scale;
      currentPathRef.current = [x, y];

      const onMove = (moveEvent: MouseEvent) => {
        if (!moveEvent.buttons) return;
        const moveX = (moveEvent.clientX - hostRect.left) / scale;
        const moveY = (moveEvent.clientY - hostRect.top) / scale;
        currentPathRef.current = [...currentPathRef.current, moveX, moveY];
        setInkPaths(prev => {
          const newPaths = [...prev];
          newPaths[newPaths.length - 1] = currentPathRef.current;
          return newPaths;
        });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (currentPathRef.current.length < 4) return;

        const path = currentPathRef.current;
        const xs = path.filter((_, i) => i % 2 === 0);
        const ys = path.filter((_, i) => i % 2 === 1);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const rect = {
          x: minX,
          y: minY,
          width: Math.max(...xs) - minX || 4,
          height: Math.max(...ys) - minY || 4,
        };

        const item = buildAnnotation('ink', pageNumber, rect.x, rect.y);
        item.rect = rect;
        item.data.paths = [path];
        onCreateAnnotation(item);
        resetInteractionState();

        setInkPaths([]);
        currentPathRef.current = [];
      };

      setInkPaths(prev => [...prev, currentPathRef.current]);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    if (activeTool !== 'select') return;
    if (event.target !== event.currentTarget) return;

    clearTextSelectionDraft();
    const hostRect = event.currentTarget.getBoundingClientRect();
    const startX = (event.clientX - hostRect.left) / scale;
    const startY = (event.clientY - hostRect.top) / scale;
    let latestMarquee: Rect = { x: startX, y: startY, width: 0, height: 0 };
    setMarquee(latestMarquee);

    const onMove = (moveEvent: MouseEvent) => {
      const x = (moveEvent.clientX - hostRect.left) / scale;
      const y = (moveEvent.clientY - hostRect.top) / scale;
      latestMarquee = {
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      };
      setMarquee(latestMarquee);
    };

    const onUp = () => {
      const currentMarquee = marqueeRef.current ?? latestMarquee;
      if (currentMarquee) {
        const hitIds = pageAnnotations
          .filter((annotation) => intersects(annotation.rect, currentMarquee))
          .map((annotation) => annotation.id);

        if (event.metaKey || event.ctrlKey) {
          hitIds.forEach((id) => onToggleSelection(id));
        } else if (hitIds.length > 0) {
          onSetSelection(hitIds);
        } else {
          onClearSelection();
        }
      }

      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /**
   * Drag-to-draw handler for all placement-only tools.
   * Mousedown captures start position → mousemove updates rubber-band preview
   * → mouseup commits the annotation with the final dragged rect.
   * A simple click (no meaningful drag) falls back to the default-sized rect
   * from buildAnnotation so placing by click still works.
   */
  const startShapeDraw = (event: React.MouseEvent<HTMLDivElement>) => {
    onActivate();

    const hostRect = event.currentTarget.getBoundingClientRect();
    const startX = (event.clientX - hostRect.left) / scale;
    const startY = (event.clientY - hostRect.top) / scale;

    let rawEndX = startX;
    let rawEndY = startY;
    let latestDraft: Rect = { x: startX, y: startY, width: 0, height: 0 };
    let isDrag = false;

    setShapeDraft(latestDraft);

    const onMove = (moveEvent: MouseEvent) => {
      if (!moveEvent.buttons) return;
      rawEndX = (moveEvent.clientX - hostRect.left) / scale;
      rawEndY = (moveEvent.clientY - hostRect.top) / scale;
      latestDraft = {
        x: Math.min(startX, rawEndX),
        y: Math.min(startY, rawEndY),
        width: Math.abs(rawEndX - startX),
        height: Math.abs(rawEndY - startY),
      };
      if (latestDraft.width > 5 || latestDraft.height > 5) isDrag = true;
      setShapeDraft({ ...latestDraft });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setShapeDraft(null);
      clearTextSelectionDraft();

      if (!isAnnotationType(activeTool)) return;
      const tool = activeTool;
      const annotation = buildAnnotation(tool, pageNumber, startX, startY);

      if (isDrag) {
        const finalRect: Rect = {
          x: latestDraft.x,
          y: latestDraft.y,
          width: Math.max(latestDraft.width, 8),
          height: Math.max(latestDraft.height, 8),
        };
        annotation.rect = finalRect;

        // For line/arrow make the stroke run along the drag diagonal
        if ((tool === 'line' || tool === 'arrow') && annotation.data) {
          annotation.data = {
            ...annotation.data,
            points: [
              startX - finalRect.x,
              startY - finalRect.y,
              rawEndX - finalRect.x,
              rawEndY - finalRect.y,
            ],
          };
        }
      }

      onCreateAnnotation(annotation);
      resetInteractionState();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={pageRef}
      data-page={pageNumber}
      className="relative bg-white dark:bg-slate-900 shadow-md mb-8 transition-all hover:ring-1 hover:ring-slate-300"
      style={{ width: renderSize?.width || size.width, minHeight: renderSize?.height || size.height }}
      onClick={onActivate}
    >
      <canvas ref={canvasRef} className="block" />

      <div
        className="absolute inset-0"
        style={{
          pointerEvents: isSelectTool || isTextMarkTool || isNoteTool || activeTool === 'ink' ? 'auto' : 'none',
          userSelect: isSelectTool || isTextMarkTool || isNoteTool ? 'text' : 'none',
        }}
        onMouseDown={startMarquee}
        onMouseUp={handleTextSelectionMouseUp}
      >
        {activeTool === 'ink' && inkPaths.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            {inkPaths.map((path, index) => (
              <path
                key={`ink-draft-${index}`}
                d={inkPathToSvgD(path, scale)}
                stroke="#111827"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
        {hits
          .filter((hit) => hit.pageNumber === pageNumber)
          .map((hit) =>
            hit.rects.map((rect, index) => {
              const isActive = hit.id === activeHitId;
              return (
                <div
                  id={isActive && index === 0 ? `search-hit-${hit.id}` : undefined}
                  key={`hit-${hit.id}-${index}`}
                  className={`absolute pointer-events-none ${
                    isActive ? 'bg-orange-300/35 border border-orange-500/60' : 'bg-yellow-200/30 border border-yellow-400/35'
                  }`}
                  style={{
                    left: rect.x * scale,
                    top: rect.y * scale,
                    width: rect.width * scale,
                    height: rect.height * scale,
                  }}
                />
              );
            }),
          )}

        {textItems.map((item) => (
          <span
            key={item.id}
            data-text-item="true"
            style={{
              position: 'absolute',
              left: item.x,
              top: item.y,
              width: item.width,
              height: item.height,
              fontSize: item.fontSize,
              lineHeight: `${item.height}px`,
              fontFamily: 'sans-serif',
              whiteSpace: 'pre',
              color: 'transparent',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            {item.text}
          </span>
        ))}
      </div>

      {textSelectionDraft && (
        <>
          {textSelectionDraft.rects.map((rect, index) => (
            <div
              key={`sel-${index}`}
              className="absolute pointer-events-none bg-yellow-300/35 border border-yellow-400/40"
              style={{
                left: rect.x * scale,
                top: rect.y * scale,
                width: rect.width * scale,
                height: rect.height * scale,
              }}
            />
          ))}

          {isSelectTool && (
            <div
              className="absolute z-30 flex items-center gap-2 rounded-lg bg-slate-900 text-white px-2 py-1 shadow-lg"
              style={{
                left: Math.max(6, textSelectionDraft.unionRect.x * scale),
                top: Math.max(6, textSelectionDraft.unionRect.y * scale - 34),
              }}
            >
              <button
                className="text-xs hover:text-yellow-300"
                onClick={createHighlightsFromSelection}
              >
                Highlight
              </button>
              <button
                className="text-xs hover:text-red-300"
                onClick={createUnderlineFromSelection}
              >
                Underline
              </button>
              <button
                className="text-xs hover:text-red-300"
                onClick={createStrikeoutFromSelection}
              >
                Strikeout
              </button>
              <button
                className="text-xs hover:text-red-300"
                onClick={createSquigglyFromSelection}
              >
                Squiggly
              </button>
              <button
                className="text-xs hover:text-blue-300"
                onClick={() => createNoteFromSelection('comment')}
              >
                Note
              </button>
              <button
                className="text-xs hover:text-blue-300"
                onClick={() => createNoteFromSelection('callout')}
              >
                Callout
              </button>
              <button
                className="text-xs opacity-70 hover:opacity-100"
                onClick={clearTextSelectionDraft}
              >
                x
              </button>
            </div>
          )}
        </>
      )}

      <div
        className={`absolute inset-0 ${
          activeTool !== 'select' ? 'cursor-crosshair' : ''
        }`}
        style={{ pointerEvents: isPlacementOnlyTool ? 'auto' : 'none' }}
        onMouseDown={startShapeDraw}
      >
        {/* Rubber-band preview while dragging to draw */}
        {shapeDraft && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: shapeDraft.x * scale,
              top: shapeDraft.y * scale,
              width: Math.max(shapeDraft.width * scale, 1),
              height: Math.max(shapeDraft.height * scale, 1),
              border: '2px dashed #3b82f6',
              background: 'rgba(59,130,246,0.06)',
              borderRadius: activeTool === 'shape-ellipse' ? '50%' : 2,
            }}
          />
        )}
        {pageAnnotations
        .slice()
        .sort((a, b) => (a.data?.zIndex ?? 0) - (b.data?.zIndex ?? 0))
        .map((annotation) => {
          let NodeComponent: React.FC<AnnotationRendererProps>;

          try {
            NodeComponent = annotationRegistry.get(annotation.type) as React.FC<AnnotationRendererProps>;
          } catch (err) {
            logError('annotation', 'Missing annotation renderer in workspace', {
              annotationType: annotation.type,
              error: String(err),
            });
            return (
              <div
                key={annotation.id}
                style={{
                  position: 'absolute',
                  left: annotation.rect.x * scale,
                  top: annotation.rect.y * scale,
                  width: 80, height: 24,
                  background: 'rgba(255,0,0,0.15)',
                  border: '1px dashed red',
                  fontSize: 10, color: 'red',
                  display: 'flex', alignItems: 'center', padding: '0 4px',
                }}
              >
                unknown: {annotation.type}
              </div>
            );
          }

          const selected = selectedAnnotationIds.includes(annotation.id);
          const rawRect = draftRects[annotation.id] ?? annotation.rect;
          const scaledRect = {
            x: rawRect.x * scale,
            y: rawRect.y * scale,
            width: rawRect.width * scale,
            height: rawRect.height * scale,
          };
          const anchor = readAnchor(annotation, draftAnchors[annotation.id] ?? null);
          const knee = readKnee(
            annotation,
            draftKnees[annotation.id] ?? null,
            anchor,
            rawRect,
          );

          return (
            <NodeComponent
              key={annotation.id}
              annotation={annotation}
              rect={scaledRect}
              scale={scale}
              isSelected={selected}
              isEditing={editingId === annotation.id}
              editingValue={editingValue}
              onSelect={(event: React.PointerEvent<HTMLDivElement>) => {
                event.stopPropagation();
                clearTextSelectionDraft();
                if (event.metaKey || event.ctrlKey) {
                  onToggleSelection(annotation.id);
                } else {
                  onSetSingleSelection(annotation.id);
                }
              }}
              onTransformStart={(event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => startTransform(event, annotation, mode)}
              onDoubleClick={() => {
                if (annotation.data?.locked === true) return;
                setEditingId(annotation.id);
                setEditingValue(readText(annotation));
              }}
              onCommitEdit={(v: string) => commitTextEdit(annotation, v)}
              {...(annotation.type === 'callout' ? {
                anchorPoint: anchor,
                kneePoint: knee,
                onAnchorDragStart: (event: React.PointerEvent<SVGCircleElement>) => startAnchorDrag(event, annotation),
              } : {})}
            />
          );
        })}
        {marquee && (
          <div
            className="absolute pointer-events-none border border-blue-500 bg-blue-200/20"
            style={{
              left: marquee.x * scale,
              top: marquee.y * scale,
              width: marquee.width * scale,
              height: marquee.height * scale,
            }}
          />
        )}
      </div>

      <WriterOverlay
        pageNumber={pageNumber}
        scale={scale}
        pageDimensions={renderSize || size}
      />

      <WriterOverlayLayer
        pageNumber={pageNumber}
        viewport={{
          pdfWidth: renderSize?.width || size.width,
          pdfHeight: renderSize?.height || size.height,
          scale,
          rotation: 0,
        }}
      />

      <div className="absolute top-2 right-2 bg-slate-900/70 text-white text-xs px-2 py-1 rounded">
        Page {pageNumber}
      </div>
    </div>
  );
};

const PageSurfaceMemo = React.memo(
  PageSurface,
  (prev, next) =>
    prev.doc === next.doc &&
    prev.pageNumber === next.pageNumber &&
    prev.scale === next.scale &&
    prev.activeTool === next.activeTool &&
    prev.pageAnnotations === next.pageAnnotations &&
    prev.selectedAnnotationIds === next.selectedAnnotationIds,
);














function buildAnnotation(
  tool: AnnotationType,
  pageNumber: number,
  x: number,
  y: number,
): PdfAnnotation {
  const now = Date.now();
  const common = {
    id: uuidv4(),
    pageNumber,
    createdAt: now,
    updatedAt: now,
  };

  switch (tool) {
    case 'highlight':
      return {
        ...common,
        type: 'highlight',
        rect: { x, y, width: 180, height: 26 },
        data: {
          backgroundColor: '#fde047',
          borderColor: '#facc15',
          opacity: 0.38,
        },
      };

    case 'shape-rect':
    case 'shape-ellipse':
    case 'shape-polygon':
    case 'shape-cloud':
      return {
        ...common,
        type: tool,
        rect: { x, y, width: 180, height: 60 },
        data: {
          backgroundColor: 'transparent',
          borderColor: '#3b82f6',
          borderWidth: 2,
          ...(tool === 'shape-polygon' ? { points: [x + 90, y, x + 180, y + 60, x, y + 60] } : {})
        },
      };

    case 'redaction':
      return {
        ...common,
        type: 'redaction',
        rect: { x, y, width: 180, height: 26 },
        data: {
          backgroundColor: '#000000',
          borderColor: '#000000',
          borderWidth: 2,
        },
      };

    case 'squiggly':
      return {
        ...common,
        type: 'squiggly',
        rect: { x, y, width: 180, height: 16 },
        data: {
          borderColor: '#ef4444',
          borderWidth: 1.5,
        },
      };

    case 'stamp':
      return {
        ...common,
        type: 'stamp',
        rect: { x, y, width: 150, height: 36 },
        data: {
          text: 'APPROVED',
          backgroundColor: '#fef2f2',
          borderColor: '#ef4444',
          textColor: '#b91c1c',
          fontWeight: 'bold',
          fontSize: 14,
          autoSize: false,
        },
      };

    case 'comment':
      return {
        ...common,
        type: 'comment',
        rect: autoSizeRectForText('New note', 12, { x, y, width: 200, height: 72 }),
        data: {
          text: 'New note',
          title: 'Note',
          backgroundColor: '#fff7cc',
          borderColor: '#d4b106',
          textColor: '#111827',
          fontSize: 12,
          autoSize: true,
        },
      };

    case 'callout':
      {
        const rect = autoSizeRectForText('New callout', 12, { x: x + 26, y: y - 12, width: 220, height: 64 });
        const anchor = { x, y };
        const knee = computeDefaultCalloutKnee(rect, anchor);
        return {
          ...common,
          type: 'callout',
          rect,
          data: {
            text: 'New callout',
            backgroundColor: '#ffffff',
            borderColor: '#475569',
            textColor: '#111827',
            fontSize: 12,
            autoSize: true,
            anchor,
            knee,
            leaderStyle: 'elbow',
            arrowHead: 'open',
          },
        };
      }

    case 'line':
      return {
        ...common,
        type: 'line',
        rect: { x, y, width: 180, height: 40 },
        data: {
          borderColor: '#111827',
          points: [0, 20, 180, 20],
        },
      };

    case 'arrow':
      return {
        ...common,
        type: 'arrow',
        rect: { x, y, width: 180, height: 40 },
        data: {
          borderColor: '#111827',
          points: [0, 20, 180, 20],
        },
      };

    case 'ink':
      return {
        ...common,
        type: 'ink',
        rect: { x, y, width: 40, height: 40 },
        data: {
          borderColor: '#111827',
          borderWidth: 2,
          paths: [],
        },
      };

    case 'sticky-note':
      return {
        ...common,
        type: 'sticky-note',
        rect: { x, y, width: 28, height: 28 }, // Collapsed size
        data: {
          text: 'New note',
          author: 'Current User',
          backgroundColor: '#fde047',
          borderColor: '#facc15',
          isCollapsed: false,
        },
      };

    default:
      return {
        ...common,
        type: 'textbox',
        rect: autoSizeRectForText('New text box', 12, { x, y, width: 220, height: 40 }),
        data: {
          text: 'New text box',
          backgroundColor: '#ffffff',
          borderColor: '#60a5fa',
          textColor: '#0f172a',
          fontSize: 12,
          autoSize: true,
        },
      };
  }
}

function buildHighlightAnnotation(pageNumber: number, rect: Rect): PdfAnnotation {
  const now = Date.now();
  return {
    id: uuidv4(),
    type: 'highlight',
    pageNumber,
    rect,
    data: {
      backgroundColor: '#fde047',
      borderColor: '#facc15',
      opacity: 0.38,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function buildSquigglyAnnotation(pageNumber: number, rect: Rect): PdfAnnotation {
  const now = Date.now();
  return {
    id: uuidv4(),
    type: 'squiggly',
    pageNumber,
    rect,
    data: {
      borderColor: '#ef4444',
      borderWidth: 1.5,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function buildUnderlineAnnotation(pageNumber: number, rect: Rect): PdfAnnotation {
  const now = Date.now();
  return {
    id: uuidv4(),
    type: 'underline',
    pageNumber,
    rect,
    data: {
      borderColor: '#dc2626',
    },
    createdAt: now,
    updatedAt: now,
  };
}

function buildStrikeoutAnnotation(pageNumber: number, rect: Rect): PdfAnnotation {
  const now = Date.now();
  return {
    id: uuidv4(),
    type: 'strikeout',
    pageNumber,
    rect,
    data: {
      borderColor: '#dc2626',
    },
    createdAt: now,
    updatedAt: now,
  };
}

function buildCalloutFromSelection(
  pageNumber: number,
  sourceRect: Rect,
  text: string,
  pageWidth: number,
  pageHeight: number,
): PdfAnnotation {
  const now = Date.now();
  const anchor = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };

  const seeded = autoSizeRectForText(text, 12, {
    x: sourceRect.x + sourceRect.width + 24,
    y: Math.max(8, sourceRect.y - 8),
    width: 220,
    height: 64,
  });

  const clamped = {
    ...seeded,
    x: clamp(seeded.x, 0, Math.max(0, pageWidth - seeded.width)),
    y: clamp(seeded.y, 0, Math.max(0, pageHeight - seeded.height)),
  };
  const knee = computeDefaultCalloutKnee(clamped, anchor);

  return {
    id: uuidv4(),
    type: 'callout',
    pageNumber,
    rect: clamped,
    data: {
      text,
      backgroundColor: '#ffffff',
      borderColor: '#475569',
      textColor: '#111827',
      fontSize: 12,
      autoSize: true,
      anchor,
      knee,
      leaderStyle: 'elbow',
      arrowHead: 'open',
    },
    createdAt: now,
    updatedAt: now,
  };
}

function isTextLike(type: AnnotationType): boolean {
  return type === 'textbox' || type === 'comment' || type === 'stamp' || type === 'callout' || type === 'sticky-note';
}

function readText(annotation: PdfAnnotation): string {
  if (typeof annotation.data.text === 'string') return annotation.data.text;
  if (typeof annotation.data.content === 'string') return annotation.data.content;
  return '';
}

function readFontSize(annotation: PdfAnnotation): number {
  return typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 12;
}





function readAnchor(
  annotation: PdfAnnotation,
  fallback: Point2D | null,
): Point2D | null {
  const anchor = annotation.data.anchor;
  if (
    anchor &&
    typeof anchor === 'object' &&
    typeof (anchor as { x?: unknown }).x === 'number' &&
    typeof (anchor as { y?: unknown }).y === 'number'
  ) {
    return anchor as Point2D;
  }
  return fallback;
}

function readKnee(
  annotation: PdfAnnotation,
  fallback: Point2D | null,
  anchor: Point2D | null,
  rect: Rect,
): Point2D | null {
  const knee = annotation.data.knee;
  if (
    knee &&
    typeof knee === 'object' &&
    typeof (knee as { x?: unknown }).x === 'number' &&
    typeof (knee as { y?: unknown }).y === 'number'
  ) {
    return knee as Point2D;
  }
  if (fallback) {
    return fallback;
  }
  if (annotation.type !== 'callout' || !anchor) {
    return null;
  }
  const style = annotation.data.leaderStyle === 'straight' ? 'straight' : 'elbow';
  if (style === 'straight') {
    return null;
  }
  return computeDefaultCalloutKnee(rect, anchor);
}

function computeDefaultCalloutKnee(rect: Rect, anchor: Point2D): Point2D {
  const path = computeCalloutPath(anchor, rect, { leaderStyle: 'elbow' });
  return path.elbowPoint;
}

function readZIndex(annotation: PdfAnnotation): number {
  return typeof annotation.data.zIndex === 'number' ? annotation.data.zIndex : 0;
}





function autoSizeRectForText(text: string, fontSize: number, rect: Rect): Rect {
  const lines = text.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(120, Math.min(380, longest * (fontSize * 0.62) + 20));
  const height = Math.max(36, lines.length * (fontSize * 1.5) + 14);
  return { ...rect, width, height };
}



function inkPathToSvgD(points: number[], scale: number): string {
  if (points.length < 4) return '';
  const pairs: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] * scale;
    const y = points[i + 1] * scale;
    pairs.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
  }
  return pairs.join(' ');
}





function readPoints(
  annotation: PdfAnnotation,
  fallback: number[] | null,
): number[] | null {
  if (Array.isArray(annotation.data.points) && annotation.data.points.length === 4) {
    return [...(annotation.data.points as number[])];
  }
  return fallback ? [...fallback] : null;
}

function resizeLineLikeRect(
  oldRect: Rect,
  newRect: Rect,
  points: number[] | null,
): { rect: Rect; points: number[] | null } {
  if (!Array.isArray(points) || points.length !== 4) {
    return { rect: newRect, points: null };
  }

  const sx = newRect.width / Math.max(1, oldRect.width);
  const sy = newRect.height / Math.max(1, oldRect.height);
  const nextPoints = [
    points[0] * sx,
    points[1] * sy,
    points[2] * sx,
    points[3] * sy,
  ];

  return { rect: newRect, points: nextPoints };
}


function domRectToPageRect(domRect: DOMRect, pageRect: DOMRect, scale: number): Rect {
  return {
    x: (domRect.left - pageRect.left) / scale,
    y: (domRect.top - pageRect.top) / scale,
    width: domRect.width / scale,
    height: domRect.height / scale,
  };
}

/**
 * Merge span rects that are on the same line (same y ± half-height) into a
 * single wider rect per line. This avoids creating dozens of tiny per-word
 * annotations when the user highlights a long text run.
 */
function mergeAdjacentLineRects(rects: Rect[]): Rect[] {
  if (rects.length === 0) return [];

  // Sort by top then left
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: Rect[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const sameLine = Math.abs(r.y - current.y) < current.height * 0.6;
    const adjacent = r.x <= current.x + current.width + 4; // small gap tolerance

    if (sameLine && adjacent) {
      // Extend current rect to include this span
      const right = Math.max(current.x + current.width, r.x + r.width);
      const bottom = Math.max(current.y + current.height, r.y + r.height);
      current = {
        x: Math.min(current.x, r.x),
        y: Math.min(current.y, r.y),
        width: right - Math.min(current.x, r.x),
        height: bottom - Math.min(current.y, r.y),
      };
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}

function unionRects(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
