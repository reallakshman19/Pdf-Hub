import type { CadArcPrimitive, CadCubicBezier, Point2D } from './types';

function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Evaluates a cubic Bezier curve at parameter t in [0, 1].
 */
export function evaluateCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Computes the circumcircle passing through 3 non-collinear points.
 * Returns null if points are collinear or degenerate.
 */
export function circumcircle3Points(
  a: Point2D,
  b: Point2D,
  c: Point2D,
): { center: Point2D; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null; // Collinear

  const aSq = a.x * a.x + a.y * a.y;
  const bSq = b.x * b.x + b.y * b.y;
  const cSq = c.x * c.x + c.y * c.y;

  const cx = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d;
  const cy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d;

  const center: Point2D = { x: cx, y: cy };
  const radius = distance(center, a);

  if (radius < 1e-4 || radius > 1e7) return null;

  return { center, radius };
}

export interface ArcFitOptions {
  maxError?: number; // Max radial deviation in points (default: 0.5)
  sampleSteps?: number; // Number of intermediate sample test points (default: 8)
}

/**
 * Attempts to fit a circular arc to a cubic Bezier curve.
 * Returns a CadArcPrimitive if all sampled points lie within `maxError` of the circumcircle.
 */
export function fitArcToBezier(
  bezier: CadCubicBezier,
  options: ArcFitOptions = {},
): CadArcPrimitive | null {
  const maxError = options.maxError ?? 0.5;
  const steps = options.sampleSteps ?? 8;

  const p0 = bezier.p0;
  const p1 = bezier.p1;
  const p2 = bezier.p2;
  const p3 = bezier.p3;

  // Midpoint on the cubic Bezier at t = 0.5
  const pMid = evaluateCubicBezier(p0, p1, p2, p3, 0.5);

  const circle = circumcircle3Points(p0, pMid, p3);
  if (!circle) return null;

  const { center, radius } = circle;

  // Sample along the curve to verify radial error
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
    const distToCenter = distance(pt, center);
    if (Math.abs(distToCenter - radius) > maxError) {
      return null;
    }
  }

  // Calculate angles
  const startAngle = Math.atan2(p0.y - center.y, p0.x - center.x);
  const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);

  // Determine orientation via cross product of vector OA and OB
  const cross = (p0.x - center.x) * (pMid.y - center.y) - (p0.y - center.y) * (pMid.x - center.x);
  const isCounterClockwise = cross > 0;

  return {
    id: `cad-arc-${bezier.id}`,
    center,
    radius,
    startAngleRad: startAngle,
    endAngleRad: endAngle,
    isCounterClockwise,
    strokeColor: bezier.strokeColor,
    strokeWidth: bezier.strokeWidth,
  };
}
