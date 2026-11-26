import type { CadLineSegment, Point2D } from './types';

function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function pointsClose(p1: Point2D, p2: Point2D, tol = 1e-4): boolean {
  return distance(p1, p2) <= tol;
}

/**
 * Computes angle between two 2D vectors in radians [0, pi].
 */
function angleBetweenVectors(v1: Point2D, v2: Point2D): number {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 < 1e-9 || mag2 < 1e-9) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosTheta);
}

export interface CollinearMergeOptions {
  angleToleranceRad?: number; // Max angle between segment directions (default: 0.0175 rad ~ 1 deg)
  distanceTolerance?: number; // Point coincidence tolerance (default: 1e-4)
}

export interface CollinearMergeResult {
  lines: CadLineSegment[];
  mergedCount: number;
}

/**
 * Merges connected and overlapping collinear line segments sharing identical stroke styles.
 *
 * Example:
 *   Segment A: (0, 0) -> (10, 0)
 *   Segment B: (10, 0) -> (30, 0)
 *   Merged:    (0, 0) -> (30, 0)
 */
export function mergeCollinearSegments(
  lines: CadLineSegment[],
  options: CollinearMergeOptions = {},
): CollinearMergeResult {
  if (lines.length <= 1) {
    return { lines: [...lines], mergedCount: 0 };
  }

  const angleTol = options.angleToleranceRad ?? 0.0175; // ~1 degree
  const distTol = options.distanceTolerance ?? 1e-4;

  const currentLines: CadLineSegment[] = lines.map((l) => ({ ...l }));
  let mergedCount = 0;
  let didMerge = true;

  while (didMerge) {
    didMerge = false;

    outer: for (let i = 0; i < currentLines.length; i++) {
      const s1 = currentLines[i];

      for (let j = i + 1; j < currentLines.length; j++) {
        const s2 = currentLines[j];

        // Must have matching stroke properties
        if (s1.strokeColor !== s2.strokeColor || s1.strokeWidth !== s2.strokeWidth) {
          continue;
        }

        // Determine shared endpoint and orientation
        let shared: Point2D | null = null;
        let other1: Point2D | null = null;
        let other2: Point2D | null = null;

        if (pointsClose(s1.end, s2.start, distTol)) {
          shared = s1.end;
          other1 = s1.start;
          other2 = s2.end;
        } else if (pointsClose(s1.start, s2.end, distTol)) {
          shared = s1.start;
          other1 = s2.start;
          other2 = s1.end;
        } else if (pointsClose(s1.end, s2.end, distTol)) {
          shared = s1.end;
          other1 = s1.start;
          other2 = s2.start;
        } else if (pointsClose(s1.start, s2.start, distTol)) {
          shared = s1.start;
          other1 = s1.end;
          other2 = s2.end;
        }

        if (shared && other1 && other2) {
          // Vector from other1 to shared, and from shared to other2
          const v1 = { x: shared.x - other1.x, y: shared.y - other1.y };
          const v2 = { x: other2.x - shared.x, y: other2.y - shared.y };

          const angle = angleBetweenVectors(v1, v2);

          // If vectors point in the same direction within angular tolerance,
          // they form a single straight continuation other1 -> shared -> other2
          if (angle <= angleTol) {
            const mergedLen = distance(other1, other2);
            const mergedLine: CadLineSegment = {
              id: s1.id,
              start: { ...other1 },
              end: { ...other2 },
              length: mergedLen,
              strokeColor: s1.strokeColor,
              strokeWidth: s1.strokeWidth,
            };

            currentLines.splice(j, 1);
            currentLines[i] = mergedLine;
            mergedCount++;
            didMerge = true;
            break outer;
          }
        }
      }
    }
  }

  return {
    lines: currentLines,
    mergedCount,
  };
}
