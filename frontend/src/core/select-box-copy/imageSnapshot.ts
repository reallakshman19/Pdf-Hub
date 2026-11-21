import {
  PdfRendererAdapter,
  type PdfDocumentLease,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { clipViewportRect } from './selectionGeometry';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import type { SelectBoxViewportRect } from './types';

interface SelectBoxImageGeometryInput {
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
  signal?: AbortSignal;
}

export interface RenderSelectBoxImageSnapshotInput
  extends SelectBoxImageGeometryInput {
  pdfBytes: Uint8Array;
}

export interface RenderSelectBoxImageSnapshotFromDocumentInput
  extends SelectBoxImageGeometryInput {
  doc: PdfDocumentLease['doc'];
}

/**
 * Active-session path: caller owns the PdfDocumentLease while this helper owns
 * the page/render task and temporary canvases.
 */
export async function renderSelectBoxImageSnapshotFromDocument(
  input: RenderSelectBoxImageSnapshotFromDocumentInput,
): Promise<string> {
  const pagePromise = input.doc.getPage(
    input.pageNumber,
  );
  const page = await raceWithAbort(
    pagePromise,
    input.signal,
    `load PDF page ${input.pageNumber} for Select Box image`,
    () => {
      void pagePromise
        .then((latePage) => latePage.cleanup())
        .catch(() => undefined);
    },
  );

  try {
    const viewport = page.getViewport({
      scale: input.viewport.scale,
      rotation: input.viewport.rotation,
    });

    const rect = clipViewportRect(input.viewportRect, viewport.width, viewport.height);
    if (!rect.width || !rect.height) throw new Error('Selection is outside the PDF page.');
    const left = Math.floor(rect.x), top = Math.floor(rect.y);
    const width = Math.ceil(rect.x + rect.width) - left;
    const height = Math.ceil(rect.y + rect.height) - top;
    // Render only the selected crop. Reject excessive allocations before canvas creation.
    if (width > 8192 || height > 8192 || width * height > 16_000_000) throw new Error('Selected image is too large; reduce zoom or selection size.');
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const context = cropCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is not available for Select Box Copy.');
    const renderTask = page.render({ canvas: cropCanvas, canvasContext: context, viewport, transform: [1, 0, 0, 1, -left, -top] });
    await raceWithAbort(renderTask.promise, input.signal, `render PDF page ${input.pageNumber} for Select Box image`, () => renderTask.cancel());
    throwIfAborted(input.signal, 'encode selected PDF image');
    const dataUrl = cropCanvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('Failed to encode selected PDF image.');
    return dataUrl;
  } finally {
    page.cleanup();
  }
}

/**
 * Standalone explicit-buffer compatibility wrapper.
 */
export async function renderSelectBoxImageSnapshot(
  input: RenderSelectBoxImageSnapshotInput,
): Promise<string> {
  const leasePromise =
    PdfRendererAdapter.acquireDocument(input.pdfBytes);
  const lease = await raceWithAbort(
    leasePromise,
    input.signal,
    'load byte-backed PDF for Select Box image',
    () => {
      void leasePromise
        .then((lateLease) => lateLease.release())
        .catch(() => undefined);
    },
  );

  try {
    return await renderSelectBoxImageSnapshotFromDocument({
      doc: lease.doc,
      pageNumber: input.pageNumber,
      viewport: input.viewport,
      viewportRect: input.viewportRect,
      signal: input.signal,
    });
  } finally {
    await lease.release();
  }
}
