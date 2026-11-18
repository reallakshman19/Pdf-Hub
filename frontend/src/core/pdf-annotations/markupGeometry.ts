import type { Rect } from '@/core/annotations/types';

/**
 * PDF.js draws the displayed crop rectangle after /Rotate; pdf-lib stores
 * annotation /Rect and /QuadPoints in unrotated default user space.
 * These functions deliberately operate only on markup/mask annotations.
 */
export interface MarkupSpace {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotation: 0 | 90 | 180 | 270;
}
export interface PdfPoint { x: number; y: number }

export function createMarkupSpace(
  crop: { x: number; y: number; width: number; height: number },
  angle: number,
): MarkupSpace {
  const rotation = ((angle % 360) + 360) % 360;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    throw new Error('UNSUPPORTED_MARKUP_PAGE_ROTATION');
  }
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
    || crop.width <= 0 || crop.height <= 0) {
    throw new Error('INVALID_MARKUP_PAGE_CROP');
  }
  return {
    cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height,
    rotation,
  };
}

export function viewPointToPdf(x: number, y: number, s: MarkupSpace): PdfPoint {
  switch (s.rotation) {
    case 0: return { x: s.cropX + x, y: s.cropY + s.cropHeight - y };
    case 90: return { x: s.cropX + y, y: s.cropY + x };
    case 180: return { x: s.cropX + s.cropWidth - x, y: s.cropY + y };
    case 270: return { x: s.cropX + s.cropWidth - y, y: s.cropY + s.cropHeight - x };
  }
}

export function pdfPointToView(x: number, y: number, s: MarkupSpace): PdfPoint {
  const px = x - s.cropX;
  const py = y - s.cropY;
  switch (s.rotation) {
    case 0: return { x: px, y: s.cropHeight - py };
    case 90: return { x: py, y: px };
    case 180: return { x: s.cropWidth - px, y: py };
    case 270: return { x: s.cropHeight - py, y: s.cropWidth - px };
  }
}

function bounds(points: PdfPoint[]): [number, number, number, number] {
  return [
    Math.min(...points.map((p) => p.x)),
    Math.min(...points.map((p) => p.y)),
    Math.max(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)),
  ];
}

export function viewRectToPdfRect(rect: Rect, s: MarkupSpace): [number, number, number, number] {
  const { x, y, width, height } = rect;
  return bounds([
    viewPointToPdf(x, y, s), viewPointToPdf(x + width, y, s),
    viewPointToPdf(x, y + height, s), viewPointToPdf(x + width, y + height, s),
  ]);
}

export function pdfRectToViewRect(values: number[], s: MarkupSpace): Rect {
  const [x1, y1, x2, y2] = values;
  const [left, top, right, bottom] = bounds([
    pdfPointToView(x1, y1, s), pdfPointToView(x2, y1, s),
    pdfPointToView(x1, y2, s), pdfPointToView(x2, y2, s),
  ]);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function markupOrMask(type: string): boolean {
  return type === 'highlight' || type === 'underline' || type === 'strikeout'
    || type === 'squiggly' || type === 'redaction';
}
