import { useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { RenderToken } from '../../adapters/pdf-renderer/types';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';

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
    if (!doc || !canvasRef.current) return;

    const controller = new AbortController();
    let page: PDFPageProxy | null = null;

    const render = async () => {
      if (tokenRef.current) {
        await tokenRef.current.cancel();
        tokenRef.current = null;
      }
      if (controller.signal.aborted) return;
      setIsRendering(true);

      try {
        page = await doc.getPage(pageNumber);
        if (controller.signal.aborted) return;
        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
        if (!canvasRef.current || controller.signal.aborted) return;

        tokenRef.current = PdfRendererAdapter.renderPage(
          page,
          canvasRef.current,
          viewport,
          { signal: controller.signal },
        );
        await tokenRef.current.completed;
      } catch (err) {
        if (isOperationCancelledError(err)) return;
        if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
      } finally {
        page?.cleanup();
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
