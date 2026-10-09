import type { PdfPoint, PdfRect, PsIsonoteLeaderPath } from './model';

const EPSILON = 1e-9;

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

export function rectArea(rect: PdfRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

export function intersectionArea(left: PdfRect, right: PdfRect): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

export function expandRect(rect: PdfRect, clearance: number): PdfRect {
  return {
    x: rect.x - clearance,
    y: rect.y - clearance,
    width: rect.width + clearance * 2,
    height: rect.height + clearance * 2,
  };
}

export function rectsOverlap(left: PdfRect, right: PdfRect, clearance = 0): boolean {
  return intersectionArea(expandRect(left, clearance), right) > 0;
}

export function rectInsidePage(
  rect: PdfRect,
  page: { width: number; height: number },
  margin: number,
): boolean {
  return (
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.width <= page.width - margin &&
    rect.y + rect.height <= page.height - margin
  );
}

export function pointInsideRect(point: PdfPoint, rect: PdfRect): boolean {
  return (
    point.x >= rect.x - EPSILON &&
    point.x <= rect.x + rect.width + EPSILON &&
    point.y >= rect.y - EPSILON &&
    point.y <= rect.y + rect.height + EPSILON
  );
}

function orientation(a: PdfPoint, b: PdfPoint, c: PdfPoint): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) <= EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: PdfPoint, b: PdfPoint, c: PdfPoint): boolean {
  return (
    b.x <= Math.max(a.x, c.x) + EPSILON &&
    b.x >= Math.min(a.x, c.x) - EPSILON &&
    b.y <= Math.max(a.y, c.y) + EPSILON &&
    b.y >= Math.min(a.y, c.y) - EPSILON
  );
}

export function segmentsIntersect(
  firstStart: PdfPoint,
  firstEnd: PdfPoint,
  secondStart: PdfPoint,
  secondEnd: PdfPoint,
): boolean {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(firstStart, secondStart, firstEnd)) return true;
  if (o2 === 0 && onSegment(firstStart, secondEnd, firstEnd)) return true;
  if (o3 === 0 && onSegment(secondStart, firstStart, secondEnd)) return true;
  if (o4 === 0 && onSegment(secondStart, firstEnd, secondEnd)) return true;
  return false;
}

export function segmentIntersectsRect(
  from: PdfPoint,
  to: PdfPoint,
  rect: PdfRect,
  clearance = 0,
): boolean {
  const expanded = expandRect(rect, clearance);
  if (pointInsideRect(from, expanded) || pointInsideRect(to, expanded)) return true;

  const topLeft = { x: expanded.x, y: expanded.y };
  const topRight = { x: expanded.x + expanded.width, y: expanded.y };
  const bottomRight = {
    x: expanded.x + expanded.width,
    y: expanded.y + expanded.height,
  };
  const bottomLeft = { x: expanded.x, y: expanded.y + expanded.height };

  return (
    segmentsIntersect(from, to, topLeft, topRight) ||
    segmentsIntersect(from, to, topRight, bottomRight) ||
    segmentsIntersect(from, to, bottomRight, bottomLeft) ||
    segmentsIntersect(from, to, bottomLeft, topLeft)
  );
}

export function pathIntersectsRect(
  path: PsIsonoteLeaderPath,
  rect: PdfRect,
  clearance = 0,
): boolean {
  for (let index = 0; index < path.points.length - 1; index += 1) {
    if (segmentIntersectsRect(path.points[index], path.points[index + 1], rect, clearance)) {
      return true;
    }
  }
  return false;
}

export function segmentLength(from: PdfPoint, to: PdfPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function pathLength(path: PsIsonoteLeaderPath): number {
  let total = 0;
  for (let index = 0; index < path.points.length - 1; index += 1) {
    total += segmentLength(path.points[index], path.points[index + 1]);
  }
  return total;
}

export function nearestBoxAttachment(box: PdfRect, anchor: PdfPoint): PdfPoint {
  const candidates: PdfPoint[] = [
    { x: clampNumber(anchor.x, box.x, box.x + box.width), y: box.y },
    { x: box.x + box.width, y: clampNumber(anchor.y, box.y, box.y + box.height) },
    { x: clampNumber(anchor.x, box.x, box.x + box.width), y: box.y + box.height },
    { x: box.x, y: clampNumber(anchor.y, box.y, box.y + box.height) },
  ];

  return candidates
    .map((point, index) => ({ point, index, distance: segmentLength(point, anchor) }))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)[0].point;
}

function simplifyOrthogonalPoints(points: PdfPoint[]): PdfPoint[] {
  const deduplicated = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > EPSILON || Math.abs(point.y - previous.y) > EPSILON;
  });
  if (deduplicated.length <= 2) return deduplicated;

  const simplified: PdfPoint[] = [deduplicated[0]];
  for (let index = 1; index < deduplicated.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduplicated[index];
    const next = deduplicated[index + 1];
    const sameVertical = Math.abs(previous.x - current.x) <= EPSILON &&
      Math.abs(current.x - next.x) <= EPSILON;
    const sameHorizontal = Math.abs(previous.y - current.y) <= EPSILON &&
      Math.abs(current.y - next.y) <= EPSILON;
    if (!sameVertical && !sameHorizontal) simplified.push(current);
  }
  simplified.push(deduplicated[deduplicated.length - 1]);
  return simplified;
}

export function orthogonalLeaderRoutes(
  box: PdfRect,
  anchor: PdfPoint,
  anchorRadius: number,
): PsIsonoteLeaderPath[] {
  const attachment = nearestBoxAttachment(box, anchor);
  const horizontalFirst = simplifyOrthogonalPoints([
    attachment,
    { x: anchor.x, y: attachment.y },
    anchor,
  ]);
  const verticalFirst = simplifyOrthogonalPoints([
    attachment,
    { x: attachment.x, y: anchor.y },
    anchor,
  ]);

  const routes = [horizontalFirst, verticalFirst];
  const unique = routes.filter((route, index) =>
    routes.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(route)) === index,
  );
  return unique.map((points) => ({ points, anchorRadius }));
}
