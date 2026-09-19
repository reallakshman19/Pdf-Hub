import {
  PdfRendererAdapter,
  type PdfDocumentLease,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { normalizeViewportRect } from './selectionGeometry';
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

    const fullCanvas = document.createElement('canvas');
    const context = fullCanvas.getContext('2d');

    if (!context) {
      throw new Error(
        'Canvas 2D context is not available for Select Box Copy.',
      );
    }

    fullCanvas.width = Math.floor(viewport.width);
    fullCanvas.height = Math.floor(viewport.height);

    const renderTask = page.render({
      canvas: fullCanvas,
      canvasContext: context,
      viewport,
    });
    await raceWithAbort(
      renderTask.promise,
      input.signal,
      `render PDF page ${input.pageNumber} for Select Box image`,
      () => renderTask.cancel(),
    );

    const rect = normalizeViewportRect(
      input.viewportRect,
    );
    const cropCanvas = document.createElement('canvas');
    const cropContext = cropCanvas.getContext('2d');

    if (!cropContext) {
      throw new Error(
        'Canvas 2D context is not available for Select Box crop.',
      );
    }

    cropCanvas.width = Math.max(
      1,
      Math.floor(rect.width),
    );
    cropCanvas.height = Math.max(
      1,
      Math.floor(rect.height),
    );

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
