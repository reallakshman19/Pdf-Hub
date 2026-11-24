import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Layers, GripVertical, ZoomIn, ZoomOut } from 'lucide-react';
import { VList, type VListHandle } from 'virtua';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { getAnnotationReviewStatus } from '@/core/review/annotationReview';
import { useSearchStore } from '@/core/search/store';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type CommandResources,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { isOperationCancelledError, raceWithAbort } from '@/core/cancellation/operationCancellation';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
  type AdmittedDonorPdf,
  type AdmittedDonorSet,
} from '@/core/admission/donorPdf';
import type { PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { useToastStore } from '@/core/toast/store';
import { InsertPdfDialog } from '@/components/dialogs/InsertPdfDialog';
import { ThumbnailActionStrip } from '@/components/sidebar/thumbnails/ThumbnailActionStrip';
import { ThumbnailContextMenu } from '@/components/sidebar/thumbnails/ThumbnailContextMenu';
import { acquireScheduledThumbnail } from '@/core/renderer/thumbnailRenderService';
import { RENDER_PRIORITIES } from '@/core/renderer/renderScheduler';

interface ThumbItem {
  pageNumber: number;
  pageWidth: number;   // PDF page width in CSS-pixel units at scale=1
  pageHeight: number;  // PDF page height in CSS-pixel units at scale=1
}

export type ThumbnailFilter = 'all' | 'annotations' | 'reviews' | 'search';
export type ThumbDensity = 'compact' | 'comfortable' | 'detailed';
export const DENSITY_HEIGHTS: Record<ThumbDensity, number> = {
  compact: 85,
  comfortable: 135,
  detailed: 195,
};

export function formatPageDimensions(width: number, height: number): string {
  if (!width || !height) return '';
  const w = Math.round(width);
  const h = Math.round(height);
  const matches = (targetW: number, targetH: number) =>
    (Math.abs(w - targetW) <= 3 && Math.abs(h - targetH) <= 3) ||
    (Math.abs(w - targetH) <= 3 && Math.abs(h - targetW) <= 3);

  if (matches(612, 792)) return 'Letter';
  if (matches(595, 842)) return 'A4';
  if (matches(612, 1008)) return 'Legal';
  if (matches(842, 1191)) return 'A3';
  if (matches(792, 1224)) return 'Tabloid';
  return `${w} × ${h} pt`;
}

/** Returns a semi-transparent fill color for an annotation type preview */
function annotationPreviewColor(type: string): string {
  switch (type) {
    case 'highlight':   return 'rgba(250,204,21,0.55)';
    case 'underline':
    case 'strikeout':
    case 'squiggly':   return 'rgba(239,68,68,0.60)';
    case 'comment':
    case 'sticky-note':
    case 'callout':    return 'rgba(59,130,246,0.55)';
    case 'shape-rect':
    case 'shape-ellipse':
    case 'shape-cloud':
    case 'shape-polygon': return 'rgba(34,197,94,0.45)';
    case 'redaction':  return 'rgba(15,23,42,0.75)';
    case 'line':
    case 'arrow':      return 'rgba(100,116,139,0.55)';
    case 'ink':        return 'rgba(139,92,246,0.55)';
    case 'stamp':      return 'rgba(239,68,68,0.45)';
    default:           return 'rgba(100,116,139,0.45)';
  }
}

function rangeInclusive(from: number, to: number): number[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function buildReorderOrder(
  pageCount: number,
  movingIndices: number[],
  targetPageIndex: number,
): number[] {
  const selected = new Set(movingIndices);
  const baseOrder = Array.from({ length: pageCount }, (_, index) => index);
  const remaining = baseOrder.filter((index) => !selected.has(index));
  const moving = baseOrder.filter((index) => selected.has(index));

  const targetInRemaining = remaining.indexOf(targetPageIndex);
  const insertionIndex = targetInRemaining === -1 ? remaining.length : targetInRemaining;

  return [
    ...remaining.slice(0, insertionIndex),
    ...moving,
    ...remaining.slice(insertionIndex),
  ];
}


interface ThumbnailImageProps {
  doc: PDFDocumentProxy;
  documentKey: string;
  pageNumber: number;
  currentPage: number;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  doc,
  documentKey,
  pageNumber,
  currentPage,
}) => {
  const requestKey = `${documentKey}:${pageNumber}`;
  const [imageState, setImageState] = React.useState<{
    requestKey: string;
    imageUrl: string;
  } | null>(null);
  const imageUrl = imageState?.requestKey === requestKey
    ? imageState.imageUrl
    : null;

  React.useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | null = null;

    const distance = Math.abs(pageNumber - currentPage);
    const priority = distance <= 2
      ? RENDER_PRIORITIES.nearbyThumbnail
      : RENDER_PRIORITIES.backgroundThumbnail;

    void acquireScheduledThumbnail({
      doc,
      documentKey,
      pageNumber,
      priority,
      signal: controller.signal,
    }).then((lease) => {
      if (controller.signal.aborted) {
        lease.release();
        return;
      }
      release = lease.release;
      setImageState({ requestKey, imageUrl: lease.value.imageUrl });
    }).catch((thumbnailError) => {
      if (!controller.signal.aborted && !isOperationCancelledError(thumbnailError)) {
        setImageState(null);
      }
    });

    return () => {
      controller.abort('Thumbnail left the virtualized viewport');
      release?.();
    };
  }, [doc, requestKey, pageNumber, currentPage, documentKey]);

  if (!imageUrl) {
    return <div className="h-full w-full animate-pulse bg-slate-100 dark:bg-slate-900" />;
  }

  return (
    <img
      src={imageUrl}
      alt={`Thumbnail for page ${pageNumber}`}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center' }}
    />
  );
};

