import { describe, it, expect } from 'vitest';
import {
  createAnnotationGeometry,
  reprojectGeometry,
  reprojectForRotation,
  batchReproject,
} from './geometry';

describe('AnnotationGeometry', () => {
  const letter = { w: 612, h: 792 }; // US Letter in PDF points

  it('creates geometry with normalized coordinates in [0,1] range', () => {
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, {
      x: 100, y: 200, width: 200, height: 50,
    });

    expect(geo.normalized.rect.x).toBeCloseTo(100 / 612, 4);
    expect(geo.normalized.rect.y).toBeCloseTo(200 / 792, 4);
    expect(geo.normalized.rect.width).toBeCloseTo(200 / 612, 4);
    expect(geo.normalized.rect.height).toBeCloseTo(50 / 792, 4);
  });

  it('reprojects to 2x size (zoom simulation)', () => {
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, {
      x: 100, y: 200, width: 200, height: 50,
    });

    const zoomed = reprojectGeometry(geo, letter.w * 2, letter.h * 2);

    expect(zoomed.rectViewport.x).toBeCloseTo(200, 0);
    expect(zoomed.rectViewport.y).toBeCloseTo(400, 0);
    expect(zoomed.rectViewport.width).toBeCloseTo(400, 0);
    expect(zoomed.rectViewport.height).toBeCloseTo(100, 0);
  });

  it('survives round-trip at same size within tolerance', () => {
    const original = { x: 306, y: 396, width: 100, height: 50 };
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, original);
    const reprojected = reprojectGeometry(geo, letter.w, letter.h);

    expect(reprojected.rectViewport.x).toBeCloseTo(original.x, 1);
    expect(reprojected.rectViewport.y).toBeCloseTo(original.y, 1);
    expect(reprojected.rectViewport.width).toBeCloseTo(original.width, 1);
    expect(reprojected.rectViewport.height).toBeCloseTo(original.height, 1);
  });

  it('handles non-standard page sizes (A4)', () => {
    const a4 = { w: 595, h: 842 };
    const geo = createAnnotationGeometry(1, 0, a4.w, a4.h, {
      x: 297.5, y: 421, width: 100, height: 50,
    });

    expect(geo.normalized.rect.x).toBeCloseTo(0.5, 1);
    expect(geo.normalized.rect.y).toBeCloseTo(0.5, 1);
  });

  it('guards against zero page dimensions', () => {
    const geo = createAnnotationGeometry(1, 0, 0, 0, {
      x: 10, y: 20, width: 30, height: 40,
    });
    // Should not throw — uses Math.max(1, ...) internally
    expect(geo.pageWidth).toBe(1);
    expect(geo.pageHeight).toBe(1);
  });
});

describe('reprojectForRotation', () => {
  it('updates rotation and page dimensions', () => {
    const geo = createAnnotationGeometry(1, 0, 612, 792, {
      x: 100, y: 200, width: 200, height: 50,
    });

    // After 90° rotation, page becomes 792x612
    const rotated = reprojectForRotation(geo, 90, 792, 612);

    expect(rotated.pageRotation).toBe(90);
    expect(rotated.pageWidth).toBe(792);
    expect(rotated.pageHeight).toBe(612);
    // Normalized coords are preserved, viewport is recalculated
    expect(rotated.rectViewport.x).toBeCloseTo(
      geo.normalized.rect.x * 792, 0,
    );
  });
});

describe('batchReproject', () => {
  it('reprojects multiple geometries at once', () => {
    const geos = [
      createAnnotationGeometry(1, 0, 612, 792, { x: 100, y: 100, width: 50, height: 50 }),
      createAnnotationGeometry(2, 0, 612, 792, { x: 200, y: 200, width: 100, height: 100 }),
    ];

    const zoomed = batchReproject(geos, 1224, 1584); // 2x zoom

    expect(zoomed).toHaveLength(2);
    expect(zoomed[0].rectViewport.x).toBeCloseTo(200, 0);
    expect(zoomed[1].rectViewport.x).toBeCloseTo(400, 0);
  });
});

describe('Multi-operation stability', () => {
  it('annotation survives zoom — un-zoom round-trip', () => {
    const original = { x: 150, y: 300, width: 80, height: 40 };
    const geo = createAnnotationGeometry(1, 0, 612, 792, original);

    // Zoom to 3x
    const zoomed = reprojectGeometry(geo, 612 * 3, 792 * 3);
    // Un-zoom back to 1x
    const restored = reprojectGeometry(zoomed, 612, 792);

    expect(restored.rectViewport.x).toBeCloseTo(original.x, 0);
    expect(restored.rectViewport.y).toBeCloseTo(original.y, 0);
    expect(restored.rectViewport.width).toBeCloseTo(original.width, 0);
    expect(restored.rectViewport.height).toBeCloseTo(original.height, 0);
  });

  it('annotation survives progressive zoom (1x — 1.5x — 2x — 1x)', () => {
    const original = { x: 100, y: 200, width: 200, height: 50 };
    const geo = createAnnotationGeometry(1, 0, 612, 792, original);

    const at1_5x = reprojectGeometry(geo, 918, 1188);
    const at2x = reprojectGeometry(at1_5x, 1224, 1584);
    const backTo1x = reprojectGeometry(at2x, 612, 792);

    expect(backTo1x.rectViewport.x).toBeCloseTo(original.x, 0);
    expect(backTo1x.rectViewport.width).toBeCloseTo(original.width, 0);
  });
});
