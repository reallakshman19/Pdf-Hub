import { describe, expect, it } from 'vitest';
import {
  pdfRectToViewportSelection,
  viewportSelectionToPdfRect,
  type OcrPdfViewport,
} from '../ocrViewportGeometry';

describe('OCR viewport geometry', () => {
  it('uses the inverted PDF.js viewport at 2x, not top-origin page Y', () => {
    const viewport: OcrPdfViewport = {
      width: 1224,
      height: 1584,
      convertToPdfPoint(x, y) {
        return [x / 2, 792 - y / 2];
      },
      convertToViewportRectangle([x0, y0, x1, y1]) {
        return [x0 * 2, (792 - y0) * 2, x1 * 2, (792 - y1) * 2];
      },
    };
    const displayed = { x: 124, y: 230, width: 580, height: 94 };
    const native = viewportSelectionToPdfRect(viewport, displayed);
    expect(native).toEqual({ x: 62, y: 630, width: 290, height: 47 });
    expect(pdfRectToViewportSelection(viewport, native)).toEqual(displayed);
  });

  it('preserves 90-degree rotation and a displaced CropBox at 2x', () => {
    // View [70,100,540,720], rotated 90 degrees clockwise.
    const viewport: OcrPdfViewport = {
      width: 1240,
      height: 940,
      convertToPdfPoint(x, y) {
        return [70 + y / 2, 100 + x / 2];
      },
      convertToViewportRectangle([x0, y0, x1, y1]) {
        return [(y0 - 100) * 2, (x0 - 70) * 2, (y1 - 100) * 2, (x1 - 70) * 2];
      },
    };
    const displayed = { x: 90, y: 20, width: 100, height: 40 };
    const native = viewportSelectionToPdfRect(viewport, displayed);
    expect(native).toEqual({ x: 80, y: 145, width: 20, height: 50 });
    expect(pdfRectToViewportSelection(viewport, native)).toEqual(displayed);
  });
});
