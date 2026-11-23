import { selectedMarkupTextRects } from './textSelectionGeometry';
import React from 'react';
import { UploadCloud } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { VList, type VListHandle } from 'virtua';
import { useIsMobile } from '@/hooks/useIsMobile';

import { PdfRendererAdapter, type PdfDocumentLease, type TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { useAnnotationStore } from '@/core/annotations/store';
import { initializeMarkupDraft, remapAnnotationGeometry } from '@/core/annotations/geometryTransform';
import type { PdfAnnotation, Rect, AnnotationType, Point2D, AnnotationNodeProps } from '@/core/annotations/types';

import { isAnnotationType } from '@/core/annotations/annotationTypes';
import type { ActiveTool } from '@/core/editor/types';
import {
  isTextMarkTool as matrixIsTextMark,
  isDualModalityNoteTool as matrixIsDualModalityNote,
  isCanvasPlacementTool as matrixIsCanvasPlacement,
  isFreehandInkTool as matrixIsInk,
  calculateGroupResize,
} from '@/core/tools/toolInteractionMatrix';
import { TextSelectionActionBubble } from './TextSelectionActionBubble';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import {
  resolveActivePdfRendererInput,
} from '@/core/session/activePdfRendererInput';
import { useReviewStore } from '@/core/review/store';
import { annotationRegistry } from '../../core/annotations/registry';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';
import { useAnnotationPersistence } from './useAnnotationPersistence';
import { useWriterPersistence } from './useWriterPersistence';
import { useShallow } from 'zustand/react/shallow';

import { usePageRenderer } from '@/core/renderer/usePageRenderer';
import { useNativeAnnotationAppearances } from '@/core/renderer/useNativeStampAppearances';
import { NativeAppearanceNode } from '@/components/annotations/NativeAppearanceNode';

import { useSearchStore } from '@/core/search/store';
import { FileAdapter, type PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { admitAndOpenPdfFile, firstAdmissionErrorMessage } from '@/core/admission/openPdf';
import {
  admitDonorPdfFiles,
  firstDonorAdmissionErrorMessage,
  type AdmittedDonorPdf,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { InlineExistingTextEditor } from './InlineExistingTextEditor';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useToastStore } from '@/core/toast/store';
import { InsertPdfDialog } from '@/components/dialogs/InsertPdfDialog';
import { WriterOverlay } from '@/components/writer/WriterOverlay';
import { WriterOverlayLayer } from '@/components/writer-v2/WriterOverlayLayer';
import { ocrStore } from '@/core/ocr/store';
import { useOcrStore as useOcrReviewStore } from '@/core/ocr/ocrStore';
import { pdfRectToViewportSelection } from '@/core/ocr/ocrViewportGeometry';
import { OcrCanvasTextLayer } from '@/components/ocr/canvas/OcrCanvasTextLayer';
import { InlineOcrCorrectionPopover } from '@/components/ocr/canvas/InlineOcrCorrectionPopover';
import type { OcrWord } from '@/core/ocr/types';
import EquationOverlay from '@/components/viewer/EquationOverlay';
import { SearchHighlightOverlay } from '@/components/viewer/SearchHighlightOverlay';
import { SearchFloatingHud } from '@/components/viewer/SearchFloatingHud';
import { resetInteractionState } from '@/core/editor/resetInteraction';
import { error as logError } from '@/core/logger/service';
import { SnapIndicatorOverlay } from '../annotations/SnapIndicatorOverlay';
import {
  collectPageSnapPoints,
  resolveLineEndpoint,
  type SnapResult,
} from '@/core/annotations/cadSnapping';
import { DrawingScaleBar } from '../annotations/DrawingScaleBar';
import { ScaleCalibrationDialog } from '../dialogs/ScaleCalibrationDialog';

type TransformState =
  | {
      ids: string[];
      targetId: string;
      mode: 'move' | 'resize' | 'move-all';
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
    getPageCalibration,
    setPageCalibration,
    setAllPagesCalibration,
  } = useAnnotationStore(useShallow((state) => ({
    annotations: state.annotations,
    setAnnotations: state.setAnnotations,
    addAnnotation: state.addAnnotation,
    updateAnnotation: state.updateAnnotation,
    updateManyAnnotations: state.updateManyAnnotations,
    setActiveAnnotationId: state.setActiveAnnotationId,
    selectedAnnotationIds: state.selectedAnnotationIds,
    setSelection: state.setSelection,
    toggleSelection: state.toggleSelection,
    clearSelection: state.clearSelection,
    getPageCalibration: state.getPageCalibration,
    setPageCalibration: state.setPageCalibration,
    setAllPagesCalibration: state.setAllPagesCalibration,
  })));
  const isMobile = useIsMobile();

  const {
    workingBytes,
    documentKey,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    pageGraph,
    viewState,
    setPage,
    setZoom,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    revisionStoreId: state.revisionStoreId,
    originalRevisionId: state.originalRevisionId,
    activeRevisionId: state.activeRevisionId,
    pageGraph: state.pageGraph,
    viewState: state.viewState,
    setPage: state.setPage,
    setZoom: state.setZoom,
  })));

  const {
    activeTool,
    existingTextSelection,
    setExistingTextSelection,
    setInspectorTab,
    setRightPanelWidth,
    setMobileSheetOpen,
  } = useEditorStore(useShallow((state) => ({
    activeTool: state.activeTool,
    existingTextSelection:
      state.existingTextSelection,
    setExistingTextSelection:
      state.setExistingTextSelection,
    setInspectorTab:
      state.setInspectorTab,
    setRightPanelWidth:
      state.setRightPanelWidth,
    setMobileSheetOpen:
      state.setMobileSheetOpen,
  })));
  const { hideResolved } = useReviewStore(useShallow((state) => ({
    hideResolved: state.hideResolved,
  })));
  const { searchHits, activeHitId } = useSearchStore(
    useShallow((state) => ({
      searchHits: state.hits,
      activeHitId: state.activeHitId,
    })),
  );

  const sortedVisibleAnnotations = React.useMemo(
    () =>
      annotations
        .filter((annotation) => !hideResolved || annotation.data?.review?.status !== 'resolved')
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
  const ocrReviewFocus = useOcrReviewStore((state) => state.reviewFocus);
  const setSharedPdfDoc = usePdfStore((state) => state.setPdfDoc);

  const [pdfDoc, setPdfDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [restoredCount, setRestoredCount] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const vlistRef = React.useRef<VListHandle>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const lastPanPos = React.useRef<{ x: number; y: number } | null>(null);
  // Page pixel width at current zoom — used to activate horizontal scroll on wide CAD drawings
  const [pagePixelWidth, setPagePixelWidth] = React.useState<number>(0);

  // Compute page pixel width whenever doc or zoom changes, then patch VList's internal scroller
  React.useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    pdfDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: viewState.zoom / 100 });
      setPagePixelWidth(vp.width);
    }).catch(() => {});
    return () => {
      cancelled = true;
      setPagePixelWidth(0);
    };
  }, [pdfDoc, viewState.zoom]);

  // Patch VList's internal scroll container to allow horizontal scroll.
  // Virtua uses overflow:auto on an inner div that clips horizontal content by default.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const wrapper = containerRef.current.querySelector('[data-vlist-wrapper]');
    if (!wrapper) return;
    // VList's internal scroll root is the first child of the wrapper
    const vlistRoot = wrapper.firstElementChild as HTMLElement | null;
    if (vlistRoot) {
      vlistRoot.style.overflowX = 'auto';
    }
  }, [pdfDoc, viewState.zoom, pagePixelWidth]);

  const [drawingLineStart, setDrawingLineStart] = React.useState<{
    pageNumber: number;
    x: number;
    y: number;
  } | null>(null);
  const [drawingLineCurrent, setDrawingLineCurrent] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [activeSnapResult, setActiveSnapResult] = React.useState<SnapResult | null>(null);
  const [isAngleConstrained, setIsAngleConstrained] = React.useState(false);
  const [showScaleDialog, setShowScaleDialog] = React.useState(false);

  const addToast = useToastStore((state) => state.addToast);
  const [stagedInsert, setStagedInsert] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
  } | null>(null);
  const [isDraggingExternal, setIsDraggingExternal] = React.useState(false);
  const dragCounterRef = React.useRef(0);
  const donorOperationRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => {
    donorOperationRef.current?.abort('document workspace unmounted');
  }, []);

  const executeInsertPdf = async (
    staged: {
      donor: AdmittedDonorPdf;
      controller: AbortController;
      documentKey: string;
    },
    config: {
      donorPageIndices?: number[];
      placement: 'before' | 'after';
      targetPage: number;
    },
  ) => {
    const atIndex = config.placement === 'before'
      ? config.targetPage - 1
      : config.targetPage;
    const count = config.donorPageIndices?.length ?? staged.donor.pageCount;

    try {
      const result = await commandBus.execute({
        command: materializePdfCommand(
          {
            type: 'INSERT_PAGES',
            payload: {
              atIndex,
              donorResourceId: 'donor:0',
              donorPageIndices: config.donorPageIndices,
            },
          },
          'document-workspace',
          useSessionStore.getState().documentKey ?? staged.documentKey,
        ),
        signal: staged.controller.signal,
        resources: {
          donors: {
            'donor:0': staged.donor,
          },
        },
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to insert pages.');
      }

      addToast({
        type: 'success',
        title: 'PDF Inserted',
        message: `Inserted ${count} page(s) from ${staged.donor.fileName}.`,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !staged.controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Insert Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
      setStagedInsert(null);
    }
  };

  const handleExternalFileDrop = async (files: FileList | File[]) => {
    if (!workingBytes) return;

    const fileList = Array.from(files);
    const pdfFiles = fileList.filter(
      (file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf',
    );

    if (pdfFiles.length === 0) {
      addToast({
        type: 'error',
        title: 'Unsupported File',
        message: 'Please drop a valid PDF file (.pdf).',
      });
      return;
    }

    const expectedDocumentKey = documentKey ?? 'default';
    const controller = new AbortController();
    donorOperationRef.current?.abort('superseded by newer drag-drop donor operation');
    donorOperationRef.current = controller;

    const sources: PickedPdfFileSource[] = pdfFiles.map((file) => ({ file }));

    try {
      const result = await admitDonorPdfFiles(
        sources,
        'DOCUMENT_VIEWPORT',
        'INSERT_PAGES',
        {
          signal: controller.signal,
          ownerDocumentKey: expectedDocumentKey,
        },
      );

      if (controller.signal.aborted) return;

      if (result.outcome !== 'ACCEPTED') {
        addToast({
          type: 'error',
          title: 'Insert PDF Failed',
          message: firstDonorAdmissionErrorMessage(result) ?? 'The dropped PDF could not be admitted.',
        });
        return;
      }

      if (result.value.donors.length === 0) return;

      if (result.value.donors.length === 1) {
        const donor = result.value.donors[0]!;
        setStagedInsert({
          donor,
          controller,
          documentKey: expectedDocumentKey,
        });
      } else {
        const targetPage = viewState.currentPage;
        let currentInsertionIndex = targetPage;
        let totalPagesInserted = 0;
        for (let i = 0; i < result.value.donors.length; i++) {
          const donor = result.value.donors[i];
          const insertResult = await commandBus.execute({
            command: materializePdfCommand(
              {
                type: 'INSERT_PAGES',
                payload: {
                  atIndex: currentInsertionIndex,
                  donorResourceId: `donor:${i}`,
                },
              },
              'document-workspace',
              useSessionStore.getState().documentKey ?? expectedDocumentKey,
            ),
            signal: controller.signal,
            resources: {
              donors: {
                [`donor:${i}`]: donor,
              },
            },
          });
          if (!insertResult.success) {
            throw new Error(insertResult.error?.message ?? `Failed to insert pages from ${donor.fileName}`);
          }
          currentInsertionIndex += donor.pageCount;
          totalPagesInserted += donor.pageCount;
        }
        addToast({
          type: 'success',
          title: 'Batch PDFs Inserted',
          message: `Inserted ${totalPagesInserted} pages from ${result.value.donors.length} PDF files.`,
        });
        if (donorOperationRef.current === controller) {
          donorOperationRef.current = null;
        }
      }
    } catch (err) {
      if (isOperationCancelledError(err)) return;
      addToast({
        type: 'error',
        title: 'Admission Error',
        message: err instanceof Error ? err.message : 'Failed to admit dropped PDF.',
      });
    }
  };

  const handleInsertPdfShortcut = React.useCallback(async () => {
    if (!workingBytes) return;
    const expectedDocumentKey = documentKey ?? 'default';
    const controller = new AbortController();
    donorOperationRef.current?.abort('superseded by newer donor operation');
    donorOperationRef.current = controller;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'DOCUMENT_VIEWPORT',
        'INSERT_PAGES',
        {
          signal: controller.signal,
          ownerDocumentKey: expectedDocumentKey,
        },
      );
      if (controller.signal.aborted) return;
      if (result.outcome !== 'ACCEPTED') {
        if (result.outcome !== 'CANCELLED') {
          addToast({
            type: 'error',
            title: 'Donor PDF Rejected',
            message: firstDonorAdmissionErrorMessage(result) ?? 'The donor PDF could not be admitted.',
          });
        }
        return;
      }
      if (result.value.donors.length === 0) return;
      const donor = result.value.donors[0]!;
      setStagedInsert({
        donor,
        controller,
        documentKey: expectedDocumentKey,
      });
    } catch (err) {
      if (isOperationCancelledError(err)) return;
      addToast({
        type: 'error',
        title: 'Admission Error',
        message: err instanceof Error ? err.message : 'Failed to admit donor PDF.',
      });
    }
  }, [workingBytes, documentKey, addToast]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isTyping) return;

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        void handleInsertPdfShortcut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInsertPdfShortcut]);

  const handleBrowse = async () => {
    setLoadError(null);
    try {
      const [picked] = await FileAdapter.pickPdfFileSources(false);
      if (!picked) return;

      const result = await admitAndOpenPdfFile(picked.file, 'WORKSPACE_PICKER', {
        saveHandle: picked.handle ?? null,
      });
      if (result.outcome !== 'ACCEPTED') {
        setLoadError(firstAdmissionErrorMessage(result) ?? 'PDF opening was cancelled.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setLoadError(String(err));
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    let lease: PdfDocumentLease | null = null;
    const controller = new AbortController();

    const releaseLease = async () => {
      if (!lease) return;
      const currentLease = lease;
      lease = null;
      await currentLease.release();
    };

    const load = async () => {
      const hasActiveDocument = Boolean(
        workingBytes || activeRevisionId,
      );
      if (!hasActiveDocument) {
        setPdfDoc(null);
        setSharedPdfDoc(null);
        setLoadError(null);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const rendererInput =
          await resolveActivePdfRendererInput({
            documentKey,
            revisionStoreId,
            originalRevisionId,
            activeRevisionId,
            workingBytes,
          });
        if (!rendererInput || cancelled) return;

        lease = rendererInput.kind === 'source'
          ? await PdfRendererAdapter.acquireDocumentSource({
              source: rendererInput.source,
              cacheKey: rendererInput.cacheKey,
              signal: controller.signal,
            })
          : await PdfRendererAdapter.acquireDocument(
              rendererInput.bytes,
            );

        if (cancelled) {
          await releaseLease();
          return;
        }

        const doc = lease.doc;
        setPdfDoc(doc);
        setSharedPdfDoc(doc);
      } catch (err) {
        await releaseLease();
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
      controller.abort(
        'PDF workspace document changed or unmounted',
      );
      void releaseLease();
    };
  }, [
    workingBytes,
    documentKey,
    revisionStoreId,
    originalRevisionId,
    activeRevisionId,
    setSharedPdfDoc,
  ]);

  React.useEffect(() => {
    if (!existingTextSelection) return;

    const selectionIsCurrent =
      existingTextSelection.revisionId
        === documentKey
      && Boolean(
        pageGraph?.pages.some(
          (page) =>
            page.pageId
            === existingTextSelection.pageId,
        ),
      );

    if (!selectionIsCurrent) {
      setExistingTextSelection(null);
    }
  }, [
    documentKey,
    existingTextSelection,
    pageGraph,
    setExistingTextSelection,
  ]);

  // Reset drawing state when tool changes
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawingLineStart(null);
    setDrawingLineCurrent(null);
    setActiveSnapResult(null);
    setIsAngleConstrained(false);
  }, [activeTool]);

  // Manage window drawing-line preview mousemove/Escape key event listeners cleanly via React lifecycles
  React.useEffect(() => {
    if (!drawingLineStart) return;

    const scale = viewState.zoom / 100;

    const onMove = (e: MouseEvent) => {
      const pageEl = containerRef.current?.querySelector(`[data-page="${drawingLineStart.pageNumber}"]`);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) / scale;
      const currentY = (e.clientY - rect.top) / scale;

      const snapPoints = collectPageSnapPoints(annotations, drawingLineStart.pageNumber);
      const resolved = resolveLineEndpoint(drawingLineStart, { x: currentX, y: currentY }, snapPoints, e.shiftKey);
      const finalPoint = resolved.point;
      setActiveSnapResult(resolved.snapResult);
      setIsAngleConstrained(resolved.angleConstrained);

      setDrawingLineCurrent(finalPoint);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawingLineStart(null);
        setDrawingLineCurrent(null);
        setActiveSnapResult(null);
        setIsAngleConstrained(false);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawingLineStart, viewState.zoom, annotations]);

  useAnnotationPersistence({
    documentKey,
    pdfDoc,
    workingBytes,
    annotations,
    setAnnotations,
    setRestoredCount,
  });

  useWriterPersistence({
    documentKey,
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
  const isProgrammaticScrollRef = React.useRef(false);
  const scrollTimeoutRef = React.useRef<number | null>(null);
  const visibleRatiosRef = React.useRef(new Map<number, number>());
  const lastScrolledDocRef = React.useRef<PDFDocumentProxy | null>(null);
  const lastScrolledPageRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const root = containerRef.current;
    if (!root || !pdfDoc) return;

    // Suppress scroll-spy updates during initial mount / document transitions
    isProgrammaticScrollRef.current = true;
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 400);

    // Resolve the actual scrollable container parent. In continuous mode, this is the Virtua VList scrolling element.
    const scrollContainer = viewState.viewMode === 'continuous'
      ? (root.querySelector('[data-vlist-wrapper]')?.firstElementChild as HTMLElement) || root
      : root;

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
          if (!isProgrammaticScrollRef.current) {
            setPage(best[0]);
          }
        }
      },
      { root: scrollContainer, threshold: [0.1, 0.25, 0.5, 0.75, 1] },
    );

    const observeAll = () => {
      scrollContainer.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => observer.observe(el));
    };

    observeAll();

    const mutationObs = new MutationObserver(() => {
      observer.disconnect();
      observeAll();
    });
    mutationObs.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObs.disconnect();
    };
  }, [pdfDoc, viewState.viewMode, setPage]);

  // Smooth scroll into view when viewState.currentPage changes programmatically (e.g., from the sidebar)
  // or when a new document lease is acquired.
  React.useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    const docChanged = lastScrolledDocRef.current !== pdfDoc;
    if (docChanged) {
      lastScrolledDocRef.current = pdfDoc;
      lastScrolledPageRef.current = null;
      visibleRatiosRef.current.clear();
    } else if (lastScrolledPageRef.current === viewState.currentPage) {
      return;
    }

    // Determine if the target page is already highly visible in the viewport.
    // If it's already the primary visible page (> 70% visible) and doc did not change, we do not scroll.
    if (!docChanged) {
      const best = [...visibleRatiosRef.current.entries()]
        .sort((a, b) => b[1] - a[1])[0];
      if (best && best[0] === viewState.currentPage && best[1] > 0.7) {
        return;
      }
    }

    isProgrammaticScrollRef.current = true;
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 800);

    lastScrolledPageRef.current = viewState.currentPage;

    if (viewState.viewMode === 'continuous' && vlistRef.current) {
      vlistRef.current.scrollToIndex(viewState.currentPage - 1, { align: 'start' });
    } else {
      const scrollWrapper = containerRef.current.querySelector('[data-vlist-wrapper]') as HTMLElement | null;
      if (scrollWrapper && viewState.viewMode === 'single') {
        scrollWrapper.scrollTop = 0;
      }
      const pageEl = containerRef.current.querySelector(`[data-page="${viewState.currentPage}"]`);
      if (pageEl && typeof pageEl.scrollIntoView === 'function') {
        pageEl.scrollIntoView({ behavior: docChanged ? 'auto' : 'smooth', block: 'start' });
      }
    }
  }, [viewState.currentPage, pdfDoc, viewState.viewMode]);

  React.useEffect(() => {
    if (!ocrReviewFocus || !documentKey) return;
    if (ocrReviewFocus.documentFingerprint !== documentKey) return;

    setPage(ocrReviewFocus.pageIndex + 1);
  }, [
    documentKey,
    ocrReviewFocus,
    setPage,
  ]);

  React.useEffect(() => {
    if (!activeHitId || !pdfDoc) return;
    const activeHit = searchHits.find((h) => h.id === activeHitId);
    if (!activeHit) return;

    if (activeHit.pageNumber !== viewState.currentPage) {
      setPage(activeHit.pageNumber);
      if (viewState.viewMode === 'continuous' && vlistRef.current) {
        vlistRef.current.scrollToIndex(activeHit.pageNumber - 1, { align: 'start' });
      }
    }
  }, [activeHitId, searchHits, pdfDoc, viewState.currentPage, viewState.viewMode, setPage]);

  const selectExistingText =
    React.useCallback(
      (
        pageNumber: number,
        pageId: string,
        sourceIndex: number,
      ) => {
        if (!documentKey) {
          return;
        }

        setExistingTextSelection({
          revisionId:
            documentKey,
          pageId,
          sourceIndex,
        });
        setInspectorTab('text');
        setPage(pageNumber);

        if (isMobile) {
          setMobileSheetOpen(true);
        } else if (
          useEditorStore
            .getState()
            .rightPanelWidth
          <= 0.1
        ) {
          setRightPanelWidth(18);
        }
      },
      [
        documentKey,
        isMobile,
        setExistingTextSelection,
        setInspectorTab,
        setMobileSheetOpen,
        setPage,
        setRightPanelWidth,
      ],
    );

  if (!workingBytes && !activeRevisionId) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full bg-slate-100 dark:bg-slate-950/50 p-4"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              setLoadError(null);
              void (async () => {
                try {
                  const result = await admitAndOpenPdfFile(file, 'WORKSPACE_PICKER');
                  if (result.outcome !== 'ACCEPTED') {
                    setLoadError(firstAdmissionErrorMessage(result) ?? 'PDF opening was cancelled.');
                  }
                } catch (err) {
                  setLoadError(String(err));
                }
              })();
            }
          }
        }}
      >
        <div className={[
          "flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 w-full",
          isMobile
            ? "p-6 rounded-xl border border-slate-200 dark:border-slate-800"
            : "p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl max-w-md"
        ].join(' ')}>
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-6">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Open a PDF to get started
          </h2>
          {!isMobile && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              Drag &amp; drop a file here, or click below.
            </p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-8">
            Supports PDF up to 100 MB.
          </p>
          {loadError ? (
            <p role="alert" data-testid="open-pdf-failure" className="mb-4 max-w-sm text-sm text-red-700 dark:text-red-300">
              Unable to open PDF: {loadError}
            </p>
          ) : null}
          <button
            className={[
              "bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors cursor-pointer",
              isMobile ? "w-full h-14 text-base" : "px-6 py-2 text-sm"
            ].join(' ')}
            onClick={handleBrowse}
          >
            Browse Files
          </button>
          {!isMobile && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
              or paste a file with <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">⌘V</kbd>
            </p>
          )}
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
    const pageNode =
      pageGraph?.pages[index]
      ?? null;
    const selectedExistingTextSourceIndex =
      existingTextSelection
      && documentKey
      && pageNode
      && existingTextSelection.revisionId
        === documentKey
      && existingTextSelection.pageId
        === pageNode.pageId
        ? existingTextSelection.sourceIndex
        : null;

    return (
      <div key={pageNumber} style={{ width: 'fit-content', margin: '16px auto', padding: '16px 32px' }}>
        <PageSurfaceMemo
          doc={pdfDoc}
          documentKey={documentKey}
          pageNumber={pageNumber}
          scale={viewState.zoom / 100}
          activeTool={activeTool}
          pageAnnotations={pageAnnotationsMap.get(pageNumber) ?? emptyPageAnnotations}
          selectedAnnotationIds={selectedAnnotationIds}
          drawingLineStart={drawingLineStart}
          drawingLineCurrent={drawingLineCurrent}
          setDrawingLineStart={setDrawingLineStart}
          setDrawingLineCurrent={setDrawingLineCurrent}
          activeSnapResult={drawingLineStart?.pageNumber === pageNumber ? activeSnapResult : null}
          isAngleConstrained={drawingLineStart?.pageNumber === pageNumber ? isAngleConstrained : false}
          onActivate={() => setPage(pageNumber)}
          existingTextPageId={
            pageNode?.pageId
            ?? null
          }
          selectedExistingTextSourceIndex={
            selectedExistingTextSourceIndex
          }
          onSelectExistingText={
            selectExistingText
          }
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
    <div style={{ width: 'fit-content', margin: '16px auto', padding: '16px 32px' }}>
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

    return <div style={{ width: 'fit-content', margin: '16px auto', padding: '16px 32px' }}>{pages[currentSpreadIndex]}</div>;
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
    if (!isPanning || activeTool !== 'hand' || !lastPanPos.current) return;
    const dx = event.clientX - lastPanPos.current.x;
    const dy = event.clientY - lastPanPos.current.y;
    // In continuous mode scroll via the VList handle; otherwise scroll the outer container
    if (viewState.viewMode === 'continuous' && vlistRef.current) {
      vlistRef.current.scrollBy(-dy);
    } else if (containerRef.current) {
      containerRef.current.scrollBy(-dx, -dy);
    }
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
      className={`relative flex flex-col h-full bg-slate-200 dark:bg-slate-950 overflow-hidden ${
        activeTool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragCounterRef.current += 1;
          setIsDraggingExternal(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragCounterRef.current -= 1;
          if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDraggingExternal(false);
          }
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragCounterRef.current = 0;
          setIsDraggingExternal(false);
          if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            void handleExternalFileDrop(event.dataTransfer.files);
          }
        }
      }}
    >
      {isDraggingExternal && (
        <div
          data-testid="viewport-drop-overlay"
          className="absolute inset-0 z-50 pointer-events-none bg-blue-500/10 backdrop-blur-[1px] border-4 border-dashed border-blue-500 flex flex-col items-center justify-center transition-all"
        >
          <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-2xl p-6 flex flex-col items-center gap-3 border border-blue-200 dark:border-blue-800 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Drop PDF to insert into document
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Target: Page {viewState.currentPage} of {pdfDoc.numPages}
            </p>
          </div>
        </div>
      )}
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
      {/* Outer wrapper: overflow-x:auto activates when minWidth > container width (wide CAD drawings) */}
      <div
        data-vlist-wrapper="true"
        className="flex-1"
        style={{
          overflowX: 'auto',
          overflowY: viewState.viewMode === 'continuous' ? 'hidden' : 'auto',
          minWidth: 0,
        }}
      >
        {viewState.viewMode === 'continuous' ? (
          <VList
            ref={vlistRef}
            style={{
              height: '100%',
              // Explicit width drives the outer overflow-x scrollbar for wide drawings
              width: pagePixelWidth > 0 ? Math.max(pagePixelWidth + 64, 0) : '100%',
              minWidth: '100%',
            }}
          >
            {Array.from({ length: pdfDoc.numPages }, (_, index) => renderPage(index))}
          </VList>
        ) : viewState.viewMode === 'single' ? (
          renderSingle()
        ) : (
          renderTwoPage()
        )}
      </div>

      {pdfDoc && (
        <div className="absolute bottom-4 left-4 z-40">
          <DrawingScaleBar
            calibration={getPageCalibration(viewState.currentPage)}
            scale={viewState.zoom / 100}
            onOpenCalibration={() => setShowScaleDialog(true)}
          />
        </div>
      )}

      {pdfDoc && <SearchFloatingHud />}

      {showScaleDialog && pdfDoc && (
        <ScaleCalibrationDialog
          isOpen={showScaleDialog}
          currentPage={viewState.currentPage}
          totalDocumentPages={pdfDoc.numPages}
          currentCalibration={getPageCalibration(viewState.currentPage)}
          onClose={() => setShowScaleDialog(false)}
          onApply={(cal, scope) => {
            if (scope === 'all') {
              setAllPagesCalibration(cal);
            } else {
              setPageCalibration(viewState.currentPage, cal);
            }
            setShowScaleDialog(false);
          }}
        />
      )}

      {stagedInsert && (
        <InsertPdfDialog
          isOpen={true}
          donorFileName={stagedInsert.donor.fileName}
          donorPageCount={stagedInsert.donor.pageCount}
          currentPage={viewState.currentPage}
          totalDocumentPages={pdfDoc.numPages}
          initialPlacement="after"
          onClose={() => {
            stagedInsert.controller.abort('dialog closed');
            setStagedInsert(null);
          }}
          onConfirm={(config) => {
            const staged = stagedInsert;
            setStagedInsert(null);
            void executeInsertPdf(staged, config);
          }}
        />
      )}
    </div>
  );
};

interface PageSurfaceProps {
  doc: PDFDocumentProxy;
  documentKey?: string | null;
  pageNumber: number;
  scale: number;
  activeTool: string;
  pageAnnotations: PdfAnnotation[];
  selectedAnnotationIds: string[];
  existingTextPageId: string | null;
  selectedExistingTextSourceIndex: number | null;
  onActivate: () => void;
  onSelectExistingText: (
    pageNumber: number,
    pageId: string,
    sourceIndex: number,
  ) => void;
  onCreateAnnotation: (annotation: PdfAnnotation) => void;
  onCreateManyAnnotations: (annotations: PdfAnnotation[]) => void;
  onSetSingleSelection: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onSetSelection: (ids: string[]) => void;
  onClearSelection: () => void;
  onCommitAnnotation: (id: string, patch: Partial<PdfAnnotation>) => void;
  onCommitManyAnnotations: (updates: Array<{ id: string; data: Partial<PdfAnnotation> }>) => void;
  drawingLineStart: { pageNumber: number; x: number; y: number } | null;
  drawingLineCurrent: { x: number; y: number } | null;
  setDrawingLineStart: (val: { pageNumber: number; x: number; y: number } | null) => void;
  setDrawingLineCurrent: (val: { x: number; y: number } | null) => void;
  activeSnapResult?: SnapResult | null;
  isAngleConstrained?: boolean;
}

export const PageSurface: React.FC<PageSurfaceProps> = ({
  doc,
  documentKey,
  pageNumber,
  scale,
  activeTool,
  pageAnnotations,
  selectedAnnotationIds,
  existingTextPageId,
  selectedExistingTextSourceIndex,
  onActivate,
  onSelectExistingText,
  onCreateAnnotation: createAnnotation,
  onCreateManyAnnotations: createManyAnnotations,
  onSetSingleSelection,
  onToggleSelection,
  onSetSelection,
  onClearSelection,
  onCommitAnnotation,
  onCommitManyAnnotations,
  drawingLineStart,
  drawingLineCurrent,
  setDrawingLineStart,
  setDrawingLineCurrent,
  activeSnapResult,
  isAngleConstrained,
}) => {
  const sessionDocumentKey = useSessionStore((state) => state.documentKey) ?? '';
  const resolvedDocumentKey = documentKey ?? sessionDocumentKey;
  const workingBytes = useSessionStore((state) => state.workingBytes) ?? null;
  const [inlineEditingTarget, setInlineEditingTarget] = React.useState<{
    pageNumber: number;
    pageId: string;
    sourceIndex: number;
    initialText: string;
    bounds: {
      left: number;
      top: number;
      width: number;
      height: number;
      fontSize: number;
    };
  } | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const ocrFocusRef = React.useRef<HTMLDivElement | null>(null);
  const activeHitId = useSearchStore((state) => state.activeHitId);
  const ocrReviewFocus = useOcrReviewStore((state) => state.reviewFocus);
  const ocrDocumentResult = useOcrReviewStore((state) => state.correctedResult);
  const pageOcrResult = ocrDocumentResult?.pages?.find(
    (p) => (p.pageIndex ?? p.pageNumber - 1) === pageNumber - 1,
  );
  const [activeOcrWordTarget, setActiveOcrWordTarget] = React.useState<{
    word: OcrWord;
    currentText: string;
    anchorRect: DOMRect;
  } | null>(null);
  const pageOcrFocus =
    ocrReviewFocus?.pageIndex === pageNumber - 1
      ? ocrReviewFocus
      : null;
  const activeMode = useEditorStore((state) => state.activeMode);
  const annotationMode = activeMode === 'annotate' || activeMode === 'draw';
  const isSelectTool = activeTool === 'select' || (!annotationMode && activeTool !== 'hand');
  const matrixTool = activeTool as ActiveTool;
  const isHand = activeTool === 'hand';
  const isTextMarkTool = annotationMode && matrixIsTextMark(matrixTool);
  const isNoteTool = annotationMode && matrixIsDualModalityNote(matrixTool);
  const isPlacementOnlyTool = annotationMode && (matrixIsCanvasPlacement(matrixTool) || activeTool === 'squiggly');
  const isInkTool = annotationMode && matrixIsInk(matrixTool);

  const [size, setSize] = React.useState({ width: 800, height: 1000 });
  const pageIdentity = React.useMemo(
    () => ({ doc, pageNumber, documentKey: resolvedDocumentKey }),
    [doc, pageNumber, resolvedDocumentKey],
  );
  const [viewportBasis, setViewportBasis] = React.useState<{
    identity: typeof pageIdentity; rotation: number | null;
  } | null>(null);
  // A gesture may outlive a render; a new identity also invalidates it when
  // the view switches away and later back to the same document and page.
  const currentPageIdentity = React.useRef(pageIdentity);
  const mountedPage = React.useRef(false);
  React.useLayoutEffect(() => {
    mountedPage.current = true;
    return () => { mountedPage.current = false; };
  }, []);
  React.useLayoutEffect(() => { currentPageIdentity.current = pageIdentity; }, [pageIdentity]);
  const isCurrentPage = () => mountedPage.current && currentPageIdentity.current === pageIdentity;
  const viewportReady = viewportBasis?.identity === pageIdentity && viewportBasis.rotation !== null;
  const viewportInvalid = viewportBasis?.identity === pageIdentity && viewportBasis.rotation === null;
  const hasViewportBasis = () => viewportReady && currentPageIdentity.current === pageIdentity;
  const rotation = viewportReady && viewportBasis ? (viewportBasis.rotation ?? 0) : 0;
  const needsViewportBasis = (annotation: PdfAnnotation) =>
    annotation.type === 'highlight' || annotation.type === 'underline' ||
    annotation.type === 'strikeout' || annotation.type === 'squiggly' ||
    annotation.type === 'redaction' || annotation.type === 'stamp';
  const onCreateAnnotation = (annotation: PdfAnnotation) => {
    if (!isCurrentPage()) return;
    if (needsViewportBasis(annotation) && !hasViewportBasis()) return;
    createAnnotation(initializeMarkupDraft(annotation, rotation));
  };
  const onCreateManyAnnotations = (annotations: PdfAnnotation[]) => {
    if (!isCurrentPage()) return;
    if (annotations.some(needsViewportBasis) && !hasViewportBasis()) return;
    createManyAnnotations(annotations.map((annotation) => initializeMarkupDraft(annotation, rotation)));
  };
  const [textLayer, setTextLayer] = React.useState<{
    identity: typeof pageIdentity; scale: number; items: TextLayerItem[];
  } | null>(null);
  const textItems = textLayer?.identity === pageIdentity && textLayer.scale === scale ? textLayer.items : [];
  const [draftRects, setDraftRects] = React.useState<Record<string, Rect>>({});
  const [draftAnchors, setDraftAnchors] = React.useState<Record<string, Point2D | null>>({});
  const [draftKnees, setDraftKnees] = React.useState<Record<string, Point2D | null>>({});
  const [, setDraftLinePoints] = React.useState<Record<string, number[]>>({});
  const [editingState, setEditingState] = React.useState<{
    identity: typeof pageIdentity; id: string; value: string;
  } | null>(null);
  const editingRef = React.useRef<typeof editingState>(null);
  const activeEdit = editingState?.identity === pageIdentity ? editingState : null;
  React.useLayoutEffect(() => () => { editingRef.current = null; }, [pageIdentity]);
  const [marquee, setMarquee] = React.useState<Rect | null>(null);
  const [shapeDraft, setShapeDraft] = React.useState<Rect | null>(null);
  const [selectionState, setTextSelectionDraft] = React.useState<{
    identity: typeof pageIdentity; draft: TextSelectionDraft;
  } | null>(null);
  const textSelectionDraft = selectionState?.identity === pageIdentity ? selectionState.draft : null;
  const transformRef = React.useRef<TransformState>(null);
  const anchorDragRef = React.useRef<AnchorDragState>(null);
  const draftRectsRef = React.useRef<Record<string, Rect>>({});
  const draftAnchorsRef = React.useRef<Record<string, Point2D | null>>({});
  const draftKneesRef = React.useRef<Record<string, Point2D | null>>({});
  const draftLinePointsRef = React.useRef<Record<string, number[]>>({});

  // A page can be replaced or unmounted while a window-level gesture is in
  // progress. Only one gesture may own these listeners; cancelling never
  // invokes the completion callback.
  const cancelGestureRef = React.useRef<(() => void) | null>(null);
  React.useLayoutEffect(() => () => { cancelGestureRef.current?.(); }, [pageIdentity]);
  React.useLayoutEffect(() => () => { cancelGestureRef.current?.(); }, [activeTool, activeMode]);
  React.useLayoutEffect(() => () => { cancelGestureRef.current?.(); }, [scale]);
  const listenForGesture = (
    onMove: (event: MouseEvent | PointerEvent) => void,
    onUp: (event: MouseEvent | PointerEvent) => void,
    onCancel: () => void,
  ) => {
    cancelGestureRef.current?.();
    let finished = false;
    const detach = () => {
      finished = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', cancel);
      document.body.style.userSelect = '';
      if (cancelGestureRef.current === cancel) cancelGestureRef.current = null;
    };
    const cancel = () => { detach(); onCancel(); };
    let lastX = -1;
    let lastY = -1;
    const move = (event: MouseEvent | PointerEvent) => {
      if (finished) return;
      if (currentPageIdentity.current !== pageIdentity || (event.buttons & 1) === 0) { cancel(); return; }
      if (event.clientX === lastX && event.clientY === lastY) return;
      lastX = event.clientX;
      lastY = event.clientY;
      onMove(event);
    };
    const finish = (event: MouseEvent | PointerEvent) => {
      if (finished) return;
      if (event.button !== 0) return;
      if (currentPageIdentity.current !== pageIdentity) { cancel(); return; }
      detach();
      onUp(event);
    };
    cancelGestureRef.current = cancel;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', finish);
    window.addEventListener('blur', cancel);
  };

  const { size: renderSize, ocrViewport } = usePageRenderer({
    doc,
    documentKey: resolvedDocumentKey,
    pageNumber,
    scale,
    canvasRef,
  });
  const nativeAnnotationAppearances = useNativeAnnotationAppearances(doc, pageAnnotations);

  React.useEffect(() => {
    let cancelled = false;

    const render = async () => {
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>;
      try {
        page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
        const rawRotation = viewport.rotation === undefined ? 0 : viewport.rotation;
        const viewportRotation = ((rawRotation % 360) + 360) % 360;
        if (Number.isFinite(rawRotation) && [0, 90, 180, 270].includes(viewportRotation)) {
          setViewportBasis({ identity: pageIdentity, rotation: viewportRotation });
        } else {
          setViewportBasis({ identity: pageIdentity, rotation: null });
        }
      } catch {
        if (!cancelled) setViewportBasis({ identity: pageIdentity, rotation: null });
        return;
      }

      const items = await PdfRendererAdapter.getPageTextItems(page, scale);
      if (!cancelled) {
        setTextLayer({ identity: pageIdentity, scale, items });
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [doc, resolvedDocumentKey, pageNumber, scale, pageIdentity]);

  // Mouseup can follow mousemove before React commits an effect. Keep the
  // authoritative gesture state synchronous so fast drags cannot lose edits.
  const updateDraftRects = (update: (state: Record<string, Rect>) => Record<string, Rect>) => {
    const next = update(draftRectsRef.current);
    draftRectsRef.current = next;
    setDraftRects(next);
  };
  const updateDraftAnchors = (update: (state: Record<string, Point2D | null>) => Record<string, Point2D | null>) => {
    const next = update(draftAnchorsRef.current);
    draftAnchorsRef.current = next;
    setDraftAnchors(next);
  };
  const updateDraftKnees = (update: (state: Record<string, Point2D | null>) => Record<string, Point2D | null>) => {
    const next = update(draftKneesRef.current);
    draftKneesRef.current = next;
    setDraftKnees(next);
  };
  const updateDraftLinePoints = (update: (state: Record<string, number[]>) => Record<string, number[]>) => {
    const next = update(draftLinePointsRef.current);
    draftLinePointsRef.current = next;
    setDraftLinePoints(next);
  };

  React.useEffect(() => {
    if (!activeHitId) return;

    const tryScroll = () => {
      const activeHitElement = document.getElementById(`search-hit-${activeHitId}`);
      if (activeHitElement) {
        activeHitElement.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return true;
      }
      return false;
    };

    if (!tryScroll()) {
      const raf = requestAnimationFrame(() => {
        tryScroll();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [activeHitId, pageNumber]);

  React.useEffect(() => {
    if (!pageOcrFocus || !ocrFocusRef.current) return;

    ocrFocusRef.current.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [pageOcrFocus]);

  const pageWidth = (renderSize?.width || size.width) / scale;
  const pageHeight = (renderSize?.height || size.height) / scale;

  const pageOcrFocusRect = React.useMemo(() => {
    if (!pageOcrFocus) return null;
    if (ocrViewport && typeof ocrViewport.convertToViewportRectangle === 'function') {
      return pdfRectToViewportSelection(ocrViewport, pageOcrFocus.bbox);
    }
    return {
      x: pageOcrFocus.bbox.x * scale,
      y: (pageHeight - pageOcrFocus.bbox.y - pageOcrFocus.bbox.height) * scale,
      width: Math.max(2, pageOcrFocus.bbox.width * scale),
      height: Math.max(2, pageOcrFocus.bbox.height * scale),
    };
  }, [pageOcrFocus, ocrViewport, pageHeight, scale]);

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

  const commitTextEdit = (
    annotation: PdfAnnotation,
    value: string,
    edit: typeof activeEdit,
    stylePatch?: Record<string, unknown>,
  ) => {
    if (!isCurrentPage() || !edit || editingRef.current !== edit || edit.id !== annotation.id) return;
    editingRef.current = null;
    setEditingState(null);
    // An imported native /RC remains geometry-bound after the first user
    // text edit. Its MUTATED_USER_EDIT state must not make it eligible for
    // HTML auto-sizing on a later refresh/edit confirmation.
    const hasNativeRichTextRoot = annotation.data.nativeInterop?.richText === true;
    const currentRect = draftRectsRef.current[annotation.id];
    const effectiveFontSize = typeof stylePatch?.fontSize === 'number' ? stylePatch.fontSize : readFontSize(annotation);
    const nextRect =
      !hasNativeRichTextRoot && annotation.data.autoSize !== false && isTextLike(annotation.type)
        ? autoSizeRectForText(
            value,
            effectiveFontSize,
            currentRect ?? annotation.rect,
          )
        : currentRect ?? annotation.rect;

    const nextData: Record<string, unknown> = {
      ...annotation.data,
      ...stylePatch,
      text: value,
    };

    if (hasNativeRichTextRoot && value !== (annotation.data.text ?? '')) {
      nextData.nativeInterop = {
        fidelityClass: 'MUTATED_USER_EDIT',
        reason: 'USER_EDITED',
        richText: true,
      };
    }

    onCommitAnnotation(annotation.id, {
      rect: nextRect,
      data: nextData,
    });
  };

  const startTransform = (
    event: React.PointerEvent<HTMLDivElement>,
    annotation: PdfAnnotation,
    mode: 'move' | 'resize' | 'move-all',
  ) => {
    if (annotation.data.locked === true) return;
    cancelGestureRef.current?.();

    event.preventDefault();
    event.preventDefault();
    event.stopPropagation();
    clearTextSelectionDraft();

    const selectedOnPage = pageAnnotations
      .filter((item) => selectedAnnotationIds.includes(item.id) && item.data.locked !== true)
      .map((item) => item.id);

    const ids =
      (mode === 'move' || mode === 'move-all') &&
      selectedOnPage.includes(annotation.id) &&
      selectedOnPage.length > 1
        ? selectedOnPage
        : [annotation.id];

    if (!((mode === 'move' || mode === 'move-all') && ids.length > 1)) {
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

    let moved = false;
    const onMove = (moveEvent: MouseEvent | PointerEvent) => {
      const current = transformRef.current;
      if (!current) return;
      // Pointer and mouse events may round coordinates differently. A click
      // must not dirty native geometry or regenerate its appearance.
      if (!moved && Math.hypot(moveEvent.clientX - current.startClientX, moveEvent.clientY - current.startClientY) < 1) return;
      moved = true;

      let dx = (moveEvent.clientX - current.startClientX) / scale;
      let dy = (moveEvent.clientY - current.startClientY) / scale;
      if (moveEvent.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) {
          dy = 0;
        } else {
          dx = 0;
        }
      }

      if (current.mode === 'move' || current.mode === 'move-all') {
        const nextRects: Record<string, Rect> = {};
        const nextAnchors: Record<string, Point2D | null> = {};
        const nextKnees: Record<string, Point2D | null> = {};

        const moveAnchor = current.mode === 'move-all' || current.ids.length > 1;

        current.ids.forEach((id) => {
          const baseRect = current.startRects[id];
          const nextRect = clampRect({
            ...baseRect,
            x: baseRect.x + dx,
            y: baseRect.y + dy,
          });
          nextRects[id] = nextRect;

          const anchor = current.startAnchors[id];
          const item = pageAnnotations.find((value) => value.id === id);
          const isCallout = item?.type === 'callout';

          if (anchor && isCallout && !moveAnchor) {
            // Text box move for a callout: arrow pointer remains anchored to the drawing, leader line stretches!
            nextAnchors[id] = anchor;
            const style = item.data.leaderStyle
              ? (item.data.leaderStyle === 'straight' ? 'straight' : 'elbow')
              : (current.startKnees[id] ? 'elbow' : 'straight');
            nextKnees[id] = style === 'elbow'
              ? computeDefaultCalloutKnee(nextRect, anchor)
              : null;
          } else if (anchor) {
            nextAnchors[id] = {
              x: clamp(anchor.x + dx, 0, current.pageWidth),
              y: clamp(anchor.y + dy, 0, current.pageHeight),
            };

            const knee = current.startKnees[id];
            nextKnees[id] = knee
              ? {
                  x: clamp(knee.x + dx, 0, current.pageWidth),
                  y: clamp(knee.y + dy, 0, current.pageHeight),
                }
              : null;
          } else {
            nextAnchors[id] = null;
            nextKnees[id] = null;
          }
        });

        updateDraftRects((state) => ({ ...state, ...nextRects }));
        updateDraftAnchors((state) => ({ ...state, ...nextAnchors }));
        updateDraftKnees((state) => ({ ...state, ...nextKnees }));
      } else if (current.ids.length > 1) {
        const items = current.ids.map((id) => {
          const item = pageAnnotations.find((a) => a.id === id);
          return {
            id,
            rect: current.startRects[id] ?? { x: 0, y: 0, width: 0, height: 0 },
            type: item?.type ?? 'textbox',
          };
        });
        const groupUnion = unionRects(items.map((i) => i.rect));
        const resizedGroup = calculateGroupResize(groupUnion, items, dx, dy);
        updateDraftRects((state) => ({
          ...state,
          ...resizedGroup,
        }));
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
            updateDraftLinePoints((state) => ({
              ...state,
              [current.targetId]: linePoints,
            }));
          }
        }

        updateDraftRects((state) => ({
          ...state,
          [current.targetId]: scaled.rect,
        }));
      }
    };

    const onUp = (upEvent: MouseEvent | PointerEvent) => {
      const gesture = transformRef.current;
      if (gesture && (moved || Math.hypot(upEvent.clientX - gesture.startClientX, upEvent.clientY - gesture.startClientY) >= 1)) onMove(upEvent);
      const current = transformRef.current;
      if (!current) return;

      if (moved && (current.mode === 'move' || current.mode === 'move-all')) {
        const liveRects = draftRectsRef.current;
        const liveAnchors = draftAnchorsRef.current;
        const liveKnees = draftKneesRef.current;
        onCommitManyAnnotations(
          current.ids.map((id) => {
            const item = pageAnnotations.find((a) => a.id === id);
            const startAnchor = current.startAnchors[id];
            const liveAnchor = liveAnchors[id] ?? startAnchor;
            const startKnee = current.startKnees[id];
            const liveKnee = id in liveKnees ? liveKnees[id] : startKnee;
            return {
              id,
              data: {
                rect: liveRects[id] ?? current.startRects[id],
                data: {
                  ...(item?.data ?? {}),
                  ...(startAnchor ? { anchor: liveAnchor } : {}),
                  ...(startAnchor ? { knee: liveKnee } : {}),
                },
              } as Partial<PdfAnnotation>,
            };
          }),
        );
      } else if (moved && current.ids.length > 1) {
        const liveRects = draftRectsRef.current;
        onCommitManyAnnotations(
          current.ids.map((id) => {
            const item = pageAnnotations.find((value) => value.id === id);
            const nextRect = liveRects[id] ?? current.startRects[id];
            return {
              id,
              data: {
                rect: nextRect,
                data: item ? remapAnnotationGeometry(item, nextRect) : {},
              } as Partial<PdfAnnotation>,
            };
          }),
        );
      } else if (moved) {
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

      updateDraftRects((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      updateDraftAnchors((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      updateDraftKnees((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      updateDraftLinePoints((state) => {
        const next = { ...state };
        current.ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      transformRef.current = null;
    };

    listenForGesture(onMove, onUp, () => {
      transformRef.current = null;
      updateDraftRects(() => ({}));
      updateDraftAnchors(() => ({}));
      updateDraftKnees(() => ({}));
      updateDraftLinePoints(() => ({}));
    });
  };

  const startAnchorDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    annotation: PdfAnnotation,
  ) => {
    if (annotation.data.locked === true) return;
    cancelGestureRef.current?.();

    const anchor = readAnchor(annotation, draftAnchorsRef.current[annotation.id] ?? null);
    if (!anchor) return;
    const rect = draftRectsRef.current[annotation.id] ?? annotation.rect;
    const knee = readKnee(
      annotation,
      draftKneesRef.current[annotation.id] ?? null,
      anchor,
      rect,
    );

    event.preventDefault();
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

    let moved = false;
    const onMove = (moveEvent: MouseEvent | PointerEvent) => {
      const current = anchorDragRef.current;
      if (!current) return;
      if (!moved && Math.hypot(moveEvent.clientX - current.startClientX, moveEvent.clientY - current.startClientY) < 1) return;
      moved = true;

      const screenDx = (moveEvent.clientX - current.startClientX) / scale;
      const screenDy = (moveEvent.clientY - current.startClientY) / scale;
      const radians = (annotation.data.rotation ?? 0) * Math.PI / 180;
      let dx = screenDx * Math.cos(radians) + screenDy * Math.sin(radians);
      let dy = -screenDx * Math.sin(radians) + screenDy * Math.cos(radians);
      if (moveEvent.shiftKey) {
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const rawAngle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
          dx = dist * Math.cos(snappedAngle);
          dy = dist * Math.sin(snappedAngle);
        }
      }
      const nextAnchor = annotation.data.rotation
        ? { x: current.startAnchor.x + dx, y: current.startAnchor.y + dy }
        : { x: clamp(current.startAnchor.x + dx, 0, current.pageWidth), y: clamp(current.startAnchor.y + dy, 0, current.pageHeight) };

      updateDraftAnchors((state) => ({
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
          updateDraftKnees((state) => ({
            ...state,
            [current.id]: nextKnee,
          }));
        }
      }
    };

    const onUp = (upEvent: MouseEvent | PointerEvent) => {
      const gesture = anchorDragRef.current;
      if (gesture && (moved || Math.hypot(upEvent.clientX - gesture.startClientX, upEvent.clientY - gesture.startClientY) >= 1)) onMove(upEvent);
      const current = anchorDragRef.current;
      if (!current) return;

      const item = pageAnnotations.find((value) => value.id === current.id);
      if (item && moved) {
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

      updateDraftAnchors((state) => {
        const next = { ...state };
        delete next[current.id];
        return next;
      });
      updateDraftKnees((state) => {
        const next = { ...state };
        delete next[current.id];
        return next;
      });

      anchorDragRef.current = null;
    };

    listenForGesture(onMove, onUp, () => {
      anchorDragRef.current = null;
      updateDraftAnchors(() => ({}));
      updateDraftKnees(() => ({}));
    });
  };

  const handleTextSelectionMouseUp = (event: Pick<MouseEvent, 'button'>) => {
    if (event.button !== 0 || !isCurrentPage()) return;
    if (!(isSelectTool || isTextMarkTool || isNoteTool) || !pageRef.current) return;
    if (isTextMarkTool && !hasViewportBasis()) return;

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
    const range = selection.getRangeAt(0);

    // Selection offsets must be projected inside the PDF.js source span;
    // intersecting a whole span cannot authorize its unselected neighboring words.
    const rects = mergeAdjacentLineRects(
      selectedMarkupTextRects(range, pageEl, scale),
    );

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
      } else if (activeTool === 'squiggly') {
        const items = draft.rects.map((rect) => buildSquigglyAnnotation(pageNumber, rect));
        onCreateManyAnnotations(items);
      } else if (activeTool === 'comment' || activeTool === 'sticky-note') {
        const item = buildStickyNoteFromSelection(
          pageNumber,
          draft.unionRect,
          draft.text,
          pageWidth,
          pageHeight,
        );
        onCreateAnnotation(item);
      } else if (activeTool === 'callout') {
        const item = buildCalloutFromSelection(
          pageNumber,
          draft.unionRect,
          draft.text,
          pageWidth,
          pageHeight,
        );
        onCreateAnnotation(item);
      }

      clearTextSelectionDraft();
      resetInteractionState();
    } else {
      setTextSelectionDraft({ identity: pageIdentity, draft });
    }
  };

  const createHighlightsFromSelection = () => {
    if (!textSelectionDraft || !isCurrentPage()) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildHighlightAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createUnderlineFromSelection = () => {
    if (!textSelectionDraft || !isCurrentPage()) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildUnderlineAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createStrikeoutFromSelection = () => {
    if (!textSelectionDraft || !isCurrentPage()) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildStrikeoutAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createSquigglyFromSelection = () => {
    if (!textSelectionDraft || !isCurrentPage()) return;
    const items = textSelectionDraft.rects.map((rect) =>
      buildSquigglyAnnotation(pageNumber, rect),
    );
    onCreateManyAnnotations(items);
    clearTextSelectionDraft();
  };

  const createNoteFromSelection = (type: 'sticky-note' | 'comment' | 'callout' = 'sticky-note') => {
    if (!textSelectionDraft || !isCurrentPage()) return;
    if (type === 'callout') {
      const item = buildCalloutFromSelection(
        pageNumber,
        textSelectionDraft.unionRect,
        textSelectionDraft.text,
        pageWidth,
        pageHeight,
      );
      onCreateAnnotation(item);
    } else {
      const item = buildStickyNoteFromSelection(
        pageNumber,
        textSelectionDraft.unionRect,
        textSelectionDraft.text,
        pageWidth,
        pageHeight,
      );
      onCreateAnnotation(item);
    }
    clearTextSelectionDraft();
  };

  const [inkPaths, setInkPaths] = React.useState<number[][]>([]);
  const currentPathRef = React.useRef<number[]>([]);

  const startMarquee = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (isInkTool) {
      if (event.target instanceof Element && event.target.closest('[data-annotation-type]')) return;
      cancelGestureRef.current?.();
      const hostRect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - hostRect.left) / scale;
      const y = (event.clientY - hostRect.top) / scale;
      currentPathRef.current = [x, y];

      const appendPoint = (pointerEvent: MouseEvent) => {
        const pointX = (pointerEvent.clientX - hostRect.left) / scale;
        const pointY = (pointerEvent.clientY - hostRect.top) / scale;
        const path = currentPathRef.current;
        const lastX = path[path.length - 2];
        const lastY = path[path.length - 1];
        if (path.length === 2 && Math.hypot((pointX - x) * scale, (pointY - y) * scale) < 1) return;
        if (pointX === lastX && pointY === lastY) return;
        const nextPath = [...path, pointX, pointY];
        currentPathRef.current = nextPath;
        setInkPaths(prev => {
          const newPaths = [...prev];
          newPaths[newPaths.length - 1] = nextPath;
          return newPaths;
        });
      };
      const onMove = (moveEvent: MouseEvent) => {
        if (moveEvent.buttons) appendPoint(moveEvent);
      };

      const onUp = (upEvent: MouseEvent | PointerEvent) => {
        appendPoint(upEvent);
        if (currentPathRef.current.length < 4) {
          setInkPaths([]);
          currentPathRef.current = [];
          return;
        }

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
      listenForGesture(onMove, onUp, () => {
        currentPathRef.current = [];
        setInkPaths([]);
      });
      return;
    }

    if (activeTool !== 'select') return;
    if (event.target !== event.currentTarget) return;
    cancelGestureRef.current?.();

    clearTextSelectionDraft();
    const hostRect = event.currentTarget.getBoundingClientRect();
    const startX = (event.clientX - hostRect.left) / scale;
    const startY = (event.clientY - hostRect.top) / scale;
    setMarquee({ x: startX, y: startY, width: 0, height: 0 });
    const marqueeAt = (pointerEvent: MouseEvent): Rect => {
      const x = (pointerEvent.clientX - hostRect.left) / scale;
      const y = (pointerEvent.clientY - hostRect.top) / scale;
      return {
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      };
    };
    const onMove = (moveEvent: MouseEvent) => { setMarquee(marqueeAt(moveEvent)); };

    const onUp = (upEvent: MouseEvent | PointerEvent) => {
      const currentMarquee = marqueeAt(upEvent);
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
      setMarquee(null);
    };

    listenForGesture(onMove, onUp, () => { setMarquee(null); });
  };

  /**
   * Drag-to-draw handler for all placement-only tools.
   * Mousedown captures start position → mousemove updates rubber-band preview
   * → mouseup commits the annotation with the final dragged rect.
   * A simple click (no meaningful drag) falls back to the default-sized rect
   * from buildAnnotation so placing by click still works.
   */
  const startShapeDraw = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only the creation hit surface may start a placement gesture.
    if (event.button !== 0 || (!isPlacementOnlyTool && !isNoteTool)) return;
    const isTextTarget = event.target instanceof Element && !!event.target.closest('[data-text-item]');
    if (event.target !== event.currentTarget && !((isNoteTool || activeTool === 'squiggly') && isTextTarget)) return;
    cancelGestureRef.current?.();
    onActivate();

    const hostRect = event.currentTarget.getBoundingClientRect();
    const startX = (event.clientX - hostRect.left) / scale;
    const startY = (event.clientY - hostRect.top) / scale;

    if (!isAnnotationType(activeTool)) return;
    const tool = activeTool;
    if (['highlight', 'underline', 'strikeout', 'squiggly', 'redaction', 'stamp'].includes(tool) && !hasViewportBasis()) return;

    if (tool === 'squiggly' && isTextTarget && !event.altKey) {
      const surface = event.currentTarget;
      // A selection from an earlier gesture must never create a new annotation.
      window.getSelection()?.removeAllRanges();
      listenForGesture(() => {}, (upEvent) => {
        const selection = window.getSelection();
        if (!(upEvent.target instanceof Node) || !surface.contains(upEvent.target) ||
            !selection?.anchorNode || !selection.focusNode ||
            !surface.contains(selection.anchorNode) || !surface.contains(selection.focusNode)) {
          selection?.removeAllRanges();
          return;
        }
        handleTextSelectionMouseUp(upEvent);
      }, () => { window.getSelection()?.removeAllRanges(); });
      return;
    }
    if (tool === 'squiggly' && event.altKey) event.preventDefault();

    // Line and arrow are placed via exactly two clicks.
    if (tool === 'line' || tool === 'arrow') {
      if (!drawingLineStart || drawingLineStart.pageNumber !== pageNumber) {
        setDrawingLineStart({ pageNumber, x: startX, y: startY });
        setDrawingLineCurrent({ x: startX, y: startY });
      } else {
        const x1 = drawingLineStart.x;
        const y1 = drawingLineStart.y;
        // Resolve the endpoint from the committing click itself; the hover
        // preview state can lag (or never update) when clicks arrive quickly.
        const endpoint = resolveLineEndpoint(
          { x: x1, y: y1 },
          { x: startX, y: startY },
          collectPageSnapPoints(pageAnnotations, pageNumber),
          event.shiftKey,
        ).point;
        const x2 = endpoint.x;
        const y2 = endpoint.y;

        const rectX = Math.min(x1, x2);
        const rectY = Math.min(y1, y2);
        const rectWidth = Math.max(Math.abs(x2 - x1), 8);
        const rectHeight = Math.max(Math.abs(y2 - y1), 8);

        const points = [
          x1 - rectX,
          y1 - rectY,
          x2 - rectX,
          y2 - rectY
        ];

        const annotation = buildLineAnnotation(tool, pageNumber,
          { x: rectX, y: rectY, width: rectWidth, height: rectHeight }, points);

        onCreateAnnotation(annotation);
        setDrawingLineStart(null);
        setDrawingLineCurrent(null);
        resetInteractionState();
      }
      return;
    }

    // A note can either be placed with a click or attached to selected text.
    if (tool === 'comment' || tool === 'sticky-note') {
      listenForGesture(() => {}, (upEvent) => {
        if (window.getSelection()?.toString().trim()) {
          handleTextSelectionMouseUp(upEvent);
          return;
        }
        const endX = (upEvent.clientX - hostRect.left) / scale;
        const endY = (upEvent.clientY - hostRect.top) / scale;
        if (Math.hypot(upEvent.clientX - event.clientX, upEvent.clientY - event.clientY) >= 3 ||
            endX < 0 || endY < 0 || endX > pageWidth || endY > pageHeight) return;
        onCreateAnnotation(buildAnnotation(tool, pageNumber, startX, startY));
        resetInteractionState();
      }, () => {});
      return;
    }

    // Callout is placed directly via a single click event or attached to selected text.
    if (tool === 'callout') {
      if (window.getSelection()?.toString().trim()) {
        handleTextSelectionMouseUp(event);
        return;
      }
      const annotation = buildAnnotation('callout', pageNumber, startX, startY);
      onCreateAnnotation(annotation);
      resetInteractionState();
      return;
    }

    let rawEndX = startX;
    let rawEndY = startY;
    let latestDraft: Rect = { x: startX, y: startY, width: 0, height: 0 };
    let isDrag = false;

    setShapeDraft(latestDraft);

    const updatePlacement = (moveEvent: MouseEvent) => {
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
    const onMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons) updatePlacement(moveEvent);
    };

    const onUp = (upEvent: MouseEvent | PointerEvent) => {
      updatePlacement(upEvent);
      setShapeDraft(null);
      clearTextSelectionDraft();

      const annotation = buildAnnotation(tool, pageNumber, startX, startY);
      if (annotation.type === 'stamp') annotation.data.nativeStampBasisRotation = rotation;

      if (isDrag) {
        const finalRect: Rect = {
          x: latestDraft.x,
          y: latestDraft.y,
          width: Math.max(latestDraft.width, 8),
          height: Math.max(latestDraft.height, 8),
        };
        annotation.rect = finalRect;
      }

      onCreateAnnotation(annotation);
      resetInteractionState();
    };

    listenForGesture(onMove, onUp, () => { setShapeDraft(null); });
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

      {pageOcrResult && textItems.length === 0 && (
        <OcrCanvasTextLayer
          pageIndex={pageNumber - 1}
          pageResult={pageOcrResult}
          scale={scale}
          onWordClick={(word, currentText, anchorRect) => {
            setActiveOcrWordTarget({ word, currentText, anchorRect });
          }}
        />
      )}

      {activeOcrWordTarget && (
        <InlineOcrCorrectionPopover
          word={activeOcrWordTarget.word}
          initialText={activeOcrWordTarget.currentText}
          anchorRect={activeOcrWordTarget.anchorRect}
          onCommit={(newText) => {
            const now = new Date().toISOString();
            useOcrReviewStore.getState().upsertOcrCorrection({
              id: `corr-${activeOcrWordTarget.word.id}-${Date.now()}`,
              documentFingerprint: ocrDocumentResult?.documentFingerprint || 'ocr-doc',
              targetId: activeOcrWordTarget.word.id,
              targetType: 'word',
              pageIndex: activeOcrWordTarget.word.pageIndex,
              originalText: activeOcrWordTarget.word.text,
              correctedText: newText,
              bbox: activeOcrWordTarget.word.bbox,
              createdAt: now,
              updatedAt: now,
            });
            setActiveOcrWordTarget(null);
          }}
          onClose={() => setActiveOcrWordTarget(null)}
        />
      )}

      {!viewportReady && (isTextMarkTool || ['squiggly', 'redaction', 'stamp'].includes(activeTool)) && (
        <div role="status" className="absolute top-2 left-2 z-50 rounded bg-slate-900 px-2 py-1 text-xs text-white pointer-events-none">
          {viewportInvalid ? 'Unable to determine page rotation.' : 'Loading page…'}
        </div>
      )}

      {annotationMode && activeTool === 'squiggly' && viewportReady && (
        <div className="absolute top-2 left-2 z-50 rounded bg-slate-900 px-2 py-1 text-xs text-white pointer-events-none">
          Drag over text to mark it. Hold Alt and drag to draw freely.
        </div>
      )}

      {pageOcrFocus && pageOcrFocusRect ? (
        <div
          ref={ocrFocusRef}
          data-testid="ocr-review-focus-target"
          className="absolute z-[19] pointer-events-none rounded-sm border-2 border-blue-500 bg-blue-400/15 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
          style={{
            left: pageOcrFocusRect.x,
            top: pageOcrFocusRect.y,
            width: Math.max(2, pageOcrFocusRect.width),
            height: Math.max(2, pageOcrFocusRect.height),
          }}
        >
          {pageOcrFocus.label ? (
            <span className="absolute -top-6 left-0 max-w-52 truncate rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {pageOcrFocus.label}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        data-testid="annotation-interaction-layer"
        className="absolute inset-0"
        style={{
          pointerEvents: !isHand && (isSelectTool || isTextMarkTool || isNoteTool || isInkTool) ? 'auto' : 'none',
          userSelect: !isHand && (isSelectTool || isTextMarkTool || isNoteTool) ? 'text' : 'none',
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
        <SearchHighlightOverlay pageNumber={pageNumber} scale={scale} />

        {textItems.map((item) => (
          <span
            key={item.id}
            data-text-item="true"
            data-existing-text-source-index={
              item.sourceIndex
            }
            data-existing-text-selected={
              selectedExistingTextSourceIndex
                === item.sourceIndex
                ? 'true'
                : 'false'
            }
            onDoubleClick={(event) => {
              if (!isSelectTool) return;
              const sourceIndex =
                item.sourceIndex;
              if (
                !existingTextPageId
                || typeof sourceIndex !== 'number'
                || !Number.isInteger(
                  sourceIndex,
                )
                || sourceIndex < 0
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              clearTextSelectionDraft();
              onSelectExistingText(
                pageNumber,
                existingTextPageId,
                sourceIndex,
              );
              setInlineEditingTarget({
                pageNumber,
                pageId: existingTextPageId,
                sourceIndex,
                initialText: item.text,
                bounds: {
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                  fontSize: item.fontSize,
                },
              });
            }}
            onPointerUp={(event) => {
              if (
                !isSelectTool
                || event.pointerType !== 'touch'
              ) {
                return;
              }

              const sourceIndex =
                item.sourceIndex;
              if (
                !existingTextPageId
                || typeof sourceIndex !== 'number'
                || !Number.isInteger(
                  sourceIndex,
                )
                || sourceIndex < 0
              ) {
                return;
              }

              const browserSelection =
                window.getSelection()
                  ?.toString()
                  .trim()
                ?? '';
              if (browserSelection) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              clearTextSelectionDraft();
              onSelectExistingText(
                pageNumber,
                existingTextPageId,
                sourceIndex,
              );
            }}
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
              visibility:
                inlineEditingTarget
                && inlineEditingTarget.pageNumber === pageNumber
                && inlineEditingTarget.sourceIndex === item.sourceIndex
                  ? 'hidden'
                  : 'visible',
              backgroundColor:
                selectedExistingTextSourceIndex
                  === item.sourceIndex
                  ? 'rgba(59, 130, 246, 0.18)'
                  : undefined,
              boxShadow:
                selectedExistingTextSourceIndex
                  === item.sourceIndex
                  ? 'inset 0 0 0 1px rgba(37, 99, 235, 0.55)'
                  : undefined,
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            {item.text}
          </span>
        ))}

        {inlineEditingTarget && inlineEditingTarget.pageNumber === pageNumber && (
          <InlineExistingTextEditor
            pageNumber={inlineEditingTarget.pageNumber}
            pageId={inlineEditingTarget.pageId}
            sourceIndex={inlineEditingTarget.sourceIndex}
            initialText={inlineEditingTarget.initialText}
            bounds={inlineEditingTarget.bounds}
            workingBytes={workingBytes}
            documentKey={resolvedDocumentKey}
            onCommitSuccess={() => setInlineEditingTarget(null)}
            onCancel={() => setInlineEditingTarget(null)}
          />
        )}
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
            <TextSelectionActionBubble
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              scale={scale}
              unionRect={textSelectionDraft.unionRect}
              selectedText={textSelectionDraft.text}
              onHighlight={createHighlightsFromSelection}
              onUnderline={createUnderlineFromSelection}
              onStrikeout={createStrikeoutFromSelection}
              onSquiggly={createSquigglyFromSelection}
              onStickyNote={() => createNoteFromSelection('sticky-note')}
              onCallout={() => createNoteFromSelection('callout')}
              onDismiss={clearTextSelectionDraft}
            />
          )}
        </>
      )}

      <div
        data-testid="annotation-placement-layer"
        className={`absolute inset-0 ${
          activeTool !== 'select' ? 'cursor-crosshair' : ''
        }`}
        style={{ pointerEvents: !isHand && isPlacementOnlyTool ? 'auto' : 'none', zIndex: isPlacementOnlyTool || isInkTool ? 13 : 0 }}
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
        {/* Dashed line/arrow preview while placing with click events */}
        {drawingLineStart && drawingLineStart.pageNumber === pageNumber && drawingLineCurrent && (
          <svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
            <defs>
              <marker
                id="arrow-preview-end"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
              </marker>
            </defs>
            <line
              x1={drawingLineStart.x * scale}
              y1={drawingLineStart.y * scale}
              x2={drawingLineCurrent.x * scale}
              y2={drawingLineCurrent.y * scale}
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="4 4"
              markerEnd={activeTool === 'arrow' ? 'url(#arrow-preview-end)' : undefined}
            />
          </svg>
        )}
        {/* CAD Magnetic Snap Indicator Overlay */}
        {drawingLineStart && drawingLineStart.pageNumber === pageNumber && (
          <SnapIndicatorOverlay
            snapResult={activeSnapResult ?? null}
            originPoint={drawingLineStart ? { x: drawingLineStart.x, y: drawingLineStart.y } : undefined}
            isAngleConstrained={isAngleConstrained}
            scale={scale}
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
          const linePoints = draftLinePointsRef.current[annotation.id];
          const displayAnnotation = (annotation.type === 'ink' || annotation.type === 'shape-polygon') && rawRect !== annotation.rect
            ? { ...annotation, rect: rawRect, data: remapAnnotationGeometry(annotation, rawRect) }
            : (annotation.type === 'line' || annotation.type === 'arrow') && linePoints
              ? { ...annotation, rect: rawRect, data: { ...annotation.data, points: linePoints } }
              : annotation;
          const scaledRect = {
            x: rawRect.x * scale,
            y: rawRect.y * scale,
            width: rawRect.width * scale,
            height: rawRect.height * scale,
          };
          const anchor = readAnchor(annotation, draftAnchors[annotation.id]);
          const knee = readKnee(
            annotation,
            draftKnees[annotation.id],
            anchor,
            rawRect,
          );

          const sourceAppearance = annotation.data.nativeAppearanceRef
            ? nativeAnnotationAppearances[annotation.data.nativeAppearanceRef]
            : undefined;
          // Imported /AP is the visual source of truth. Use the app's normal
          // annotation renderer for user-authored annotations, edited native
          // artwork or missing/unavailable appearance streams.
          const PreviewComponent: React.FC<AnnotationRendererProps> =
            ['textbox', 'callout', 'line', 'arrow', 'shape-rect', 'shape-ellipse', 'shape-cloud'].includes(annotation.type)
            && annotation.type !== 'stamp'
            && annotation.data.nativeAppearanceImported === true
            && annotation.data.nativeAppearanceDirty !== true
            && Boolean(sourceAppearance)
            && Boolean(annotation.data.nativeAppearanceRect)
            && Boolean(annotation.data.nativeAppearanceBodyRect)
              ? NativeAppearanceNode
              : NodeComponent;

          return (
            <PreviewComponent
              key={annotation.id}
              annotation={displayAnnotation}
              rect={scaledRect}
              scale={scale}
              isSelected={selected}
              isEditing={activeEdit?.id === annotation.id}
              editingValue={activeEdit?.value ?? ''}
              pageRotation={rotation}
              nativeAppearanceUrl={sourceAppearance}
              onSelect={(event: React.PointerEvent<HTMLDivElement>) => {
                event.stopPropagation();
                clearTextSelectionDraft();
                if (event.metaKey || event.ctrlKey) {
                  onToggleSelection(annotation.id);
                } else {
                  onSetSingleSelection(annotation.id);
                }
              }}
              onTransformStart={(event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize' | 'move-all') => startTransform(event, annotation, mode)}
              onDoubleClick={() => {
                if (!isCurrentPage() || annotation.data?.locked === true) return;
                const edit = { identity: pageIdentity, id: annotation.id, value: readText(annotation) };
                editingRef.current = edit;
                setEditingState(edit);
              }}
              onCommitEdit={(v: string, stylePatch?: Record<string, unknown>) => commitTextEdit(annotation, v, activeEdit, stylePatch)}
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
        {(isPlacementOnlyTool || isInkTool || isNoteTool) && (
          <div
            data-testid="annotation-creation-hit-target"
            className="absolute inset-0"
            style={{ pointerEvents: isHand ? 'none' : 'auto', zIndex: 100 }}
            onMouseDown={isInkTool ? startMarquee : startShapeDraw}
          >
            {(isNoteTool || activeTool === 'squiggly') && textItems.map((item) => (
              <span
                key={item.id}
                data-text-item="true"
                aria-hidden="true"
                style={{
                  position: 'absolute', left: item.x, top: item.y,
                  width: item.width, height: item.height, fontSize: item.fontSize,
                  lineHeight: `${item.height}px`, fontFamily: 'sans-serif',
                  whiteSpace: 'pre', color: 'transparent', userSelect: 'text',
                  WebkitUserSelect: 'text',
                }}
              >{item.text}</span>
            ))}
          </div>
        )}
      </div>

      <WriterOverlay
        pageNumber={pageNumber}
        scale={scale}
        pageDimensions={renderSize || size}
        ocrViewport={ocrViewport}
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

      <EquationOverlay
        ocrStore={ocrStore}
        pageNumber={pageNumber}
        scale={scale}
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
    prev.documentKey === next.documentKey &&
    prev.pageNumber === next.pageNumber &&
    prev.scale === next.scale &&
    prev.activeTool === next.activeTool &&
    prev.pageAnnotations === next.pageAnnotations &&
    prev.selectedAnnotationIds === next.selectedAnnotationIds &&
    prev.existingTextPageId === next.existingTextPageId &&
    prev.selectedExistingTextSourceIndex === next.selectedExistingTextSourceIndex &&
    prev.onSelectExistingText === next.onSelectExistingText &&
    prev.drawingLineStart === next.drawingLineStart &&
    prev.drawingLineCurrent === next.drawingLineCurrent &&
    prev.activeSnapResult === next.activeSnapResult &&
    prev.isAngleConstrained === next.isAngleConstrained,
);














function buildLineAnnotation(type: 'line' | 'arrow', pageNumber: number, rect: Rect, points: number[]): PdfAnnotation {
  const timestamp = Date.now();
  return {
    id: uuidv4(), type, pageNumber, rect,
    data: { borderColor: '#111827', points, ...(type === 'arrow' ? { lineEndCap: 'arrow' } : {}) },
    createdAt: timestamp, updatedAt: timestamp,
  };
}

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

function buildStickyNoteFromSelection(
  pageNumber: number,
  sourceRect: Rect,
  text: string,
  pageWidth: number,
  pageHeight: number,
): PdfAnnotation {
  const now = Date.now();
  const noteX = clamp(sourceRect.x + sourceRect.width + 12, 0, Math.max(0, pageWidth - 28));
  const noteY = clamp(sourceRect.y, 0, Math.max(0, pageHeight - 28));
  return {
    id: uuidv4(),
    type: 'sticky-note',
    pageNumber,
    rect: { x: noteX, y: noteY, width: 28, height: 28 },
    data: {
      text: `Note on: "${text.length > 60 ? text.slice(0, 57) + '...' : text}"`,
      author: 'Current User',
      backgroundColor: '#fde047',
      borderColor: '#facc15',
      isCollapsed: false,
      attachedSelectionRect: sourceRect,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function isTextLike(type: AnnotationType): boolean {
  // Native Text notes are icons: editing their contents must not resize their
  // PDF rectangle or make an otherwise unchanged copied appearance invalid.
  return type === 'textbox' || type === 'stamp' || type === 'callout';
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
  draftAnchor?: Point2D | null,
): Point2D | null {
  if (draftAnchor !== undefined && draftAnchor !== null) {
    return draftAnchor;
  }
  const anchor = annotation.data.anchor;
  if (
    anchor &&
    typeof anchor === 'object' &&
    typeof (anchor as { x?: unknown }).x === 'number' &&
    typeof (anchor as { y?: unknown }).y === 'number'
  ) {
    return anchor as Point2D;
  }
  return null;
}

function readKnee(
  annotation: PdfAnnotation,
  draftKnee: Point2D | null | undefined,
  anchor: Point2D | null,
  rect: Rect,
): Point2D | null {
  if (draftKnee !== undefined) {
    return draftKnee;
  }
  const knee = annotation.data.knee;
  if (
    knee &&
    typeof knee === 'object' &&
    typeof (knee as { x?: unknown }).x === 'number' &&
    typeof (knee as { y?: unknown }).y === 'number'
  ) {
    return knee as Point2D;
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
  const width = Math.max(rect.width, Math.min(600, Math.round(longest * (fontSize * 0.60) + 12)));
  const height = Math.max(rect.height, Math.round(lines.length * (fontSize * 1.25) + 8));
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
