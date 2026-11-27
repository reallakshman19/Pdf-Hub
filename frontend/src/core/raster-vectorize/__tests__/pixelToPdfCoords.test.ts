import { describe, it, expect } from 'vitest';
import { pixelPolylineToPdfPoints, pixelPolylinesToPdfPoints } from '../pixelToPdfCoords';

describe('pixelPolylineToPdfPoints', () => {
  it('maps pixel coordinates linearly to full-page top-left view space', () => {
    const pts = pixelPolylineToPdfPoints(
      { points: [0, 0, 50, 25, 100, 100], lengthPx: 100 },
      100,
      100,
      { x: 0, y: 0, width: 612, height: 792 },
    );

    expect(pts).toEqual([0, 0, 306, 198, 612, 792]);
  });

  it('offsets pixel coordinates by top-left ROI bounds', () => {
    const res = pixelPolylinesToPdfPoints(
      [{ points: [10, 20, 40, 60], lengthPx: 50 }],
      100,
      100,
      { x: 200, y: 150, width: 300, height: 200 },
    );

    expect(res).toEqual([[230, 190, 320, 270]]);
  });

  it('returns empty array when image dimensions are non-positive', () => {
    expect(
      pixelPolylineToPdfPoints(
        { points: [10, 20, 30, 40], lengthPx: 28 },
        0,
        100,
        { x: 0, y: 0, width: 100, height: 100 },
      ),
    ).toEqual([]);
  });
});
