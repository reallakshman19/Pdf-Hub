import type { CadArcPrimitive, CadLineSegment, Point2D } from '../cad-geometry/types';
import type { CadSnapType } from './types';

function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Snaps a 2D point to the nearest grid intersection.
 */
export function applyGridSnap(point: Point2D, gridSpacing = 10): Point2D {
  if (gridSpacing <= 0) return { ...point };
  return {
    x: Math.round(point.x / gridSpacing) * gridSpacing,
    y: Math.round(point.y / gridSpacing) * gridSpacing,
  };
}

/**
 * Constrains cursor movement to horizontal or vertical axis (Ortho Mode).
 */
export function applyOrthoConstraint(anchor: Point2D, current: Point2D): Point2D {
  const dx = Math.abs(current.x - anchor.x);
  const dy = Math.abs(current.y - anchor.y);

  if (dx >= dy) {
    // Horizontal constraint
    return { x: current.x, y: anchor.y };
  } else {
    // Vertical constraint
    return { x: anchor.x, y: current.y };
  }
}

/**
 * Snaps cursor movement to the nearest ray defined by polarAngleStepDeg (e.g. 15, 30, 45, 90).
 */
export function applyPolarTracking(
  anchor: Point2D,
  current: Point2D,
  stepDeg = 45,
  thresholdDeg = 4.0,
): { point: Point2D; snappedAngleDeg: number | null } {
  const dist = distance(anchor, current);
  if (dist < 1e-4 || stepDeg <= 0) {
    return { point: { ...current }, snappedAngleDeg: null };
  }

  // Calculate angle in degrees [0, 360)
  let angleDeg = (Math.atan2(current.y - anchor.y, current.x - anchor.x) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  // Find nearest polar ray
  const nearestIndex = Math.round(angleDeg / stepDeg);
  const targetAngleDeg = (nearestIndex * stepDeg) % 360;

  const diff = Math.abs(angleDeg - targetAngleDeg);
  const angularDist = Math.min(diff, 360 - diff);

  if (angularDist <= thresholdDeg) {
    const targetRad = (targetAngleDeg * Math.PI) / 180;
    return {
      point: {
        x: anchor.x + dist * Math.cos(targetRad),
        y: anchor.y + dist * Math.sin(targetRad),
      },
      snappedAngleDeg: targetAngleDeg,
    };
  }

  return { point: { ...current }, snappedAngleDeg: null };
}

/**
 * Finds the nearest Object Snap (O-Snap) target:
 * - Endpoints of line segments
 * - Midpoints of line segments
 * - Centers of circular arcs
 */
export function findNearestObjectSnap(
  current: Point2D,
  lines: CadLineSegment[],
  arcs: CadArcPrimitive[] = [],
  tolerance = 8.0,
): { point: Point2D; type: CadSnapType } | null {
  let bestPt: Point2D | null = null;
  let bestDist = tolerance;
  let bestType: CadSnapType = 'endpoint';

  // 1. Line Endpoints (Priority 1)
  for (const line of lines) {
    const dStart = distance(current, line.start);
    if (dStart < bestDist) {
      bestDist = dStart;
      bestPt = line.start;
      bestType = 'endpoint';
    }
    const dEnd = distance(current, line.end);
    if (dEnd < bestDist) {
      bestDist = dEnd;
      bestPt = line.end;
      bestType = 'endpoint';
    }
  }

  // 2. Arc Centers
  for (const arc of arcs) {
    const dCenter = distance(current, arc.center);
    if (dCenter < bestDist) {
      bestDist = dCenter;
      bestPt = arc.center;
      bestType = 'center';
    }
  }

  // 3. Line Midpoints
  for (const line of lines) {
    const mid = {
      x: (line.start.x + line.end.x) / 2,
      y: (line.start.y + line.end.y) / 2,
    };
    const dMid = distance(current, mid);
    if (dMid < bestDist) {
      bestDist = dMid;
      bestPt = mid;
      bestType = 'midpoint';
    }
  }

  if (bestPt) {
    return { point: { ...bestPt }, type: bestType };
  }

  return null;
}

/**
 * Computes Euclidean length and azimuth angle in degrees [0, 360) from anchor to current.
 */
export function computeDraftingTelemetry(
  anchor: Point2D | null,
  current: Point2D,
): { length: number; angleDeg: number } {
  if (!anchor) return { length: 0, angleDeg: 0 };
  const len = distance(anchor, current);
  let deg = (Math.atan2(current.y - anchor.y, current.x - anchor.x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return {
    length: Math.round(len * 100) / 100,
    angleDeg: Math.round(deg * 10) / 10,
  };
}
