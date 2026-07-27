import { type Point, type Rect } from './model';
import { type PlacementClass } from './layoutTypes';
import { getBoxAnchorTowards } from './vectorCalloutPlan';

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  if (a.width < 0 || a.height < 0 || b.width < 0 || b.height < 0) return false;
  if ([a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].some(v => !Number.isFinite(v))) return false;
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width > b.x - margin &&
    a.y < b.y + b.height + margin &&
    a.y + a.height > b.y - margin
  );
}

export function isInsidePage(box: Rect, pageWidth: number, pageHeight: number, margin = 12): boolean {
  if (box.width < 0 || box.height < 0) return false;
  if ([box.x, box.y, box.width, box.height, pageWidth, pageHeight, margin].some(v => !Number.isFinite(v))) return false;
  return (
    box.x >= margin &&
    box.y >= margin &&
    box.x + box.width <= pageWidth - margin &&
    box.y + box.height <= pageHeight - margin
  );
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0; // collinear
  return val > 0 ? 1 : 2; // clock or counterclock
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

export function linesIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  if ([p1.x, p1.y, q1.x, q1.y, p2.x, p2.y, q2.x, q2.y].some(v => !Number.isFinite(v))) {
    return false;
  }
  if (p1.x === q1.x && p1.y === q1.y) return false;
  if (p2.x === q2.x && p2.y === q2.y) return false;

  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

export function lineIntersectsRect(start: Point, end: Point, rect: Rect, isOwnBox = false): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  if ([start.x, start.y, end.x, end.y, rect.x, rect.y, rect.width, rect.height].some(v => !Number.isFinite(v))) return false;
  if (start.x === end.x && start.y === end.y) return false;

  if (!isOwnBox) {
    if (
      start.x >= rect.x - 1e-9 && start.x <= rect.x + rect.width + 1e-9 &&
      start.y >= rect.y - 1e-9 && start.y <= rect.y + rect.height + 1e-9
    ) return true;
    if (
      end.x >= rect.x - 1e-9 && end.x <= rect.x + rect.width + 1e-9 &&
      end.y >= rect.y - 1e-9 && end.y <= rect.y + rect.height + 1e-9
    ) return true;
  } else {
    if (
      start.x > rect.x + 0.5 && start.x < rect.x + rect.width - 0.5 &&
      start.y > rect.y + 0.5 && start.y < rect.y + rect.height - 0.5
    ) return true;
  }

  const tl = { x: rect.x, y: rect.y };
  const tr = { x: rect.x + rect.width, y: rect.y };
  const bl = { x: rect.x, y: rect.y + rect.height };
  const br = { x: rect.x + rect.width, y: rect.y + rect.height };

  if (isOwnBox) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    const step = Math.min(0.1, len * 0.1);
    const shiftedStart = { x: start.x + (dx / len) * step, y: start.y + (dy / len) * step };
    return lineIntersectsRect(shiftedStart, end, rect, false);
  }

  return (
    linesIntersect(start, end, tl, tr) ||
    linesIntersect(start, end, tr, br) ||
    linesIntersect(start, end, br, bl) ||
    linesIntersect(start, end, bl, tl)
  );
}

export function polylineIntersectsRect(points: readonly Point[], rect: Rect, isOwnBox = false): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const isFirstSegment = i === 0 && isOwnBox;
    if (lineIntersectsRect(points[i], points[i + 1], rect, isFirstSegment)) {
      return true;
    }
  }
  return false;
}

export function polylinesIntersect(pA: readonly Point[], pB: readonly Point[]): boolean {
  for (let i = 0; i < pA.length - 1; i += 1) {
    for (let j = 0; j < pB.length - 1; j += 1) {
      if (linesIntersect(pA[i], pA[i + 1], pB[j], pB[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

export function polylineIntersectsSegment(points: readonly Point[], start: Point, end: Point, clearance = 0): boolean {
  if (clearance <= 0) {
    for (let i = 0; i < points.length - 1; i += 1) {
      if (linesIntersect(points[i], points[i + 1], start, end)) {
        return true;
      }
    }
    return false;
  }
  const minX = Math.min(start.x, end.x) - clearance;
  const minY = Math.min(start.y, end.y) - clearance;
  const width = Math.abs(end.x - start.x) + clearance * 2;
  const height = Math.abs(end.y - start.y) + clearance * 2;
  return polylineIntersectsRect(points, { x: minX, y: minY, width, height });
}

/**
 * Generates initial bounding geometry for all 10 placement classes.
 */
export function generateCandidateBox(
  target: Point,
  width: number,
  height: number,
  placement: PlacementClass,
  pageWidth: number,
  pageHeight: number,
  margin = 12,
): Rect {
  const offset = 28; // Distance from target point to box edge
  let x = target.x;
  let y = target.y;

  switch (placement) {
    case 'top':
      x = target.x - width / 2;
      y = target.y - height - offset;
      break;
    case 'top-right':
      x = target.x + offset * 0.7;
      y = target.y - height - offset * 0.7;
      break;
    case 'right':
      x = target.x + offset;
      y = target.y - height / 2;
      break;
    case 'bottom-right':
      x = target.x + offset * 0.7;
      y = target.y + offset * 0.7;
      break;
    case 'bottom':
      x = target.x - width / 2;
      y = target.y + offset;
      break;
    case 'bottom-left':
      x = target.x - width - offset * 0.7;
      y = target.y + offset * 0.7;
      break;
    case 'left':
      x = target.x - width - offset;
      y = target.y - height / 2;
      break;
    case 'top-left':
      x = target.x - width - offset * 0.7;
      y = target.y - height - offset * 0.7;
      break;
    case 'margin-right':
      x = pageWidth - margin - width;
      y = target.y - height / 2;
      break;
    case 'margin-left':
      x = margin;
      y = target.y - height / 2;
      break;
  }

  const clampedX = Math.max(margin, Math.min(x, pageWidth - margin - width));
  const clampedY = Math.max(margin, Math.min(y, pageHeight - margin - height));
  return { x: clampedX, y: clampedY, width, height };
}

/**
 * Evaluates leader geometry and returns start/end points along with orthogonality score.
 */
export function evaluateLeaderGeometry(box: Rect, target: Point): { start: Point; end: Point; isOrthogonal: boolean; length: number } {
  const start = getBoxAnchorTowards(box, target);
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  const isOrthogonal = Math.abs(dx) < 8 || Math.abs(dy) < 8;
  return { start, end: target, isOrthogonal, length };
}
