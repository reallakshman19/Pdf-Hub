import React from 'react';
import { Layers, GripVertical, ZoomIn, ZoomOut } from 'lucide-react';
import { VList, type VListHandle } from 'virtua';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSearchStore } from '@/core/search/store';
import { dispatchCommand } from '@/core/commands/dispatch';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { ThumbnailActionStrip } from '@/components/sidebar/thumbnails/ThumbnailActionStrip';
import { ThumbnailContextMenu } from '@/components/sidebar/thumbnails/ThumbnailContextMenu';

interface ThumbItem {
  pageNumber: number;
  imageUrl: string;
  pageWidth: number;   // PDF page width in CSS-pixel units at scale=1
  pageHeight: number;  // PDF page height in CSS-pixel units at scale=1
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

// Global cache for thumbnail image URLs to prevent flickering and regeneration on active editing passes
const thumbnailCache = new Map<string, string>(); // key: `${documentKey}-${pageNumber}`

const ThumbnailSidebar: React.FC = () => {
  const {
    workingBytes,
    documentKey,
    viewState,
    setPage,
    selectedPages,
    setSelectedPages,
    toggleSelectedPage,
  } = useSessionStore();
  const { pdfDoc } = usePdfStore();
  const { setSidebarTab } = useEditorStore();
  const { annotations } = useAnnotationStore();
  const { hits } = useSearchStore();

  const [thumbs, setThumbs] = React.useState<ThumbItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const vlistRef = React.useRef<VListHandle>(null);
  // thumbHeight controls the pixel height of the thumbnail image area (sm/md/lg)
  const [thumbHeight, setThumbHeight] = React.useState(130);
  const THUMB_MIN = 60;
  const THUMB_MAX = 260;
  const THUMB_STEP = 35;
  const [dragPage, setDragPage] = React.useState<number | null>(null);
  const [dragPageGroup, setDragPageGroup] = React.useState<number[]>([]);
  const [dragOverPage, setDragOverPage] = React.useState<number | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    page: number;
  } | null>(null);
  const lastSelectedPageRef = React.useRef<number | null>(null);

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
      const status = annotation.data.review?.status;
      if (status === 'resolved') return;
      counts[annotation.pageNumber] = (counts[annotation.pageNumber] ?? 0) + 1;
    });
    return counts;
  }, [annotations]);

  const searchHitCountByPage = React.useMemo(() => {
    const counts: Record<number, number> = {};
    hits.forEach((hit) => {
      counts[hit.pageNumber] = (counts[hit.pageNumber] ?? 0) + 1;
    });
    return counts;
  }, [hits]);

  React.useEffect(() => {
    if (thumbs.length > 0) {
      vlistRef.current?.scrollToIndex(viewState.currentPage - 1, { align: 'nearest' });
    }
  }, [viewState.currentPage, thumbs.length]);

  React.useEffect(() => {
    // Synchronize selectedPages with viewState.currentPage when scrolling or clicking inside the main viewer
    if (viewState.currentPage && !selectedPages.includes(viewState.currentPage)) {
      setSelectedPages([viewState.currentPage]);
    }
  }, [viewState.currentPage, selectedPages, setSelectedPages]);

  React.useEffect(() => {
    let cancelled = false;

    const loadThumbnails = async () => {
      if (!workingBytes || !pdfDoc) {
        setThumbs([]);
        return;
      }
      setLoading(true);
      try {
        const result: ThumbItem[] = [];
        const batchSize = 5;

        for (let i = 1; i <= pdfDoc.numPages; i += batchSize) {
          if (cancelled) break;

          const batch = [];
          for (let j = 0; j < batchSize && i + j <= pdfDoc.numPages; j++) {
            batch.push(i + j);
          }

          const batchResults = await Promise.all(
            batch.map(async (pageNumber) => {
              const cacheKey = `${documentKey || 'default'}-${pageNumber}`;
              let imageUrl = thumbnailCache.get(cacheKey);

              const page = await pdfDoc.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1.0 });

              if (!imageUrl) {
                imageUrl = await PdfRendererAdapter.getThumbnail(page);
                thumbnailCache.set(cacheKey, imageUrl);
              }

              page.cleanup();
              return {
                pageNumber,
                imageUrl,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
              };
            })
          );

          result.push(...batchResults);
        }
        if (!cancelled) setThumbs(result);
      } catch {
        if (!cancelled) setThumbs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [workingBytes, pdfDoc, documentKey]);

  const applySelection = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    const isToggle = event.metaKey || event.ctrlKey;
    const isRange = event.shiftKey;

    if (isRange) {
      const anchor = lastSelectedPageRef.current ?? viewState.currentPage;
      const range = rangeInclusive(anchor, pageNumber);
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

    const movingPages = dragPageGroup.length > 0 ? dragPageGroup : [dragPage];
    if (movingPages.includes(targetPage)) {
      setDragPage(null);
      setDragPageGroup([]);
      setDragOverPage(null);
      return;
    }

    const movingIndices = movingPages.map((page) => page - 1).sort((left, right) => left - right);
    const order = buildReorderOrder(pageCount, movingIndices, targetPage - 1);

    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: {
        type: 'REORDER_PAGES_BY_ORDER',
        order,
      },
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
      if (pageNumber < pageCount) {
        const nextThumb = document.getElementById(`thumbnail-${pageNumber + 1}`);
        nextThumb?.focus();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (pageNumber > 1) {
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
        {/* Thumbnail size controls */}
        <button
          title="Smaller thumbnails"
          disabled={thumbHeight <= THUMB_MIN}
          onClick={() => setThumbHeight(h => Math.max(THUMB_MIN, h - THUMB_STEP))}
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
          onClick={() => setThumbHeight(h => Math.min(THUMB_MAX, h + THUMB_STEP))}
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

      <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 shrink-0">
        Shift-click for range select. Ctrl/Cmd-click to toggle selection.
      </div>

      {loading && <div className="text-sm text-slate-500 shrink-0 mb-3">Generating thumbnails...</div>}

      <div className="flex-1 overflow-hidden">
        <VList ref={vlistRef} data={thumbs}>
          {(thumb) => {
            const active = thumb.pageNumber === viewState.currentPage;
            const selected = selectedPages.includes(thumb.pageNumber);
            const dragOver = dragOverPage === thumb.pageNumber;
            const annotationCount = annotationCountByPage[thumb.pageNumber] ?? 0;
            const unresolvedCount = unresolvedCountByPage[thumb.pageNumber] ?? 0;
            const searchHitCount = searchHitCountByPage[thumb.pageNumber] ?? 0;

            const aspectRatio = thumb.pageWidth && thumb.pageHeight ? thumb.pageWidth / thumb.pageHeight : 0.707;
            const calculatedWidth = thumbHeight * aspectRatio;

            return (
              <div
                key={thumb.pageNumber}
                id={`thumbnail-${thumb.pageNumber}`}
                draggable
                tabIndex={0}
                role="button"
                aria-label={`Page ${thumb.pageNumber}`}
                aria-pressed={selected || active}
                onFocus={() => {
                  vlistRef.current?.scrollToIndex(thumb.pageNumber - 1, { align: 'nearest' });
                }}
                onDragStart={() => {
                  const movingPages =
                    selectedPages.includes(thumb.pageNumber) && selectedPages.length > 1
                      ? selectedPages
                      : [thumb.pageNumber];
                  setDragPage(thumb.pageNumber);
                  setDragPageGroup(movingPages);
                }}
                onDragEnter={() => setDragOverPage(thumb.pageNumber)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(thumb.pageNumber)}
                onDragEnd={() => {
                  setDragPage(null);
                  setDragPageGroup([]);
                  setDragOverPage(null);
                }}
                onClick={(event) => applySelection(event, thumb.pageNumber)}
                onKeyDown={(event) => handleKeyDown(event, thumb.pageNumber)}
                onContextMenu={(event) => handleContextMenu(event, thumb.pageNumber)}
                className={`group rounded-lg p-2 mb-3 cursor-pointer transition-all focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800 ${
                  dragOver ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      Page {thumb.pageNumber}
                    </span>
                  </div>
                  {selected ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                      Selected
                    </span>
                  ) : active ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
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
                  <img
                    src={thumb.imageUrl}
                    alt={`Thumbnail for page ${thumb.pageNumber}`}
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center' }}
                    loading="lazy"
                  />
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
            );
          }}
        </VList>
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
        />
      )}
      </div>
    </div>
  );
};

export default ThumbnailSidebar;
