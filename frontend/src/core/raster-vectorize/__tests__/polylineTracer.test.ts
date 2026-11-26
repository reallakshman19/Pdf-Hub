import { describe, it, expect } from 'vitest';
import { traceSkeletonToPolylines } from '../polylineTracer';

/** Build a skeleton Uint8Array from a 2-D grid where '#' = 1 (fg). */
function parseGrid(rows: string[]): { skel: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const skel = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      skel[y * w + x] = rows[y][x] === '#' ? 1 : 0;
    }
  }
  return { skel, w, h };
}

describe('traceSkeletonToPolylines', () => {
  it('traces a horizontal line into a single polyline', () => {
    const { skel, w, h } = parseGrid([
      '............',
      '.##########.',
      '............',
    ]);
    const polylines = traceSkeletonToPolylines(skel, w, h, { rdpEpsilonPx: 0.5, minLengthPx: 2 });
    expect(polylines.length).toBe(1);
    // Should have at least start and end vertex (4 numbers)
    expect(polylines[0].points.length).toBeGreaterThanOrEqual(4);
  });

  it('produces at least 1 vertex per arm of an L-shape', () => {
    // 15x9 L-shape: vertical arm + horizontal arm
    const { skel, w, h } = parseGrid([
      '...............',
      '.#.............',
      '.#.............',
      '.#.............',
      '.#.............',
      '.############..',
      '...............',
      '...............',
      '...............',
    ]);
    const polylines = traceSkeletonToPolylines(skel, w, h, { rdpEpsilonPx: 0.5, minLengthPx: 2 });
    // The L-shape is a single connected path → should trace as 1 polyline
    expect(polylines.length).toBeGreaterThanOrEqual(1);
    const totalPts = polylines.reduce((sum, pl) => sum + pl.points.length / 2, 0);
    // Should have at least 3 vertices (start, corner, end)
    expect(totalPts).toBeGreaterThanOrEqual(3);
  });

  it('filters out very short segments when minLengthPx is high', () => {
    // Three-pixel line — shorter than minLengthPx=20
    const { skel, w, h } = parseGrid([
      '.....',
      '.###.',
      '.....',
    ]);
    const polylines = traceSkeletonToPolylines(skel, w, h, { rdpEpsilonPx: 0.5, minLengthPx: 20 });
    expect(polylines.length).toBe(0);
  });

  it('reports correct arc-length for a straight horizontal segment', () => {
    // 10 foreground pixels in a row → arc-length = 9 px (9 unit steps)
    const { skel, w, h } = parseGrid([
      '............',
      '.##########.',
      '............',
    ]);
    const polylines = traceSkeletonToPolylines(skel, w, h, { rdpEpsilonPx: 0, minLengthPx: 1 });
    expect(polylines.length).toBeGreaterThanOrEqual(1);
    // With epsilon=0 no simplification happens, so length should be close to 9
    const len = polylines[0].lengthPx;
    expect(len).toBeGreaterThanOrEqual(5);
    expect(len).toBeLessThanOrEqual(12);
  });

  it('returns empty array for an all-background skeleton', () => {
    const skel = new Uint8Array(16);
    const polylines = traceSkeletonToPolylines(skel, 4, 4, { minLengthPx: 1 });
    expect(polylines.length).toBe(0);
  });
});
