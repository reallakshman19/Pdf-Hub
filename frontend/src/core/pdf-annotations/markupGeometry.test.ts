import { describe, expect, it } from 'vitest';
import { createMarkupSpace, pdfPointToView, pdfRectToViewRect, viewPointToPdf, viewRectToPdfRect } from './markupGeometry';

describe('ALT WP01 markup page coordinate mapping', () => {
  for (const degrees of [0, 90, 180, 270]) {
    it('round-trips cropped page coordinates and native rectangle at rotation ' + degrees, () => {
      const space = createMarkupSpace({ x: 20, y: 30, width: 300, height: 500 }, degrees);
      const rect = { x: 65, y: 80, width: 88, height: 17 };
      const native = viewRectToPdfRect(rect, space);
      const reread = pdfRectToViewRect(native, space);
      expect(reread.x).toBeCloseTo(rect.x, 9);
      expect(reread.y).toBeCloseTo(rect.y, 9);
      expect(reread.width).toBeCloseTo(rect.width, 9);
      expect(reread.height).toBeCloseTo(rect.height, 9);
      const point = viewPointToPdf(11, 51, space);
      const roundTrip = pdfPointToView(point.x, point.y, space);
      expect(roundTrip).toEqual({ x: 11, y: 51 });
    });
  }
  it('rejects invalid rotation and crop as explicit negative controls', () => {
    expect(() => createMarkupSpace({ x: 0, y: 0, width: 0, height: 100 }, 0)).toThrow();
    expect(() => createMarkupSpace({ x: 0, y: 0, width: 100, height: 100 }, 45)).toThrow();
  });
});
