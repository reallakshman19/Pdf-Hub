import { useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RenderToken } from '../../adapters/pdf-renderer/types';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { isOperationCancelledError, raceWithAbort, throwIfAborted } from '@/core/cancellation/operationCancellation';
import {
  getRenderObjectId,
  pdfRenderScheduler,
  RENDER_PRIORITIES,
} from '@/core/renderer/renderScheduler';

interface UsePageRendererOptions {
  doc: PDFDocumentProxy | null;
  pageNumber: number;
  scale: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

interface PageSize {
  width: number;
  height: number;
}

export function usePageRenderer({
  doc, pageNumber, scale, canvasRef,
}: UsePageRendererOptions) {
  const tokenRef = useRef<RenderToken | null>(null);
  const [size, setSize] = useState<PageSize | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const controller = new AbortController();
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    const renderKey = [
      'page',
      getRenderObjectId(doc, 'document'),
      pageNumber,
      scale.toFixed(4),
      devicePixelRatio.toFixed(2),
      getRenderObjectId(canvas, 'canvas'),
    ].join(':');

    const render = async () => {
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

    void render();
    return () => {
      controller.abort('Page renderer changed or unmounted');
      void tokenRef.current?.cancel();
      tokenRef.current = null;
    };
  }, [doc, pageNumber, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return { size, isRendering };
}