const ThumbnailSidebar: React.FC = () => {
  const {
    workingBytes,
    documentKey,
    pageGraph,
    viewState,
    setPage,
    selectedPages,
    setSelectedPages,
    toggleSelectedPage,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    pageGraph: state.pageGraph,
    viewState: state.viewState,
    setPage: state.setPage,
    selectedPages: state.selectedPages,
    setSelectedPages: state.setSelectedPages,
    toggleSelectedPage: state.toggleSelectedPage,
  })));
  const { pdfDoc } = usePdfStore();
  const addToast = useToastStore((state) => state.addToast);
  const { setSidebarTab } = useEditorStore(useShallow((state) => ({
    setSidebarTab: state.setSidebarTab,
  })));
  const { annotations } = useAnnotationStore(useShallow((state) => ({
    annotations: state.annotations,
  })));
  const { hits } = useSearchStore(useShallow((state) => ({
    hits: state.hits,
  })));

  const [thumbs, setThumbs] = React.useState<ThumbItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const vlistRef = React.useRef<VListHandle>(null);
  // thumbHeight controls the pixel height of the thumbnail image area (sm/md/lg)
  const [thumbDensity, setThumbDensity] = React.useState<ThumbDensity>('comfortable');
  const [thumbHeight, setThumbHeight] = React.useState(DENSITY_HEIGHTS.comfortable);
  const THUMB_MIN = 60;
  const THUMB_MAX = 260;
  const THUMB_STEP = 35;
  const [dragPage, setDragPage] = React.useState<number | null>(null);
  const [dragPageGroup, setDragPageGroup] = React.useState<number[]>([]);
  const [dragOverPage, setDragOverPage] = React.useState<number | null>(null);
  const [internalDragOver, setInternalDragOver] = React.useState<{
    pageNumber: number;
    position: 'before' | 'after';
  } | null>(null);
  const [externalDragOver, setExternalDragOver] = React.useState<{
    pageNumber: number;
    position: 'before' | 'after';
  } | null>(null);
  const [stagedInsert, setStagedInsert] = React.useState<{
    donor: AdmittedDonorPdf;
    admittedSet: AdmittedDonorSet;
    controller: AbortController;
    documentKey: string;
    targetPage: number;
    initialPlacement: 'before' | 'after';
  } | null>(null);
  const donorOperationRef = React.useRef<AbortController | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    page: number;
  } | null>(null);
  const lastSelectedPageRef = React.useRef<number | null>(null);

  const [thumbnailFilter, setThumbnailFilter] = React.useState<ThumbnailFilter>('all');
  const [prevDocumentKey, setPrevDocumentKey] = React.useState(documentKey);
  if (prevDocumentKey !== documentKey) {
    setPrevDocumentKey(documentKey);
    setThumbnailFilter('all');
  }

  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollAnimationRef = React.useRef<number | null>(null);
  const scrollSpeedRef = React.useRef<number>(0);

  const stopAutoScroll = React.useCallback(() => {
    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
    scrollSpeedRef.current = 0;
  }, []);

  const startAutoScroll = React.useCallback((speed: number) => {
    scrollSpeedRef.current = speed;
    if (scrollAnimationRef.current !== null) return;

    const scrollLoop = () => {
      if (scrollSpeedRef.current !== 0 && vlistRef.current) {
        if (typeof vlistRef.current.scrollBy === 'function') {
          vlistRef.current.scrollBy(scrollSpeedRef.current);
        }
        scrollAnimationRef.current = requestAnimationFrame(scrollLoop);
      } else {
        scrollAnimationRef.current = null;
      }
    };
    scrollAnimationRef.current = requestAnimationFrame(scrollLoop);
  }, []);

  React.useEffect(() => {
    const handleGlobalDragEnd = () => stopAutoScroll();
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  const pageCount = thumbs.length;

  const annotationCountByPage = React.useMemo(() => {
    const counts: Record<number, number> = {};
    annotations.forEach((annotation) => {
      counts[annotation.pageNumber] = (counts[annotation.pageNumber] ?? 0) + 1;
    });
    return counts;
  }, [annotations]);

  const unresolvedCountByPage = React.useMemo(() => {
    const counts: Record<number, number> = {};
    annotations.forEach((annotation) => {
      const status = getAnnotationReviewStatus(annotation);
      if (status === 'resolved') return;
      counts[annotation.pageNumber] = (counts[annotation.pageNumber] ?? 0) + 1;
    });
    return counts;
  }, [annotations]);

  const rejectedCountByPage = React.useMemo(() => {
    const counts: Record<number, number> = {};
    annotations.forEach((annotation) => {
      const status = getAnnotationReviewStatus(annotation);
      if (status === 'rejected') {
        counts[annotation.pageNumber] = (counts[annotation.pageNumber] ?? 0) + 1;
      }
    });
    return counts;
  }, [annotations]);

  const reviewHeatByPage = React.useMemo(() => {
    const heatMap: Record<number, 'rejected' | 'open' | null> = {};
    annotations.forEach((annotation) => {
      const status = getAnnotationReviewStatus(annotation);
      const current = heatMap[annotation.pageNumber];
      if (status === 'rejected') {
        heatMap[annotation.pageNumber] = 'rejected';
      } else if (status === 'open' && current !== 'rejected') {
        heatMap[annotation.pageNumber] = 'open';
      }
    });
    return heatMap;
  }, [annotations]);

  const searchHitCountByPage = React.useMemo(() => {
    const counts: Record<number, number> = {};
    hits.forEach((hit) => {
      counts[hit.pageNumber] = (counts[hit.pageNumber] ?? 0) + 1;
    });
    return counts;
  }, [hits]);

  const annotatedPageCount = React.useMemo(() => {
    return thumbs.filter((thumb) => (annotationCountByPage[thumb.pageNumber] ?? 0) > 0).length;
  }, [thumbs, annotationCountByPage]);

  const reviewedPageCount = React.useMemo(() => {
    return thumbs.filter((thumb) => (unresolvedCountByPage[thumb.pageNumber] ?? 0) > 0).length;
  }, [thumbs, unresolvedCountByPage]);

  const searchPageCount = React.useMemo(() => {
    return thumbs.filter((thumb) => (searchHitCountByPage[thumb.pageNumber] ?? 0) > 0).length;
  }, [thumbs, searchHitCountByPage]);

  const filteredThumbs = React.useMemo(() => {
    if (thumbnailFilter === 'all') return thumbs;
    return thumbs.filter((thumb) => {
      if (thumbnailFilter === 'annotations') {
        return (annotationCountByPage[thumb.pageNumber] ?? 0) > 0;
      }
      if (thumbnailFilter === 'reviews') {
        return (unresolvedCountByPage[thumb.pageNumber] ?? 0) > 0;
      }
      if (thumbnailFilter === 'search') {
        return (searchHitCountByPage[thumb.pageNumber] ?? 0) > 0;
      }
      return true;
    });
  }, [thumbs, thumbnailFilter, annotationCountByPage, unresolvedCountByPage, searchHitCountByPage]);

  React.useEffect(() => {
    if (filteredThumbs.length > 0) {
      const filteredIndex = filteredThumbs.findIndex((t) => t.pageNumber === viewState.currentPage);
      if (filteredIndex !== -1) {
        vlistRef.current?.scrollToIndex(filteredIndex, { align: 'nearest' });
      }
    }
  }, [viewState.currentPage, filteredThumbs]);

  React.useEffect(() => {
    // Synchronize selectedPages with viewState.currentPage when scrolling or clicking inside the main viewer
    if (viewState.currentPage && !selectedPages.includes(viewState.currentPage)) {
      setSelectedPages([viewState.currentPage]);
    }
  }, [viewState.currentPage, selectedPages, setSelectedPages]);

  React.useEffect(() => {
    const controller = new AbortController();

    const loadPageMetadata = async () => {
      if (!workingBytes || !pdfDoc) {
        setThumbs([]);
        return;
      }
      setLoading(true);
      try {
        const result: ThumbItem[] = [];
        const metadataBatchSize = 8;
        for (let start = 1; start <= pdfDoc.numPages; start += metadataBatchSize) {
          if (controller.signal.aborted) break;
          const pageNumbers = Array.from(
            { length: Math.min(metadataBatchSize, pdfDoc.numPages - start + 1) },
            (_, index) => start + index,
          );
          const batch = await Promise.all(pageNumbers.map(async (pageNumber) => {
            const pagePromise = pdfDoc.getPage(pageNumber);
            const page = await raceWithAbort(
              pagePromise,
              controller.signal,
              `load PDF page ${pageNumber} metadata for thumbnail sidebar`,
              () => {
                void pagePromise
                  .then((latePage) => latePage.cleanup())
                  .catch(() => undefined);
              },
            );
            try {
              const viewport = page.getViewport({ scale: 1 });
              return {
                pageNumber,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
              };
            } finally {
              page.cleanup();
            }
          }));
          result.push(...batch);
        }
        if (!controller.signal.aborted) setThumbs(result);
      } catch (thumbnailError) {
        if (!controller.signal.aborted && !isOperationCancelledError(thumbnailError)) setThumbs([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPageMetadata();
    return () => controller.abort('Thumbnail metadata changed or unmounted');
  }, [workingBytes, pdfDoc, documentKey]);

  const applySelection = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    const isToggle = event.metaKey || event.ctrlKey;
    const isRange = event.shiftKey;

    if (isRange) {
      const anchor = lastSelectedPageRef.current ?? viewState.currentPage;
      let range: number[];
      if (thumbnailFilter !== 'all') {
        const anchorIdx = filteredThumbs.findIndex((t) => t.pageNumber === anchor);
        const currentIdx = filteredThumbs.findIndex((t) => t.pageNumber === pageNumber);
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(anchorIdx, currentIdx);
          const end = Math.max(anchorIdx, currentIdx);
          range = filteredThumbs.slice(start, end + 1).map((t) => t.pageNumber);
        } else {
          range = [pageNumber];
        }
      } else {
        range = rangeInclusive(anchor, pageNumber);
      }
      const nextSelection = isToggle
        ? Array.from(new Set([...selectedPages, ...range])).sort((left, right) => left - right)
        : range;
      setSelectedPages(nextSelection);
      setPage(pageNumber);
      lastSelectedPageRef.current = pageNumber;
      return;
    }

    if (isToggle) {
      toggleSelectedPage(pageNumber);
      lastSelectedPageRef.current = pageNumber;
      return;
    }

    setSelectedPages([pageNumber]);
    setPage(pageNumber);
    lastSelectedPageRef.current = pageNumber;
  };

  const handleDrop = async (targetPage: number) => {
    if (!workingBytes || dragPage === null) return;

    if (thumbnailFilter !== 'all') {
      addToast({
        type: 'info',
        title: 'Reorder Disabled',
        message: 'Clear page filter to reorder pages.',
      });
      setDragPage(null);
      setDragPageGroup([]);
      setDragOverPage(null);
      setInternalDragOver(null);
      return;
    }

    const movingPages = dragPageGroup.length > 0 ? dragPageGroup : [dragPage];
    if (movingPages.includes(targetPage)) {
      setDragPage(null);
      setDragPageGroup([]);
      setDragOverPage(null);
      setInternalDragOver(null);
      return;
    }

    const movingIndices = movingPages.map((page) => page - 1).sort((left, right) => left - right);
    const order = buildReorderOrder(pageCount, movingIndices, targetPage - 1);

    if (!documentKey) return;

    const result = await commandBus.execute({
      command: materializePdfCommand(
        {
          type: 'REORDER_PAGES_BY_ORDER',
          payload: { order },
        },
        'thumbnail-menu',
        documentKey,
      ),
    });

    if (result.success) {
      const movingSet = new Set(movingIndices);
      const nextSelectedPages = order
        .map((oldIndex, newIndex) => ({ oldIndex, newIndex }))
        .filter((entry) => movingSet.has(entry.oldIndex))
        .map((entry) => entry.newIndex + 1)
        .sort((left, right) => left - right);
      setSelectedPages(nextSelectedPages);
      setPage(nextSelectedPages[0] ?? targetPage);
    }

    setDragPage(null);
    setDragPageGroup([]);
    setDragOverPage(null);
    setInternalDragOver(null);
  };

  React.useEffect(() => {
    return () => {
      donorOperationRef.current?.abort('thumbnail sidebar unmounted');
      donorOperationRef.current = null;
    };
  }, []);

  const handleCloseInsertDialog = () => {
    if (stagedInsert) {
      stagedInsert.controller.abort('insert dialog cancelled');
      if (donorOperationRef.current === stagedInsert.controller) {
        donorOperationRef.current = null;
      }
      setStagedInsert(null);
    }
  };

  const executeInsertPdf = async (config: {
    donorPageIndices?: number[];
    placement: 'before' | 'after';
    targetPage: number;
  }) => {
    if (!stagedInsert) return;
    const { donor, controller, documentKey: expectedDocumentKey } = stagedInsert;
    const atIndex = config.placement === 'before'
      ? config.targetPage - 1
      : config.targetPage;
    const count = config.donorPageIndices?.length ?? donor.pageCount;

    try {
      assertAdmittedDonorSetDispatchAllowed(
        stagedInsert.admittedSet,
        {
          ownerDocumentKey: expectedDocumentKey,
          signal: controller.signal,
        },
      );

      const commandDraft: PdfCommandDraft = {
        type: 'INSERT_PAGES',
        payload: {
          atIndex,
          donorResourceId: 'donor:0',
          donorPageIndices: config.donorPageIndices,
        },
      };

      const resources: CommandResources = {
        donors: {
          'donor:0': donor,
        },
      };

      const result = await commandBus.execute({
        command: materializePdfCommand(commandDraft, 'thumbnail-menu', expectedDocumentKey),
        signal: controller.signal,
        resources,
      });

      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Insert Pages Failed',
          message: result.error?.message ?? 'Failed to insert pages from PDF.',
        });
      } else {
        addToast({
          type: 'success',
          title: 'Pages Inserted',
          message: `Inserted ${count} page(s) from ${donor.fileName} ${config.placement} page ${config.targetPage}.`,
        });
      }
    } catch (err) {
      if (isOperationCancelledError(err)) return;
      addToast({
        type: 'error',
        title: 'Insert Pages Failed',
        message: err instanceof Error ? err.message : 'An error occurred during insertion.',
      });
    } finally {
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
      setStagedInsert(null);
    }
  };

  const handleExternalFileDrop = async (
    files: FileList | File[],
    targetPage: number,
    position: 'before' | 'after',
  ) => {
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
        'THUMBNAIL_DRAG_DROP',
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
          admittedSet: result.value,
          controller,
          documentKey: expectedDocumentKey,
          targetPage,
          initialPlacement: position,
        });
      } else {
        let currentInsertionIndex = position === 'before' ? targetPage - 1 : targetPage;
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
              'thumbnail-drag-drop',
              expectedDocumentKey,
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

  const handleContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    event.preventDefault();
    if (!selectedPages.includes(pageNumber)) {
      setSelectedPages([pageNumber]);
      setPage(pageNumber);
      lastSelectedPageRef.current = pageNumber;
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      page: pageNumber,
    });
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      applySelection(event, pageNumber);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const currentFilteredIndex = filteredThumbs.findIndex((t) => t.pageNumber === pageNumber);
      if (currentFilteredIndex !== -1 && currentFilteredIndex < filteredThumbs.length - 1) {
        const nextTargetPage = filteredThumbs[currentFilteredIndex + 1]?.pageNumber;
        const nextThumb = document.getElementById(`thumbnail-${nextTargetPage}`);
        nextThumb?.focus();
      } else if (currentFilteredIndex === -1 && pageNumber < pageCount) {
        const nextThumb = document.getElementById(`thumbnail-${pageNumber + 1}`);
        nextThumb?.focus();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const currentFilteredIndex = filteredThumbs.findIndex((t) => t.pageNumber === pageNumber);
      if (currentFilteredIndex > 0) {
        const prevTargetPage = filteredThumbs[currentFilteredIndex - 1]?.pageNumber;
        const prevThumb = document.getElementById(`thumbnail-${prevTargetPage}`);
        prevThumb?.focus();
      } else if (currentFilteredIndex === -1 && pageNumber > 1) {
        const prevThumb = document.getElementById(`thumbnail-${pageNumber - 1}`);
        prevThumb?.focus();
      }
      return;
    }

    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const target = event.currentTarget.getBoundingClientRect();
      setContextMenu({
        x: target.left + 40,
        y: target.top + 16,
        page: pageNumber,
      });
    }
  };

  const handleListDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!listContainerRef.current) return;
    const rect = listContainerRef.current.getBoundingClientRect();
    const mouseY = event.clientY;
    const edgeThreshold = 48;

    if (mouseY >= rect.top && mouseY < rect.top + edgeThreshold) {
      const distance = Math.max(0, mouseY - rect.top);
      const speed = -Math.max(4, Math.round((1 - distance / edgeThreshold) * 14));
      startAutoScroll(speed);
    } else if (mouseY <= rect.bottom && mouseY > rect.bottom - edgeThreshold) {
      const distance = Math.max(0, rect.bottom - mouseY);
      const speed = Math.max(4, Math.round((1 - distance / edgeThreshold) * 14));
      startAutoScroll(speed);
    } else {
      stopAutoScroll();
    }
  };

  if (!workingBytes) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Pages</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Open a PDF to generate thumbnails and reorder pages.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderBottom: '1px solid #e2e8f0',
        background: '#ffffff',
      }}>
        <Layers size={14} style={{ color: '#64748b' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>Pages</span>
        {/* Filmstrip density presets */}
        <div className="flex items-center rounded border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-xs">
          <button
            type="button"
            data-testid="density-compact"
            title="Compact density (85px)"
            onClick={() => {
              setThumbDensity('compact');
              setThumbHeight(DENSITY_HEIGHTS.compact);
            }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              thumbDensity === 'compact'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            C
          </button>
          <button
            type="button"
            data-testid="density-comfortable"
            title="Comfortable density (135px)"
            onClick={() => {
              setThumbDensity('comfortable');
              setThumbHeight(DENSITY_HEIGHTS.comfortable);
            }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              thumbDensity === 'comfortable'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            M
          </button>
          <button
            type="button"
            data-testid="density-detailed"
            title="Detailed density (195px)"
            onClick={() => {
              setThumbDensity('detailed');
              setThumbHeight(DENSITY_HEIGHTS.detailed);
            }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              thumbDensity === 'detailed'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            D
          </button>
        </div>
        {/* Thumbnail size controls */}
        <button
          title="Smaller thumbnails"
          disabled={thumbHeight <= THUMB_MIN}
          onClick={() => {
            setThumbHeight(h => {
              const next = Math.max(THUMB_MIN, h - THUMB_STEP);
              if (next <= DENSITY_HEIGHTS.compact) setThumbDensity('compact');
              else if (next <= DENSITY_HEIGHTS.comfortable) setThumbDensity('comfortable');
              else setThumbDensity('detailed');
              return next;
            });
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 4, border: '1px solid #e2e8f0',
            background: thumbHeight <= THUMB_MIN ? '#f8fafc' : '#fff',
            color: thumbHeight <= THUMB_MIN ? '#cbd5e1' : '#475569',
            cursor: thumbHeight <= THUMB_MIN ? 'not-allowed' : 'pointer',
          }}
        >
          <ZoomOut size={12} />
        </button>
        <button
          title="Larger thumbnails"
          disabled={thumbHeight >= THUMB_MAX}
          onClick={() => {
            setThumbHeight(h => {
              const next = Math.min(THUMB_MAX, h + THUMB_STEP);
              if (next >= DENSITY_HEIGHTS.detailed) setThumbDensity('detailed');
              else if (next <= DENSITY_HEIGHTS.compact) setThumbDensity('compact');
              else setThumbDensity('comfortable');
              return next;
            });
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 4, border: '1px solid #e2e8f0',
            background: thumbHeight >= THUMB_MAX ? '#f8fafc' : '#fff',
            color: thumbHeight >= THUMB_MAX ? '#cbd5e1' : '#475569',
            cursor: thumbHeight >= THUMB_MAX ? 'not-allowed' : 'pointer',
          }}
        >
          <ZoomIn size={12} />
        </button>
      </div>
      <div className="flex flex-col p-3 flex-1 overflow-hidden">
      <ThumbnailActionStrip selectedPages={selectedPages} currentPage={viewState.currentPage} />

      {/* Filmstrip filter bar */}
      <div
        data-testid="thumbnail-filter-bar"
        className="flex items-center gap-1 mb-2 overflow-x-auto pb-1 scrollbar-none text-[11px]"
      >
        <button
          type="button"
          data-testid="filter-pill-all"
          onClick={() => setThumbnailFilter('all')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 ${
            thumbnailFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          All ({thumbs.length})
        </button>
        <button
          type="button"
          data-testid="filter-pill-annotations"
          onClick={() => setThumbnailFilter('annotations')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 ${
            thumbnailFilter === 'annotations'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Annotated ({annotatedPageCount})
        </button>
        <button
          type="button"
          data-testid="filter-pill-reviews"
          onClick={() => setThumbnailFilter('reviews')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 ${
            thumbnailFilter === 'reviews'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Reviewed ({reviewedPageCount})
        </button>
        <button
          type="button"
          data-testid="filter-pill-search"
          onClick={() => setThumbnailFilter('search')}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors shrink-0 ${
            thumbnailFilter === 'search'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Search ({searchPageCount})
        </button>
      </div>

      {/* Active filter status pill & reset */}
      {thumbnailFilter !== 'all' && (
        <div
          data-testid="filter-status-banner"
          className="flex items-center justify-between px-2.5 py-1 mb-2 text-xs rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0"
        >
          <span>
            Showing {filteredThumbs.length} of {thumbs.length} pages
          </span>
          <button
            type="button"
            data-testid="filter-reset-button"
            onClick={() => setThumbnailFilter('all')}
            className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100 ml-2"
          >
            Reset
          </button>
        </div>
      )}

      <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 shrink-0">
        Shift-click for range select. Ctrl/Cmd-click to toggle selection.
      </div>

      {loading && <div className="text-sm text-slate-500 shrink-0 mb-3">Generating thumbnails...</div>}

      <div
        ref={listContainerRef}
        onDragOver={handleListDragOver}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget as Node | null;
          if (!listContainerRef.current?.contains(relatedTarget)) {
            stopAutoScroll();
          }
        }}
        onDrop={() => stopAutoScroll()}
        className="flex-1 overflow-hidden"
      >
        {filteredThumbs.length === 0 ? (
          <div
            data-testid="no-filtered-pages-message"
            className="text-center py-8 text-xs text-slate-500 dark:text-slate-400"
          >
            No pages match the active filter.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setThumbnailFilter('all')}
                className="text-blue-600 dark:text-blue-400 underline font-medium"
              >
                Show all pages
              </button>
            </div>
          </div>
        ) : (
          <VList ref={vlistRef} data={filteredThumbs}>
          {(thumb) => {
            const active = thumb.pageNumber === viewState.currentPage;
            const selected = selectedPages.includes(thumb.pageNumber);
            const dragOver = dragOverPage === thumb.pageNumber;
            const annotationCount = annotationCountByPage[thumb.pageNumber] ?? 0;
            const unresolvedCount = unresolvedCountByPage[thumb.pageNumber] ?? 0;
            const rejectedCount = rejectedCountByPage[thumb.pageNumber] ?? 0;
            const reviewHeat = reviewHeatByPage[thumb.pageNumber] ?? null;
            const searchHitCount = searchHitCountByPage[thumb.pageNumber] ?? 0;
            const logicalLabel =
              pageGraph?.pages[thumb.pageNumber - 1]?.logicalLabel;
            const showLogicalLabel =
              logicalLabel !== undefined
              && logicalLabel !== String(thumb.pageNumber);

            const pageNode = pageGraph?.pages[thumb.pageNumber - 1];
            const rotation = pageNode?.rotation ?? 0;
            const dimensionsText = formatPageDimensions(
              pageNode?.width ?? thumb.pageWidth,
              pageNode?.height ?? thumb.pageHeight,
            );

            const aspectRatio = thumb.pageWidth && thumb.pageHeight ? thumb.pageWidth / thumb.pageHeight : 0.707;
            const calculatedWidth = thumbHeight * aspectRatio;
            const isTargetedByExternal = externalDragOver?.pageNumber === thumb.pageNumber;
            const isExternalBefore = isTargetedByExternal && externalDragOver?.position === 'before';
            const isExternalAfter = isTargetedByExternal && externalDragOver?.position === 'after';

            const isTargetedByInternal = internalDragOver?.pageNumber === thumb.pageNumber && dragPage !== null;
            const isInternalBefore = isTargetedByInternal && internalDragOver?.position === 'before';
            const isInternalAfter = isTargetedByInternal && internalDragOver?.position === 'after';

            const showIndicatorBefore = isExternalBefore || isInternalBefore;
            const showIndicatorAfter = isExternalAfter || isInternalAfter;

            return (
              <React.Fragment key={thumb.pageNumber}>
                {showIndicatorBefore && (
                  <div
                    data-testid="drop-indicator-line"
                    className="h-1.5 w-full bg-blue-600 dark:bg-blue-500 rounded-full my-1 shadow-sm transition-all"
                  />
                )}
                <div
                  id={`thumbnail-${thumb.pageNumber}`}
                  draggable
                  tabIndex={0}
                  role="button"
                  aria-label={
                    showLogicalLabel
                      ? `Page ${thumb.pageNumber}, logical label ${logicalLabel}`
                      : `Page ${thumb.pageNumber}`
                  }
                  aria-pressed={selected || active}
                  onFocus={() => {
                    vlistRef.current?.scrollToIndex(thumb.pageNumber - 1, { align: 'nearest' });
                  }}
                  onDragStart={(event) => {
                    if (thumbnailFilter !== 'all') {
                      event.preventDefault();
                      addToast({
                        type: 'info',
                        title: 'Reorder Disabled',
                        message: 'Clear page filter to reorder pages.',
                      });
                      return;
                    }
                    const movingPages =
                      selectedPages.includes(thumb.pageNumber) && selectedPages.length > 1
                        ? selectedPages
                        : [thumb.pageNumber];
                    setDragPage(thumb.pageNumber);
                    setDragPageGroup(movingPages);

                    if (movingPages.length > 1 && event.dataTransfer && typeof event.dataTransfer.setDragImage === 'function') {
                      const ghost = document.createElement('div');
                      ghost.setAttribute('data-testid', 'drag-ghost-chip');
                      ghost.className = 'fixed -top-[9999px] -left-[9999px] z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white font-medium text-xs shadow-xl ring-2 ring-white pointer-events-none';
                      ghost.innerHTML = `<span>Moving ${movingPages.length} pages</span>`;
                      document.body.appendChild(ghost);
                      event.dataTransfer.setDragImage(ghost, 20, 20);
                      requestAnimationFrame(() => {
                        if (document.body.contains(ghost)) {
                          document.body.removeChild(ghost);
                        }
                      });
                    }
                  }}
                  onDragEnter={(event) => {
                    const isFileDrag = event.dataTransfer.types.includes('Files') && dragPage === null;
                    if (isFileDrag) {
                      event.preventDefault();
                    } else {
                      setDragOverPage(thumb.pageNumber);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const isFileDrag = event.dataTransfer.types.includes('Files') && dragPage === null;
                    if (isFileDrag) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      const position = event.clientY < midY ? 'before' : 'after';
                      if (
                        !externalDragOver ||
                        externalDragOver.pageNumber !== thumb.pageNumber ||
                        externalDragOver.position !== position
                      ) {
                        setExternalDragOver({ pageNumber: thumb.pageNumber, position });
                      }
                    } else if (dragPage !== null) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      const position = event.clientY < midY ? 'before' : 'after';
                      setDragOverPage(thumb.pageNumber);
                      if (
                        !internalDragOver ||
                        internalDragOver.pageNumber !== thumb.pageNumber ||
                        internalDragOver.position !== position
                      ) {
                        setInternalDragOver({ pageNumber: thumb.pageNumber, position });
                      }
                    }
                  }}
                  onDragLeave={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(relatedTarget)) {
                      if (externalDragOver?.pageNumber === thumb.pageNumber) {
                        setExternalDragOver(null);
                      }
                      if (internalDragOver?.pageNumber === thumb.pageNumber) {
                        setInternalDragOver(null);
                      }
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const isFileDrag = event.dataTransfer.types.includes('Files') && dragPage === null;
                    if (isFileDrag) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      const position = typeof event.clientY === 'number'
                        ? (event.clientY < midY ? 'before' : 'after')
                        : (externalDragOver?.position ?? 'after');
                      setExternalDragOver(null);
                      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                        void handleExternalFileDrop(event.dataTransfer.files, thumb.pageNumber, position);
                      }
                      return;
                    }
                    void handleDrop(thumb.pageNumber);
                  }}
                  onDragEnd={() => {
                    stopAutoScroll();
                    setDragPage(null);
                    setDragPageGroup([]);
                    setDragOverPage(null);
                    setExternalDragOver(null);
                    setInternalDragOver(null);
                  }}
                  onClick={(event) => applySelection(event, thumb.pageNumber)}
                  onKeyDown={(event) => handleKeyDown(event, thumb.pageNumber)}
                  onContextMenu={(event) => handleContextMenu(event, thumb.pageNumber)}
                  className={`group relative rounded-lg p-2 mb-3 cursor-pointer transition-all focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800 ${
                    reviewHeat === 'rejected'
                      ? 'border-l-4 border-l-rose-500'
                      : reviewHeat === 'open'
                      ? 'border-l-4 border-l-amber-500'
                      : 'border-l-4 border-l-transparent'
                  } ${
                    dragOver
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : isTargetedByExternal
                      ? 'bg-blue-50/70 dark:bg-blue-900/10 ring-1 ring-blue-400'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                {reviewHeat && (
                  <div
                    data-testid="review-heat-strip"
                    className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${
                      reviewHeat === 'rejected' ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                    title={
                      reviewHeat === 'rejected'
                        ? 'Page contains rejected review'
                        : 'Page contains open review'
                    }
                  />
                )}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      Page {thumb.pageNumber}
                    </span>
                    {showLogicalLabel && (
                      <span
                        className="max-w-24 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400"
                        title={`Logical label: ${logicalLabel}`}
                      >
                        · {logicalLabel}
                      </span>
                    )}
                    {dimensionsText && (
                      <span
                        data-testid="page-dimension-badge"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono"
                      >
                        {dimensionsText}
                      </span>
                    )}
                    {rotation !== 0 && (
                      <span
                        data-testid="page-rotation-badge"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-mono font-medium"
                      >
                        {rotation}°
                      </span>
                    )}
                  </div>
                  {selected ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 shrink-0">
                      Selected
                    </span>
                  ) : active ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 shrink-0">
                      Current
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1 mb-2 text-[10px] pl-6">
                  {annotationCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Ann {annotationCount}
                    </span>
                  )}
                  {unresolvedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                      Open {unresolvedCount}
                    </span>
                  )}
                  {rejectedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300">
                      Rejected {rejectedCount}
                    </span>
                  )}
                  {searchHitCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                      Hits {searchHitCount}
                    </span>
                  )}
                </div>

                {/* Thumbnail image + annotation overlay */}
                <div
                  className={`relative bg-white dark:bg-slate-950 overflow-hidden mx-auto transition-all ${
                    selected
                      ? 'border-2 border-blue-600 dark:border-blue-500 ring-4 ring-blue-500/20 shadow-md rounded-md'
                      : active
                      ? 'border-2 border-slate-400 dark:border-slate-500 ring-4 ring-slate-400/20 shadow-sm rounded-md'
                      : 'border border-slate-200 dark:border-slate-800 shadow-sm rounded'
                  }`}
                  style={{ height: thumbHeight, width: calculatedWidth }}
                >
                  {pdfDoc && (
                    <ThumbnailImage
                      doc={pdfDoc}
                      documentKey={documentKey || 'default'}
                      pageNumber={thumb.pageNumber}
                      currentPage={viewState.currentPage}
                    />
                  )}
                  {/* Annotation shapes overlaid on thumbnail using page-space coordinates */}
                  {thumb.pageWidth > 0 && annotations.some(a => a.pageNumber === thumb.pageNumber) && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${thumb.pageWidth} ${thumb.pageHeight}`}
                      preserveAspectRatio="xMidYMin meet"
                    >
                      {annotations
                        .filter(a => a.pageNumber === thumb.pageNumber)
                        .map(a => (
                          <rect
                            key={a.id}
                            x={a.rect.x}
                            y={a.rect.y}
                            width={Math.max(a.rect.width, 6)}
                            height={Math.max(a.rect.height, 4)}
                            fill={annotationPreviewColor(a.type)}
                            rx={2}
                          />
                        ))
                      }
                    </svg>
                  )}
                </div>
              </div>
              {showIndicatorAfter && (
                <div
                  data-testid="drop-indicator-line"
                  className="h-1.5 w-full bg-blue-600 dark:bg-blue-500 rounded-full my-1 shadow-sm transition-all"
                />
              )}
            </React.Fragment>
          );
        }}
      </VList>
      )}

      <div
        data-testid="thumbnail-bottom-dropzone"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files') && dragPage === null) {
            event.preventDefault();
            if (externalDragOver?.pageNumber !== thumbs.length || externalDragOver?.position !== 'after') {
              setExternalDragOver({ pageNumber: thumbs.length, position: 'after' });
            }
          }
        }}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(relatedTarget)) {
            if (externalDragOver?.pageNumber === thumbs.length) {
              setExternalDragOver(null);
            }
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files') && dragPage === null) {
            setExternalDragOver(null);
            if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
              void handleExternalFileDrop(event.dataTransfer.files, thumbs.length, 'after');
            }
          }
        }}
        className={`mt-2 py-3 px-2 border-2 border-dashed rounded-lg text-center transition-all ${
          externalDragOver?.pageNumber === thumbs.length && externalDragOver?.position === 'after'
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-300'
        }`}
      >
        <p className="text-[11px] font-medium tracking-tight">
          Drop PDF here to append to document
        </p>
      </div>
    </div>

    {contextMenu && (
      <ThumbnailContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        page={contextMenu.page}
        selectedPages={selectedPages}
        onClose={() => setContextMenu(null)}
        onOpenMacros={() => {
          setContextMenu(null);
          setSidebarTab('macros');
        }}
        onOpenOcr={() => {
          setContextMenu(null);
          setSidebarTab('ocr');
        }}
      />
    )}

    {stagedInsert && (
      <InsertPdfDialog
        isOpen={true}
        donorFileName={stagedInsert.donor.fileName}
        donorPageCount={stagedInsert.donor.pageCount}
        currentPage={stagedInsert.targetPage}
        totalDocumentPages={thumbs.length}
        initialPlacement={stagedInsert.initialPlacement}
        onClose={handleCloseInsertDialog}
        onConfirm={(config) => {
          void executeInsertPdf(config);
        }}
      />
    )}
      </div>
    </div>
  );
};

export default ThumbnailSidebar;
