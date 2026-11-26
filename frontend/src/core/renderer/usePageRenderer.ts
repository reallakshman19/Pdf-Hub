import { useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RenderToken } from '../../adapters/pdf-renderer/types';
import type { OcrPdfViewport } from '../ocr/ocrViewportGeometry';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { isOperationCancelledError, raceWithAbort, throwIfAborted } from '@/core/cancellation/operationCancellation';
import {
  getRenderObjectId,
  pdfRenderScheduler,
  RENDER_PRIORITIES,
} from '@/core/renderer/renderScheduler';
import { CanvasDisposalManager } from '@/core/renderer/canvasDisposalManager';
import { useScrollVelocityStore } from '@/core/renderer/scrollVelocityStore';

interface UsePageRendererOptions {
  doc: PDFDocumentProxy | null;
  documentKey?: string | null;
  pageNumber: number;
  scale: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isRapidScrolling?: boolean;
}

interface PageSize {
  width: number;
  height: number;
}

export function usePageRenderer({
  doc, documentKey, pageNumber, scale, canvasRef, isRapidScrolling,
}: UsePageRendererOptions) {
  const tokenRef = useRef<RenderToken | null>(null);
  const rapidScrollingRef = useRef<boolean | undefined>(isRapidScrolling);
  useLayoutEffect(() => {
    rapidScrollingRef.current = isRapidScrolling;
  }, [isRapidScrolling]);

  const [size, setSize] = useState<PageSize | null>(null);
  const [ocrViewportState, setOcrViewportState] = useState<{
    doc: PDFDocumentProxy;
    pageNumber: number;
    scale: number;
    viewport: OcrPdfViewport;
  } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [paintedIdentity, setPaintedIdentity] = useState<{
    doc: PDFDocumentProxy;
    documentKey: string | null | undefined;
    pageNumber: number;
  } | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const controller = new AbortController();
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    const resolvedDocKey = documentKey ?? getRenderObjectId(doc, 'document');
    const canvasId = `${resolvedDocKey}:page:${pageNumber}`;

    // Register active page canvas for VRAM telemetry
    CanvasDisposalManager.registerCanvas(canvasId, 'page', canvas);

    const renderKey = [
      'page',
      resolvedDocKey,
      pageNumber,
      scale.toFixed(4),
      devicePixelRatio.toFixed(2),
      getRenderObjectId(canvas, 'canvas'),
    ].join(':');

    let renderStarted = false;
    const render = async () => {
      if (renderStarted || controller.signal.aborted) return;
      renderStarted = true;
      setIsRendering(true);

      try {
        await pdfRenderScheduler.schedule({
          key: renderKey,
          priority: RENDER_PRIORITIES.currentPage,
          signal: controller.signal,
          run: async (signal) => {
            const page = await raceWithAbort(
              doc.getPage(pageNumber),
              signal,
              `load PDF page ${pageNumber} for rendering`,
            );

            try {
              throwIfAborted(signal, `prepare PDF page ${pageNumber} for rendering`);
              const viewport = page.getViewport({ scale });
              if (!signal.aborted) {
                setSize({ width: viewport.width, height: viewport.height });
                setOcrViewportState({ doc, pageNumber, scale, viewport });
              }
              throwIfAborted(signal, `render PDF page ${pageNumber}`);

              const token = PdfRendererAdapter.renderPage(
                page,
                canvas,
                viewport,
                { signal },
              );
              tokenRef.current = token;
              try {
                await token.completed;
                if (!signal.aborted) {
                  CanvasDisposalManager.updateCanvas(canvasId);
                  setPaintedIdentity({ doc, documentKey, pageNumber });
                }
              } finally {
                if (tokenRef.current === token) tokenRef.current = null;
              }
            } finally {
              page.cleanup();
            }
          },
        });
      } catch (err) {
        if (isOperationCancelledError(err)) return;
        if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
      } finally {
        if (!controller.signal.aborted) setIsRendering(false);
      }
    };

    const initialRapid =
      rapidScrollingRef.current ?? useScrollVelocityStore.getState().isRapidScrolling;

    let timeoutId: number | null = null;
    let unsubscribeVelocity: (() => void) | null = null;

    if (initialRapid) {
      // Wait for rapid scroll to settle, or kick off immediately when velocity store settles
      timeoutId = window.setTimeout(() => {
        unsubscribeVelocity?.();
        unsubscribeVelocity = null;
        void render();
      }, 180);

      unsubscribeVelocity = useScrollVelocityStore.subscribe((state) => {
        if (!state.isRapidScrolling && !renderStarted && !controller.signal.aborted) {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          unsubscribeVelocity?.();
          unsubscribeVelocity = null;
          void render();
        }
      });
    } else {
      void render();
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      unsubscribeVelocity?.();
      controller.abort('Page renderer changed or unmounted');
      void tokenRef.current?.cancel();
      tokenRef.current = null;
      CanvasDisposalManager.unregisterCanvas(canvasId);
    };
  }, [doc, documentKey, pageNumber, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // A view from a previous page/document/zoom must never own a new OCR area.
  const ocrViewport =
    ocrViewportState?.doc === doc
    && ocrViewportState.pageNumber === pageNumber
    && ocrViewportState.scale === scale
      ? ocrViewportState.viewport
      : null;

  const hasPaintedCurrentPage =
    paintedIdentity?.doc === doc
    && paintedIdentity.documentKey === documentKey
    && paintedIdentity.pageNumber === pageNumber;

  const isPlaceholderActive = !hasPaintedCurrentPage;

  return { size, isRendering, isPlaceholderActive, ocrViewport };
}
