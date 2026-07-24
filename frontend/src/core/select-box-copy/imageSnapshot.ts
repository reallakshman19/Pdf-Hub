import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { normalizeViewportRect } from './selectionGeometry';
import type { SelectBoxViewportRect } from './types';

export async function renderSelectBoxImageSnapshot(input: {
  pdfBytes: Uint8Array;
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
}): Promise<string> {
  const lease = await PdfRendererAdapter.acquireDocument(input.pdfBytes);
  let page: Awaited<ReturnType<typeof lease.doc.getPage>> | null = null;

  try {
    page = await lease.doc.getPage(input.pageNumber);
    const viewport = page.getViewport({
      scale: input.viewport.scale,
      rotation: input.viewport.rotation,
    });

    const fullCanvas = document.createElement('canvas');
    const context = fullCanvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is not available for Select Box Copy.');
    }

    fullCanvas.width = Math.floor(viewport.width);
    fullCanvas.height = Math.floor(viewport.height);

    await page.render({
      canvas: fullCanvas,
      canvasContext: context,
      viewport,
    }).promise;

    const rect = normalizeViewportRect(input.viewportRect);
    const cropCanvas = document.createElement('canvas');
    const cropContext = cropCanvas.getContext('2d');

    if (!cropContext) {
      throw new Error('Canvas 2D context is not available for Select Box crop.');
    }

    cropCanvas.width = Math.max(1, Math.floor(rect.width));
    cropCanvas.height = Math.max(1, Math.floor(rect.height));

    cropContext.drawImage(
      fullCanvas,
      Math.floor(rect.x),
      Math.floor(rect.y),
      cropCanvas.width,
      cropCanvas.height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );

    return cropCanvas.toDataURL('image/png');
  } finally {
    page?.cleanup();
    await lease.release();
  }
}
