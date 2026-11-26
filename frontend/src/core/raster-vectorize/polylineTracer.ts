/**
 * Skeleton-to-polyline tracer with Ramer-Douglas-Peucker simplification.
 *
 * Takes a 1-pixel-wide skeleton (output of Zhang-Suen thinning) and returns
 * a list of simplified polylines in pixel coordinates.
 *
 * Algorithm:
 *  1. Build a junction-aware graph from the skeleton pixels.
 *  2. Walk each graph edge from endpoint to endpoint (or junction to junction),
 *     collecting the pixel chain.
 *  3. Apply RDP simplification to reduce vertex count.
 *  4. Discard polylines shorter than `minLengthPx`.
 *
 * No DOM dependencies — safe to call inside a Web Worker.
 */

import type { PixelPolyline, TraceOptions } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** @internal Encode a pixel (x,y) as a single integer index. */
const idx = (x: number, y: number, w: number): number => y * w + x;

/** @internal The 8 relative (dx, dy) neighbours. */
const DIRS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],           [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/** @internal Collect pixel-neighbours that are foreground. */
function fgNeighbours(skel: Uint8Array, x: number, y: number, w: number, h: number): [number, number][] {
  const result: [number, number][] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h && skel[idx(nx, ny, w)] === 1) {
      result.push([nx, ny]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// RDP simplification
// ---------------------------------------------------------------------------

/** @internal Perpendicular distance from point P to segment (A, B). */
function perpendicularDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
}

/** @internal RDP on a flat [x0,y0,x1,y1,...] array, in place. */
function rdp(pts: number[], start: number, end: number, epsilon: number, keep: Uint8Array): void {
  if (end <= start + 2) return;   // 2 entries = 1 point pair; nothing to simplify
  let maxDist = 0;
  let maxIdx = start;
  const ax = pts[start];
  const ay = pts[start + 1];
  const bx = pts[end];
  const by = pts[end + 1];
  for (let i = start + 2; i < end; i += 2) {
    const d = perpendicularDist(pts[i], pts[i + 1], ax, ay, bx, by);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    rdp(pts, start, maxIdx, epsilon, keep);
    keep[maxIdx] = 1;
    rdp(pts, maxIdx, end, epsilon, keep);
  }
}

/** Simplify a flat [x,y,...] array using Ramer-Douglas-Peucker. */
function simplifyRDP(pts: number[], epsilon: number): number[] {
  if (pts.length < 4) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 2] = 1;
  rdp(pts, 0, pts.length - 2, epsilon, keep);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (keep[i]) { out.push(pts[i], pts[i + 1]); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arc-length helper
// ---------------------------------------------------------------------------

function arcLengthPx(pts: number[]): number {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const dx = pts[i] - pts[i - 2];
    const dy = pts[i + 1] - pts[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

// ---------------------------------------------------------------------------
// Main tracer
// ---------------------------------------------------------------------------

/**
 * Trace a 1-pixel-wide skeleton into a list of simplified polylines.
 *
 * @param skeleton  - Uint8Array where `1` = skeleton pixel.
 * @param width     - Image width in pixels.
 * @param height    - Image height in pixels.
 * @param options   - RDP epsilon and minimum length filtering.
 */
export function traceSkeletonToPolylines(
  skeleton: Uint8Array,
  width: number,
  height: number,
  options: TraceOptions = {},
): PixelPolyline[] {
  const epsilon = options.rdpEpsilonPx ?? 1.5;
  const minLen  = options.minLengthPx  ?? 20;

  // --- Step 1: Classify pixels as endpoints, junctions, or body ---
  // degree = number of foreground neighbours
  const degree = new Uint8Array(skeleton.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      if (skeleton[i] === 0) continue;
      degree[i] = fgNeighbours(skeleton, x, y, width, height).length;
    }
  }

  // visited tracks whether a pixel has already been consumed into a walk
  const visited = new Uint8Array(skeleton.length);
  const polylines: PixelPolyline[] = [];

  /**
   * Walk from (startX, startY) in the direction of (prevX, prevY) → (startX, startY),
   * collecting pixels until we hit an endpoint or junction (degree != 2).
   */
  function walk(
    startX: number, startY: number,
    prevX: number, prevY: number,
  ): number[] {
    const pts: number[] = [startX, startY];
    let cx = startX, cy = startY;
    let lx = prevX, ly = prevY;
    visited[idx(cx, cy, width)] = 1;

    let stepping = true;
    while (stepping) {
      const nbs = fgNeighbours(skeleton, cx, cy, width, height);
      // Find the unvisited neighbour that isn't the one we came from
      const next = nbs.find(([nx, ny]) => !(nx === lx && ny === ly) && !visited[idx(nx, ny, width)]);
      if (!next) { stepping = false; break; }
      const [nx, ny] = next;
      pts.push(nx, ny);
      visited[idx(nx, ny, width)] = 1;
      lx = cx; ly = cy;
      cx = nx; cy = ny;
      // Stop at junction or endpoint
      if (degree[idx(cx, cy, width)] !== 2) stepping = false;
    }
    return pts;
  }

  // --- Step 2: Start walks from endpoints (degree === 1) first ---
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      if (skeleton[i] === 0 || visited[i] || degree[i] !== 1) continue;
      visited[i] = 1;
      const nbs = fgNeighbours(skeleton, x, y, width, height);
      if (nbs.length === 0) continue;
      const rawPts = [x, y, ...walk(nbs[0][0], nbs[0][1], x, y)];
      const simplified = simplifyRDP(rawPts, epsilon);
      const length = arcLengthPx(simplified);
      if (length >= minLen) polylines.push({ points: simplified, lengthPx: length });
    }
  }

  // --- Step 3: Remaining body/isolated pixels (loops and isolated segments) ---
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      if (skeleton[i] === 0 || visited[i]) continue;
      visited[i] = 1;
      const nbs = fgNeighbours(skeleton, x, y, width, height).filter(([nx, ny]) => !visited[idx(nx, ny, width)]);
      if (nbs.length === 0) continue;
      const rawPts = [x, y, ...walk(nbs[0][0], nbs[0][1], x, y)];
      const simplified = simplifyRDP(rawPts, epsilon);
      const length = arcLengthPx(simplified);
      if (length >= minLen) polylines.push({ points: simplified, lengthPx: length });
    }
  }

  return polylines;
}
