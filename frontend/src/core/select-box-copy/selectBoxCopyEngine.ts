import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
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
import { normalizeViewportRect, rectIntersects, itemToRect } from './selectionGeometry';
import { groupTextItemsIntoRows } from './textGrouping';

export interface ExtractSelectBoxCopyInput {
  pdfBytes: Uint8Array;
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
}

export async function extractSelectBoxCopyFromPdf(
  input: ExtractSelectBoxCopyInput,
): Promise<SelectBoxCopyResult> {
  const normalized = normalizeViewportRect(input.viewportRect);
  const doc = await PdfRendererAdapter.loadDocument(input.pdfBytes);
  const page = await doc.getPage(input.pageNumber);

  try {
    const textItems = await PdfRendererAdapter.getPageTextItems(
      page,
      input.viewport.scale,
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

export function buildSelectBoxCopyFromTextItems(input: {
  pageNumber: number;
  viewport: WriterPageViewport;
  viewportRect: SelectBoxViewportRect;
  textItems: TextLayerItem[];
}): SelectBoxCopyResult {
  const normalized = normalizeViewportRect(input.viewportRect);

  const items: SelectBoxTextItem[] = input.textItems
    .filter((item) => item.text.trim())
    .filter((item) => rectIntersects(itemToRect(item), normalized))
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
      if (Math.abs(a.y - b.y) > 3) return a.y - b.y;
      return a.x - b.x;
    });

  const rows = groupTextItemsIntoRows(items);

  return buildSelectBoxCopyResult({
    pageNumber: input.pageNumber,
    pageIndex: input.pageNumber - 1,
    viewportRect: normalized,
    pdfRect: viewportRectToPdfRect(normalized, input.viewport),
    items,
    rows,
  });
}