import { type Point, type Rect } from './model';
import { type PlacementClass } from './layoutTypes';
import { getBoxAnchorTowards } from './vectorCalloutPlan';

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width > b.x - margin &&
    a.y < b.y + b.height + margin &&
    a.y + a.height > b.y - margin
  );
}

export function isInsidePage(box: Rect, pageWidth: number, pageHeight: number, margin = 12): boolean {
  return (
    box.x >= margin &&
    box.y >= margin &&
    box.x + box.width <= pageWidth - margin &&
    box.y + box.height <= pageHeight - margin
  );
}

/**
 * Helper to check line interval orientation and intersection.
 */
function ccw(A: Point, B: Point, C: Point): boolean {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

export function linesIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

export function lineIntersectsRect(start: Point, end: Point, rect: Rect): boolean {
  // Check if either point is inside the rectangle
  if (
    start.x >= rect.x && start.x <= rect.x + rect.width &&
    start.y >= rect.y && start.y <= rect.y + rect.height
  ) return true;
  
  if (
    end.x >= rect.x && end.x <= rect.x + rect.width &&
    end.y >= rect.y && end.y <= rect.y + rect.height
  ) return true;

  // Check intersection with all four segments of rectangle
  const tl = { x: rect.x, y: rect.y };
  const tr = { x: rect.x + rect.width, y: rect.y };
  const bl = { x: rect.x, y: rect.y + rect.height };
  const br = { x: rect.x + rect.width, y: rect.y + rect.height };

  return (
    linesIntersect(start, end, tl, tr) ||
    linesIntersect(start, end, tr, br) ||
    linesIntersect(start, end, br, bl) ||
    linesIntersect(start, end, bl, tl)
  );
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
  
  // Considered orthogonal if angle is close to horizontal or vertical (within 5 deg or dx/dy near zero)
  const isOrthogonal = Math.abs(dx) < 8 || Math.abs(dy) < 8;
  return { start, end: target, isOrthogonal, length };
}
