import { useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RenderToken } from '../../adapters/pdf-renderer/types';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';

interface UsePageRendererOptions {
  doc:         PDFDocumentProxy | null;
  pageNumber:  number;
  scale:       number;
  canvasRef:   React.RefObject<HTMLCanvasElement | null>;
}

interface PageSize {
  width:  number;
  height: number;
}

/**
 * Custom hook that owns the full render lifecycle for a single PDF page.
 *
 * Guarantees:
 * - Only one render in flight at a time per hook instance.
 * - Cancels in-flight render before starting a new one.
 * - Cancels on unmount.
 * - Uses useLayoutEffect to avoid a one-frame flash on scale change.
 *
 * This is the ONLY place in the codebase that calls PdfRendererAdapter.renderPage.
 */
export function usePageRenderer({
  doc, pageNumber, scale, canvasRef,
}: UsePageRendererOptions) {
  const tokenRef     = useRef<RenderToken | null>(null);
  const [size, setSize]           = useState<PageSize | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useLayoutEffect(() => {
    if (!doc || !canvasRef.current) return;

    let abandoned = false;

    const render = async () => {
      // Cancel any in-flight render before starting a new one
      if (tokenRef.current) {
        await tokenRef.current.cancel();
        tokenRef.current = null;
      }

      if (abandoned) return;

      setIsRendering(true);

      try {
        const page     = await doc.getPage(pageNumber);
        if (abandoned) return;

        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });

        if (!canvasRef.current || abandoned) return;

        tokenRef.current = PdfRendererAdapter.renderPage(
          page,
          canvasRef.current,
          viewport,
        );

        await tokenRef.current.completed;
      } catch (err) {
        // Suppress cancellation errors — they are expected during rapid scale changes
        if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
        // console.error('[usePageRenderer] Render error:', err);
      } finally {
        if (!abandoned) setIsRendering(false);
      }
    };

    render();

    return () => {
      abandoned = true;
      // Cancel in-flight render on cleanup (scale change or unmount)
      tokenRef.current?.cancel();
      tokenRef.current = null;
    };
  }, [doc, pageNumber, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return { size, isRendering };
}
