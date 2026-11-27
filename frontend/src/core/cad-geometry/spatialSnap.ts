import type { CadLineSegment, Point2D } from './types';

/**
 * Spatial Grid Hash Key for 2D points with cell size S.
 */
function gridKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function euclideanDistance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export interface SnapResult {
  lines: CadLineSegment[];
  snappedVertexCount: number;
  droppedDegenerateCount: number;
}

/**
 * Snaps line endpoints that are within `epsilon` distance of each other into shared canonical vertices.
 * Drops degenerate zero-length segments resulting from snapping.
 *
 * @param lines Array of line segments to snap.
 * @param epsilon Tolerance radius in points (default: 0.5).
 */
export function snapLineEndpoints(
  lines: CadLineSegment[],
  epsilon = 0.5,
): SnapResult {
  if (lines.length === 0 || epsilon <= 0) {
    return { lines: [...lines], snappedVertexCount: 0, droppedDegenerateCount: 0 };
  }

  const cellSize = Math.max(epsilon * 2, 1.0);
  const grid = new Map<string, Point2D[]>();

  // Helper to insert a canonical point into the grid
  const insertToGrid = (pt: Point2D) => {
    const cx = Math.floor(pt.x / cellSize);
    const cy = Math.floor(pt.y / cellSize);
    const key = gridKey(cx, cy);
    const list = grid.get(key);
    if (list) {
      list.push(pt);
    } else {
      grid.set(key, [pt]);
    }
  };

  // Find nearest existing canonical vertex within epsilon
  const findCanonical = (pt: Point2D): Point2D | null => {
    const cx = Math.floor(pt.x / cellSize);
    const cy = Math.floor(pt.y / cellSize);

    let bestPt: Point2D | null = null;
    let bestDist = epsilon;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = gridKey(cx + dx, cy + dy);
        const candidates = grid.get(key);
        if (!candidates) continue;

        for (const cand of candidates) {
          const d = euclideanDistance(pt, cand);
          if (d <= bestDist) {
            bestDist = d;
            bestPt = cand;
          }
        }
      }
    }

    return bestPt;
  };

  const canonicalVertices: Point2D[] = [];

  const resolvePoint = (pt: Point2D): { point: Point2D; wasSnapped: boolean } => {
    const match = findCanonical(pt);
    if (match) {
      return { point: match, wasSnapped: match !== pt && (match.x !== pt.x || match.y !== pt.y) };
    }
    // Create new canonical vertex
    const newCanon: Point2D = { x: pt.x, y: pt.y };
    insertToGrid(newCanon);
    canonicalVertices.push(newCanon);
    return { point: newCanon, wasSnapped: false };
  };

  let snappedVertexCount = 0;
  let droppedDegenerateCount = 0;
  const processedLines: CadLineSegment[] = [];

  for (const line of lines) {
    const resStart = resolvePoint(line.start);
    const resEnd = resolvePoint(line.end);

    if (resStart.wasSnapped) snappedVertexCount++;
    if (resEnd.wasSnapped) snappedVertexCount++;

    const len = euclideanDistance(resStart.point, resEnd.point);
    // Drop segments that collapsed to zero length
    if (len < 1e-5) {
      droppedDegenerateCount++;
      continue;
    }

    processedLines.push({
      ...line,
      start: resStart.point,
      end: resEnd.point,
      length: len,
    });
  }

  return {
    lines: processedLines,
    snappedVertexCount,
    droppedDegenerateCount,
  };
}
