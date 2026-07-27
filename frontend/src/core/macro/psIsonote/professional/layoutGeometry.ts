import type { Point, Rect } from './model';
import type {
  LeaderRoute,
  PlacementClass,
  SegmentIntersectionKind,
} from './layoutTypes';

export const GEOMETRY_TOLERANCE = 1e-7;

export interface RouteRectHit {
  readonly segmentIndex: number;
  readonly kind: Exclude<SegmentIntersectionKind, 'none'>;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function sign(value: number, tolerance: number): -1 | 0 | 1 {
  if (value > tolerance) return 1;
  if (value < -tolerance) return -1;
  return 0;
}

export function pointsEqual(
  a: Point,
  b: Point,
  tolerance = GEOMETRY_TOLERANCE,
): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function pointOnSegment(
  point: Point,
  start: Point,
  end: Point,
  tolerance = GEOMETRY_TOLERANCE,
): boolean {
  if (Math.abs(cross(start, end, point)) > tolerance) return false;
  return point.x >= Math.min(start.x, end.x) - tolerance
    && point.x <= Math.max(start.x, end.x) + tolerance
    && point.y >= Math.min(start.y, end.y) - tolerance
    && point.y <= Math.max(start.y, end.y) + tolerance;
}

function collinearIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  tolerance: number,
): SegmentIntersectionKind {
  const useX = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
  const aMin = Math.min(useX ? a1.x : a1.y, useX ? a2.x : a2.y);
  const aMax = Math.max(useX ? a1.x : a1.y, useX ? a2.x : a2.y);
  const bMin = Math.min(useX ? b1.x : b1.y, useX ? b2.x : b2.y);
  const bMax = Math.max(useX ? b1.x : b1.y, useX ? b2.x : b2.y);
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  if (overlap < -tolerance) return 'none';
  return overlap <= tolerance ? 'touch' : 'overlap';
}

export function classifySegmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  tolerance = GEOMETRY_TOLERANCE,
): SegmentIntersectionKind {
  const o1 = sign(cross(a1, a2, b1), tolerance);
  const o2 = sign(cross(a1, a2, b2), tolerance);
  const o3 = sign(cross(b1, b2, a1), tolerance);
  const o4 = sign(cross(b1, b2, a2), tolerance);

  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    return collinearIntersection(a1, a2, b1, b2, tolerance);
  }
  if (o1 !== o2 && o1 !== 0 && o2 !== 0 && o3 !== o4 && o3 !== 0 && o4 !== 0) {
    return 'cross';
  }
  if ((o1 === 0 && pointOnSegment(b1, a1, a2, tolerance))
    || (o2 === 0 && pointOnSegment(b2, a1, a2, tolerance))
    || (o3 === 0 && pointOnSegment(a1, b1, b2, tolerance))
    || (o4 === 0 && pointOnSegment(a2, b1, b2, tolerance))) {
    return 'touch';
  }
  return 'none';
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin
    && a.x + a.width > b.x - margin
    && a.y < b.y + b.height + margin
    && a.y + a.height > b.y - margin;
}

export function rectsTouchOrOverlap(
  a: Rect,
  b: Rect,
  tolerance = GEOMETRY_TOLERANCE,
): boolean {
  return a.x <= b.x + b.width + tolerance
    && a.x + a.width >= b.x - tolerance
    && a.y <= b.y + b.height + tolerance
    && a.y + a.height >= b.y - tolerance;
}

export function isInsidePage(
  box: Rect,
  pageWidth: number,
  pageHeight: number,
  margin = 12,
): boolean {
  return box.x >= margin
    && box.y >= margin
    && box.x + box.width <= pageWidth - margin
    && box.y + box.height <= pageHeight - margin;
}

function pointStrictlyInsideRect(point: Point, rect: Rect, tolerance: number): boolean {
  return point.x > rect.x + tolerance
    && point.x < rect.x + rect.width - tolerance
    && point.y > rect.y + tolerance
    && point.y < rect.y + rect.height - tolerance;
}

