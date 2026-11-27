import type { Point2D } from '../cad-geometry/types';
import { computeSignedPolygonArea } from '../cad-geometry/planarGraph';

function isPointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const cross1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const cross2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  const cross3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);

  const hasNeg = cross1 < 0 || cross2 < 0 || cross3 < 0;
  const hasPos = cross1 > 0 || cross2 > 0 || cross3 > 0;

  return !(hasNeg && hasPos);
}

/**
 * Triangulates a simple 2D polygon using the Ear Clipping algorithm.
 * Returns an array of index triples representing triangles [i0, i1, i2, ...].
 *
 * @param polygon Array of 2D vertices. Must be simple (non-self-intersecting).
 */
export function triangulatePolygon(polygon: Point2D[]): number[] {
  const n = polygon.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Ensure polygon is oriented counter-clockwise (positive signed area)
  const isCCW = computeSignedPolygonArea(polygon) > 0;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(isCCW ? i : n - 1 - i);
  }

  const triangles: number[] = [];
  let remainingCount = n;
  let safetyLoop = 0;
  const maxLoops = n * n * 2;

  while (remainingCount > 3 && safetyLoop < maxLoops) {
    safetyLoop++;
    let earFound = false;

    for (let i = 0; i < remainingCount; i++) {
      const prevIdx = indices[(i - 1 + remainingCount) % remainingCount];
      const currIdx = indices[i];
      const nextIdx = indices[(i + 1) % remainingCount];

      const a = polygon[prevIdx];
      const b = polygon[currIdx];
      const c = polygon[nextIdx];

      // Cross product to test convexity (must turn left in CCW order)
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 1e-9) {
        continue; // Reflex vertex, not an ear
      }

      // Check if any other vertex lies inside triangle abc
      let containsOther = false;
      for (let j = 0; j < remainingCount; j++) {
        const testIdx = indices[j];
        if (testIdx === prevIdx || testIdx === currIdx || testIdx === nextIdx) {
          continue;
        }
        if (isPointInTriangle(polygon[testIdx], a, b, c)) {
          containsOther = true;
          break;
        }
      }

      if (!containsOther) {
        // Found an ear! Clip it
        triangles.push(prevIdx, currIdx, nextIdx);
        indices.splice(i, 1);
        remainingCount--;
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      // Degenerate or non-simple fallback: fan triangulation
      break;
    }
  }

  // Clip remaining 3 vertices
  if (remainingCount === 3) {
    triangles.push(indices[0], indices[1], indices[2]);
  } else if (remainingCount > 3) {
    // Fan fallback for remaining vertices
    for (let i = 1; i < remainingCount - 1; i++) {
      triangles.push(indices[0], indices[i], indices[i + 1]);
    }
  }

  return triangles;
}
