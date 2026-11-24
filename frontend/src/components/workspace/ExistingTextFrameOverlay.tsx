import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Move, Edit3, X, Loader2 } from 'lucide-react';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { buildExistingTextPageInspection } from '@/core/existing-text/model';
import { findParagraphForSpan } from '@/core/existing-text/paragraphClusterer';
import type { ExistingTextSpan } from '@/core/existing-text/types';
import type { ExistingTextParagraphBlock } from '@/core/existing-text/paragraphTypes';
import {
  calculateFrameResizeReflow,
  createFrameFromParagraph,
  createFrameFromSpans,
  type ExistingTextFrame,
  type FrameReflowResult,
} from '@/core/existing-text/frameGeometry';
import type { ResizeHandle } from '@/core/existing-text/frameManipulationTypes';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useToastStore } from '@/core/toast/store';

export interface ExistingTextFrameOverlayProps {
  pageNumber: number;
  pageId: string;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  workingBytes: Uint8Array | null;
  documentKey: string | null;
  selectedSourceIndex: number | null;
  textItem: {
    id: string;
    sourceIndex?: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
  } | null;
  onDeselect: () => void;
  onOpenEditor?: () => void;
}

type DragMode = 'none' | 'move' | 'resize-e' | 'resize-w' | 'resize-se' | 'resize-s';

