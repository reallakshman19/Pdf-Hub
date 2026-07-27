import type { Point, Rect } from './model';
import { getBoxAnchorTowards } from './vectorCalloutPlan';
import { GEOMETRY_TOLERANCE, pointsEqual } from './layoutGeometry';
import type { LeaderRoute, LeaderRouteKind } from './layoutTypes';

const ROUTE_KIND_ORDER: readonly LeaderRouteKind[] = [
  'direct',
  'one-elbow-hv',
  'one-elbow-vh',
  'two-elbow-hvh',
  'two-elbow-vhv',
];

function assertFinitePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Leader route points must be finite.');
  }
}

function snapOrthogonalPoint(previous: Point, point: Point, tolerance: number): Point {
  const sameX = Math.abs(previous.x - point.x) <= tolerance;
  const sameY = Math.abs(previous.y - point.y) <= tolerance;
  if (!sameX && !sameY) throw new Error('Leader route contains a diagonal segment.');
  return {
    x: sameX ? previous.x : point.x,
    y: sameY ? previous.y : point.y,
  };
}

function isCollinearMiddle(first: Point, middle: Point, last: Point): boolean {
  if (first.x === middle.x && middle.x === last.x) {
    return middle.y >= Math.min(first.y, last.y) && middle.y <= Math.max(first.y, last.y);
  }
  if (first.y === middle.y && middle.y === last.y) {
    return middle.x >= Math.min(first.x, last.x) && middle.x <= Math.max(first.x, last.x);
  }
  return false;
}

export function normalizeRoutePoints(
  input: readonly [Point, Point, ...Point[]],
  tolerance = GEOMETRY_TOLERANCE,
): readonly [Point, Point, ...Point[]] {
  const normalized: Point[] = [];
  for (const source of input) {
    assertFinitePoint(source);
    const previous = normalized[normalized.length - 1];
    if (previous === undefined) {
      normalized.push({ ...source });
      continue;
    }
    const snapped = snapOrthogonalPoint(previous, source, tolerance);
    if (!pointsEqual(previous, snapped, tolerance)) normalized.push(snapped);
  }

  let changed = true;
  while (changed && normalized.length > 2) {
    changed = false;
    for (let index = 1; index < normalized.length - 1; index += 1) {
      const first = normalized[index - 1];
      const middle = normalized[index];
      const last = normalized[index + 1];
      if (first && middle && last && isCollinearMiddle(first, middle, last)) {
        normalized.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  if (normalized.length < 2) throw new Error('Leader route must contain at least two distinct points.');
  return normalized as [Point, Point, ...Point[]];
}

function deriveRouteKind(points: readonly [Point, Point, ...Point[]]): LeaderRouteKind {
  if (points.length === 2) return 'direct';
  const first = points[0];
  const second = points[1];
  if (points.length === 3) return first.y === second.y ? 'one-elbow-hv' : 'one-elbow-vh';
  return first.y === second.y ? 'two-elbow-hvh' : 'two-elbow-vhv';
}

export function routeLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start && end) length += Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
  }
  return length;
}

export function createLeaderRoute(
  points: readonly [Point, Point, ...Point[]],
): LeaderRoute {
  const normalized = normalizeRoutePoints(points);
  return {
    kind: deriveRouteKind(normalized),
    points: normalized,
    length: routeLength(normalized),
  };
}

function routeSignature(route: LeaderRoute): string {
  return route.points.map((point) => `${point.x},${point.y}`).join('|');
}

function candidatePointSets(start: Point, target: Point): readonly (readonly [Point, Point, ...Point[]])[] {
  const midX = (start.x + target.x) / 2;
  const midY = (start.y + target.y) / 2;
  const candidates: (readonly [Point, Point, ...Point[]])[] = [];
  if (start.x === target.x || start.y === target.y) candidates.push([start, target]);
  candidates.push(
    [start, { x: target.x, y: start.y }, target],
    [start, { x: start.x, y: target.y }, target],
    [start, { x: midX, y: start.y }, { x: midX, y: target.y }, target],
    [start, { x: start.x, y: midY }, { x: target.x, y: midY }, target],
  );
  return candidates;
}

export function generateLeaderRoutes(box: Rect, target: Point): readonly LeaderRoute[] {
  const start = getBoxAnchorTowards(box, target);
  const unique = new Map<string, LeaderRoute>();
  for (const points of candidatePointSets(start, target)) {
    const route = createLeaderRoute(points);
    unique.set(routeSignature(route), route);
  }
  return [...unique.values()].sort(
    (a, b) => ROUTE_KIND_ORDER.indexOf(a.kind) - ROUTE_KIND_ORDER.indexOf(b.kind),
  );
}

export function leaderRouteKindIndex(kind: LeaderRouteKind): number {
  return ROUTE_KIND_ORDER.indexOf(kind);
}
