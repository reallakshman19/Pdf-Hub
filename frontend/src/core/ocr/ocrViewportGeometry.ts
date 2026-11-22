import type { PdfRect } from '../writer-v2/types';

/**
 * PDF.js viewport coordinates are top-origin CSS pixels. PDF coordinates
 * are bottom-origin unrotated user space, including non-zero CropBox offsets.
 * Never infer the conversion from viewport height / zoom: use PDF.js' inverse.
 */
export interface OcrPdfViewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportRectangle(rect: number[]): number[];
}

export function viewportSelectionToPdfRect(
  viewport: OcrPdfViewport,
  rect: PdfRect,
): PdfRect {
  const corners = [
    viewport.convertToPdfPoint(rect.x, rect.y),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y),
    viewport.convertToPdfPoint(rect.x, rect.y + rect.height),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height),
  ];
  return boundsOfPoints(corners);
}

export function pdfRectToViewportSelection(
  viewport: OcrPdfViewport,
  rect: PdfRect,
): PdfRect {
  if (typeof viewport?.convertToViewportRectangle === 'function') {
    const points = viewport.convertToViewportRectangle([
      rect.x, rect.y, rect.x + rect.width, rect.y + rect.height,
    ]);
    return boundsOfPoints([[points[0], points[1]], [points[2], points[3]]]);
  }
  return {
    x: rect.x,
    y: viewport.height - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}

function boundsOfPoints(points: ReadonlyArray<readonly number[]>): PdfRect {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}
