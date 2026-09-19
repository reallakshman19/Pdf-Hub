import {
  PdfRendererAdapter,
  type PdfDocumentLease,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';
import {
  viewportRectToPdfRect,
} from '@/core/writer-v2/coordinateTransform';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import type { TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type {
  SelectBoxCopyResult,
  SelectBoxTextItem,
  SelectBoxViewportRect,
} from './types';
import { buildSelectBoxCopyResult } from './formatSelection';
import {
  normalizeViewportRect,
  rectIntersects,
  itemToRect,
} from './selectionGeometry';
import { groupTextItemsIntoRows } from './textGrouping';

interface SelectBoxCopyGeometryInput {
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
  signal?: AbortSignal;
}

export interface ExtractSelectBoxCopyInput
  extends SelectBoxCopyGeometryInput {
  pdfBytes: Uint8Array;
}

export interface ExtractSelectBoxCopyFromDocumentInput
  extends SelectBoxCopyGeometryInput {
  doc: PdfDocumentLease['doc'];
}

/**
 * Active-session path: caller owns the PdfDocumentLease while this helper owns
 * only the transient page proxy.
 */
export async function extractSelectBoxCopyFromDocument(
  input: ExtractSelectBoxCopyFromDocumentInput,
): Promise<SelectBoxCopyResult> {
  const normalized = normalizeViewportRect(
    input.viewportRect,
  );
  const pagePromise = input.doc.getPage(
    input.pageNumber,
  );
  const page = await raceWithAbort(
    pagePromise,
    input.signal,
    `load PDF page ${input.pageNumber} for Select Box Copy`,
    () => {
      void pagePromise
        .then((latePage) => latePage.cleanup())
        .catch(() => undefined);
    },
  );

  try {
    const textItems =
      await PdfRendererAdapter.getPageTextItems(
        page,
        input.viewport.scale,
        input.signal,
      );

    return buildSelectBoxCopyFromTextItems({
      pageNumber: input.pageNumber,
      viewport: input.viewport,
      viewportRect: normalized,
      textItems,
    });
  } finally {
    page.cleanup();
  }
}

/**
 * Standalone explicit-buffer compatibility wrapper.
 */
export async function extractSelectBoxCopyFromPdf(
  input: ExtractSelectBoxCopyInput,
): Promise<SelectBoxCopyResult> {
  const leasePromise =
    PdfRendererAdapter.acquireDocument(input.pdfBytes);
  const lease = await raceWithAbort(
    leasePromise,
    input.signal,
    'load byte-backed PDF for Select Box Copy',
    () => {
      void leasePromise
        .then((lateLease) => lateLease.release())
        .catch(() => undefined);
    },
  );

  try {
    return await extractSelectBoxCopyFromDocument({
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

export function buildSelectBoxCopyFromTextItems(input: {
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
  textItems: TextLayerItem[];
}): SelectBoxCopyResult {
  const normalized = normalizeViewportRect(
    input.viewportRect,
  );

  const items: SelectBoxTextItem[] = input.textItems
    .filter((item) => item.text.trim())
    .filter((item) =>
      rectIntersects(itemToRect(item), normalized),
    )
    .map((item) => ({
      id: item.id,
      text: item.text,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      fontSize: item.fontSize,
    }))
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

  const rows = groupTextItemsIntoRows(items);

  return buildSelectBoxCopyResult({
    pageNumber: input.pageNumber,
    pageIndex: input.pageNumber - 1,
    viewportRect: normalized,
    pdfRect: viewportRectToPdfRect(
      normalized,
      input.viewport,
    ),
    items,
    rows,
  });
}