export const ExistingTextFrameOverlay: React.FC<ExistingTextFrameOverlayProps> = ({
  pageNumber,
  pageId,
  scale,
  viewportHeight,
  workingBytes,
  documentKey,
  selectedSourceIndex,
  textItem,
  onDeselect,
  onOpenEditor,
}) => {
  const addToast = useToastStore((s) => s.addToast);

  // Span resolution result, keyed by the inputs it was resolved for so stale
  // results never leak into a different page/document/selection.
  const [resolved, setResolved] = useState<{
    key: string;
    span: ExistingTextSpan | null;
    paragraph: ExistingTextParagraphBlock | null;
  } | null>(null);
  const resolveKey = workingBytes && documentKey && selectedSourceIndex !== null
    ? `${documentKey}|${pageNumber}|${pageId}|${selectedSourceIndex}`
    : null;
  const current = resolved && resolved.key === resolveKey ? resolved : null;
  const span = current?.span ?? null;
  const paragraph = current?.paragraph ?? null;
  const loading = resolveKey !== null && current === null;
  const [committing, setCommitting] = useState<boolean>(false);

  // Drag interaction state
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragSizeDelta, setDragSizeDelta] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const dragStartRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });

  // 1. Resolve domain ExistingTextSpan from page items
  useEffect(() => {
    if (!workingBytes || !documentKey || selectedSourceIndex === null || resolveKey === null) {
      return;
    }

    let active = true;
    const resolveSpan = async () => {
      let matchedSpan: ExistingTextSpan | null = null;
      let matchedParagraph: ExistingTextParagraphBlock | null = null;
      try {
        const lease = await PdfRendererAdapter.acquireDocument(workingBytes);
        try {
          const page = await lease.doc.getPage(pageNumber);
          try {
            const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
            if (!active) return;
            const pageInspection = buildExistingTextPageInspection(
              {
                revisionId: documentKey,
                pageId,
                pageIndex: pageNumber - 1,
              },
              items,
            );
            const matched = pageInspection.spans.find((s) => s.sourceIndex === selectedSourceIndex);
            if (matched) {
              matchedSpan = matched;
              matchedParagraph = findParagraphForSpan(matched, pageInspection.spans);
            }
          } finally {
            page.cleanup();
          }
        } finally {
          await lease.release();
        }
      } catch {
        // Resolution failed: the frame falls back to the viewport textItem bounds.
      }
      if (active) {
        setResolved({ key: resolveKey, span: matchedSpan, paragraph: matchedParagraph });
      }
    };

    void resolveSpan();
    return () => {
      active = false;
    };
  }, [workingBytes, documentKey, pageNumber, pageId, selectedSourceIndex, resolveKey]);

  // 2. Build or fallback to ExistingTextFrame
  const currentFrame = useMemo<ExistingTextFrame | null>(() => {
    if (!documentKey) return null;

    if (paragraph) {
      return createFrameFromParagraph(paragraph, documentKey);
    }
    if (span) {
      const f = createFrameFromSpans([span], pageNumber - 1, pageId, documentKey);
      if (f) return f;
    }

    if (!textItem) return null;

    // Fallback frame synthesized from viewport textItem
    const xPt = Math.round(textItem.x / scale);
    const widthPt = Math.max(36, Math.round(textItem.width / scale));
    const heightPt = Math.max(textItem.fontSize, Math.round(textItem.height / scale));
    const yPt = Math.max(0, Math.round((viewportHeight - textItem.y - textItem.height) / scale));

    return {
      frameId: `frame-fallback-${textItem.id}`,
      revisionId: documentKey,
      pageIndex: pageNumber - 1,
      pageId,
      bounds: { x: xPt, y: yPt, width: widthPt, height: heightPt },
      originalBounds: { x: xPt, y: yPt, width: widthPt, height: heightPt },
      text: textItem.text,
      originalText: textItem.text,
      spanIds: [],
      fontSizePt: Math.round(textItem.fontSize / scale) || 12,
      leadingPt: Math.round((textItem.fontSize / scale) * 1.3) || 16,
    };
  }, [documentKey, paragraph, span, pageNumber, pageId, textItem, scale, viewportHeight]);

  // Calculate live reflow if resizing
  const liveReflow = useMemo<FrameReflowResult | null>(() => {
    if (!currentFrame || (dragMode !== 'resize-e' && dragMode !== 'resize-w')) {
      return null;
    }
    const currentWidthPt = currentFrame.bounds.width;
    const newWidthPt = Math.max(36, Math.round(currentWidthPt + dragSizeDelta.width / scale));
    return calculateFrameResizeReflow(currentFrame, newWidthPt);
  }, [currentFrame, dragMode, dragSizeDelta.width, scale]);

  // Pointer drag gestures
  useEffect(() => {
    if (dragMode === 'none') return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - dragStartRef.current.clientX;
      const deltaY = e.clientY - dragStartRef.current.clientY;

      if (dragMode === 'move') {
        setDragOffset({ x: deltaX, y: deltaY });
      } else if (dragMode === 'resize-e') {
        setDragSizeDelta({ width: deltaX, height: 0 });
      } else if (dragMode === 'resize-w') {
        setDragSizeDelta({ width: -deltaX, height: 0 });
        setDragOffset({ x: deltaX, y: 0 });
      } else if (dragMode === 'resize-se') {
        setDragSizeDelta({ width: deltaX, height: deltaY });
      } else if (dragMode === 'resize-s') {
        setDragSizeDelta({ width: 0, height: deltaY });
      }
    };

    const handlePointerUp = async () => {
      const currentMode = dragMode;
      const finalOffset = { ...dragOffset };
      const finalDelta = { ...dragSizeDelta };

      setDragMode('none');
      setDragOffset({ x: 0, y: 0 });
      setDragSizeDelta({ width: 0, height: 0 });

      if (!currentFrame || !workingBytes || !documentKey) return;

      if (currentMode === 'move') {
        const deltaXPt = Math.round(finalOffset.x / scale);
        // Invert deltaY for bottom-origin PDF coordinates
        const deltaYPt = Math.round(-finalOffset.y / scale);

        if (Math.hypot(deltaXPt, deltaYPt) < 2) return;

        const targetXPt = currentFrame.bounds.x + deltaXPt;
        const targetYPt = currentFrame.bounds.y + deltaYPt;

        setCommitting(true);
        try {
          const result = await commandBus.execute({
            workingBytes,
            command: materializePdfCommand(
              {
                type: 'MOVE_EXISTING_TEXT_BLOCK',
                payload: {
                  schemaVersion: 1,
                  sourcePageIndex: pageNumber - 1,
                  sourcePageId: pageId,
                  intent: {
                    schemaVersion: 1,
                    sourceRevisionId: documentKey,
                    pageIndex: pageNumber - 1,
                    pageId,
                    frame: currentFrame,
                    targetPosition: { x: targetXPt, y: targetYPt },
                  },
                },
              },
              'toolbar',
              documentKey,
            ),
          });

          if (!result.success) {
            addToast({
              type: 'error',
              title: 'Move text frame failed',
              message: result.error?.message ?? result.message,
            });
            return;
          }

          addToast({
            type: 'success',
            title: 'Text frame moved',
            message: `Repositioned frame to (${targetXPt}, ${targetYPt}) pt`,
          });
        } catch (err) {
          addToast({
            type: 'error',
            title: 'Move failed',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setCommitting(false);
        }
      } else if (currentMode === 'resize-e' || currentMode === 'resize-w') {
        const deltaWidthPt = Math.round(finalDelta.width / scale);
        if (Math.abs(deltaWidthPt) < 2) return;

        const newWidthPt = Math.max(36, currentFrame.bounds.width + deltaWidthPt);
        const resizeHandle: ResizeHandle = currentMode === 'resize-w' ? 'w' : 'e';

        setCommitting(true);
        try {
          const result = await commandBus.execute({
            workingBytes,
            command: materializePdfCommand(
              {
                type: 'RESIZE_EXISTING_TEXT_BLOCK',
                payload: {
                  schemaVersion: 1,
                  sourcePageIndex: pageNumber - 1,
                  sourcePageId: pageId,
                  intent: {
                    schemaVersion: 1,
                    sourceRevisionId: documentKey,
                    pageIndex: pageNumber - 1,
                    pageId,
                    frame: currentFrame,
                    newWidthPt,
                    handle: resizeHandle,
                  },
                },
              },
              'toolbar',
              documentKey,
            ),
          });

          if (!result.success) {
            addToast({
              type: 'error',
              title: 'Resize text frame failed',
              message: result.error?.message ?? result.message,
            });
            return;
          }

          addToast({
            type: 'success',
            title: 'Text frame resized',
            message: `Reflowed frame to width ${newWidthPt} pt`,
          });
        } catch (err) {
          addToast({
            type: 'error',
            title: 'Resize failed',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setCommitting(false);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragMode, dragOffset, dragSizeDelta, currentFrame, workingBytes, documentKey, scale, pageNumber, pageId, addToast]);

  // Keyboard shortcut: Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDeselect();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeselect]);

  if (!currentFrame && !textItem) return null;

  // Compute DOM rectangle
  let domX = textItem ? textItem.x : currentFrame!.bounds.x * scale;
  let domY = textItem
    ? textItem.y
    : viewportHeight - (currentFrame!.bounds.y + currentFrame!.bounds.height) * scale;
  let domW = textItem ? textItem.width : currentFrame!.bounds.width * scale;
  let domH = textItem ? textItem.height : currentFrame!.bounds.height * scale;

  // Apply live drag preview adjustments
  if (dragMode === 'move') {
    domX += dragOffset.x;
    domY += dragOffset.y;
  } else if (dragMode === 'resize-e') {
    domW = Math.max(36 * scale, domW + dragSizeDelta.width);
    if (liveReflow && Number.isFinite(liveReflow.newHeightPt)) {
      domH = liveReflow.newHeightPt * scale;
    }
  } else if (dragMode === 'resize-w') {
    domX += dragOffset.x;
    domW = Math.max(36 * scale, domW + dragSizeDelta.width);
    if (liveReflow && Number.isFinite(liveReflow.newHeightPt)) {
      domH = liveReflow.newHeightPt * scale;
    }
  }

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
    setDragOffset({ x: 0, y: 0 });
    setDragSizeDelta({ width: 0, height: 0 });
    setDragMode(mode);
  };

  return (
    <div
      data-testid="existing-text-frame-overlay"
      className="absolute z-20 pointer-events-auto select-none"
      style={{
        left: domX,
        top: domY,
        width: domW,
        height: domH,
      }}
    >
      {/* Outer bounding box border */}
      <div
        data-testid="frame-drag-body"
        onPointerDown={(e) => startDrag('move', e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenEditor?.();
        }}
        className={`w-full h-full border-2 border-dashed border-blue-500 bg-blue-500/10 cursor-move transition-colors duration-75 relative rounded-sm ${
          dragMode === 'move' ? 'border-blue-600 bg-blue-500/20 shadow-lg' : 'hover:border-blue-600'
        }`}
      >
        {/* Frame Action Bar / Floating Tag */}
        <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-medium shadow-md pointer-events-auto">
          <Move className="w-3 h-3 cursor-move" />
          <span>Text Frame</span>
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          {committing && <Loader2 className="w-3 h-3 animate-spin" />}
          {onOpenEditor && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditor();
              }}
              title="Edit text content"
              className="ml-1 hover:text-blue-200"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect();
            }}
            title="Deselect frame"
            className="hover:text-red-300"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Live Coordinate Tooltip during Move */}
        {dragMode === 'move' && currentFrame && (
          <div
            data-testid="frame-ghost-preview"
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/90 text-white text-[10px] font-mono shadow whitespace-nowrap"
          >
            X: {Math.round(currentFrame.bounds.x + dragOffset.x / scale)}pt, Y:{' '}
            {Math.round(currentFrame.bounds.y - dragOffset.y / scale)}pt
          </div>
        )}

        {/* Live Reflow Preview during Horizontal Resize */}
        {(dragMode === 'resize-e' || dragMode === 'resize-w') && liveReflow && (
          <div
            data-testid="frame-reflow-preview"
            className="absolute inset-0 p-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-[1px] border border-blue-400 overflow-hidden text-left"
            style={{
              fontSize: `${(currentFrame?.fontSizePt ?? 12) * scale}px`,
              lineHeight: `${(currentFrame?.leadingPt ?? 16) * scale}px`,
            }}
          >
            {liveReflow.lines.map((line: string, idx: number) => (
              <div key={idx} className="text-blue-900 dark:text-blue-100 whitespace-nowrap truncate font-sans opacity-85">
                {line}
              </div>
            ))}
            <div className="absolute -bottom-6 left-0 text-[10px] font-mono text-blue-700 bg-white/95 px-1 py-0.5 rounded shadow">
              {Math.round(currentFrame!.bounds.width + dragSizeDelta.width / scale)}pt ({liveReflow.lines.length} lines)
            </div>
          </div>
        )}

        {/* 8 Transformation Handles */}
        {/* NW */}
        <div
          data-testid="frame-handle-nw"
          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-nwse-resize"
        />
        {/* N */}
        <div
          data-testid="frame-handle-n"
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-ns-resize"
        />
        {/* NE */}
        <div
          data-testid="frame-handle-ne"
          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-nesw-resize"
        />
        {/* E (Active Live Reflow Handle) */}
        <div
          data-testid="frame-handle-e"
          onPointerDown={(e) => startDrag('resize-e', e)}
          className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-ew-resize hover:scale-125 transition-transform"
        />
        {/* SE */}
        <div
          data-testid="frame-handle-se"
          onPointerDown={(e) => startDrag('resize-se', e)}
          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-nwse-resize"
        />
        {/* S */}
        <div
          data-testid="frame-handle-s"
          onPointerDown={(e) => startDrag('resize-s', e)}
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-ns-resize"
        />
        {/* SW */}
        <div
          data-testid="frame-handle-sw"
          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-nesw-resize"
        />
        {/* W (Active Live Reflow Handle) */}
        <div
          data-testid="frame-handle-w"
          onPointerDown={(e) => startDrag('resize-w', e)}
          className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-sm cursor-ew-resize hover:scale-125 transition-transform"
        />
      </div>

      {/* Smart Alignment Guidelines when dragging */}
      {dragMode === 'move' && (
        <div data-testid="frame-guidelines" className="pointer-events-none">
          {/* Vertical guideline at frame center */}
          <div
            className="fixed top-0 bottom-0 border-l border-dashed border-red-500/60 pointer-events-none"
            style={{ left: domX + domW / 2 }}
          />
          {/* Horizontal guideline at frame center */}
          <div
            className="fixed left-0 right-0 border-t border-dashed border-red-500/60 pointer-events-none"
            style={{ top: domY + domH / 2 }}
          />
        </div>
      )}
    </div>
  );
};