function strongestIntersection(
  current: SegmentIntersectionKind,
  next: SegmentIntersectionKind,
): SegmentIntersectionKind {
  const rank: Readonly<Record<SegmentIntersectionKind, number>> = {
    none: 0,
    touch: 1,
    cross: 2,
    overlap: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

export function segmentIntersectsRect(
  start: Point,
  end: Point,
  rect: Rect,
  tolerance = GEOMETRY_TOLERANCE,
): SegmentIntersectionKind {
  if (pointStrictlyInsideRect(start, rect, tolerance)
    || pointStrictlyInsideRect(end, rect, tolerance)) return 'cross';
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ] as const;
  let result: SegmentIntersectionKind = 'none';
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    if (next === undefined) continue;
    const current = corners[index];
    if (current === undefined) continue;
    result = strongestIntersection(
      result,
      classifySegmentIntersection(start, end, current, next, tolerance),
    );
  }
  return result;
}

function pointOnRectBoundary(point: Point, rect: Rect, tolerance: number): boolean {
  const withinX = point.x >= rect.x - tolerance
    && point.x <= rect.x + rect.width + tolerance;
  const withinY = point.y >= rect.y - tolerance
    && point.y <= rect.y + rect.height + tolerance;
  const onVertical = Math.abs(point.x - rect.x) <= tolerance
    || Math.abs(point.x - (rect.x + rect.width)) <= tolerance;
  const onHorizontal = Math.abs(point.y - rect.y) <= tolerance
    || Math.abs(point.y - (rect.y + rect.height)) <= tolerance;
  return (withinY && onVertical) || (withinX && onHorizontal);
}

export function routeRectHits(
  route: LeaderRoute,
  rect: Rect,
  ownTarget: Point,
  tolerance = GEOMETRY_TOLERANCE,
): readonly RouteRectHit[] {
  const hits: RouteRectHit[] = [];
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    if (start === undefined || end === undefined) continue;
    const kind = segmentIntersectsRect(start, end, rect, tolerance);
    const finalTargetTouch = index === route.points.length - 2
      && kind === 'touch'
      && pointsEqual(end, ownTarget, tolerance)
      && pointOnRectBoundary(end, rect, tolerance);
    if (kind !== 'none' && !finalTargetTouch) hits.push({ segmentIndex: index, kind });
  }
  return hits;
}

export function routeIntersections(
  first: LeaderRoute,
  second: LeaderRoute,
  tolerance = GEOMETRY_TOLERANCE,
): readonly SegmentIntersectionKind[] {
  const intersections: SegmentIntersectionKind[] = [];
  for (let aIndex = 0; aIndex < first.points.length - 1; aIndex += 1) {
    const aStart = first.points[aIndex];
    const aEnd = first.points[aIndex + 1];
    if (aStart === undefined || aEnd === undefined) continue;
    for (let bIndex = 0; bIndex < second.points.length - 1; bIndex += 1) {
      const bStart = second.points[bIndex];
      const bEnd = second.points[bIndex + 1];
      if (bStart === undefined || bEnd === undefined) continue;
      const kind = classifySegmentIntersection(aStart, aEnd, bStart, bEnd, tolerance);
      if (kind !== 'none') intersections.push(kind);
    }
  }
  return intersections;
}

export function generateCandidateBox(
  target: Point,
  width: number,
  height: number,
  placement: PlacementClass,
  pageWidth: number,
  pageHeight: number,
  margin = 12,
): Rect {
  const offset = 28;
  const diagonalOffset = offset * 0.7;
  const local: Readonly<Record<Exclude<PlacementClass, 'margin-right' | 'margin-left'>, Point>> = {
    right: { x: target.x + offset, y: target.y - height / 2 },
    'top-right': { x: target.x + diagonalOffset, y: target.y - height - diagonalOffset },
    'bottom-right': { x: target.x + diagonalOffset, y: target.y + diagonalOffset },
    top: { x: target.x - width / 2, y: target.y - height - offset },
    bottom: { x: target.x - width / 2, y: target.y + offset },
    left: { x: target.x - width - offset, y: target.y - height / 2 },
    'top-left': { x: target.x - width - diagonalOffset, y: target.y - height - diagonalOffset },
    'bottom-left': { x: target.x - width - diagonalOffset, y: target.y + diagonalOffset },
  };
  const marginY = Math.min(
    Math.max(target.y - height / 2, margin),
    pageHeight - margin - height,
  );
  if (placement === 'margin-right') {
    return { x: pageWidth - margin - width, y: marginY, width, height };
  }
  if (placement === 'margin-left') {
    return { x: margin, y: marginY, width, height };
  }
  return { ...local[placement], width, height };
}
