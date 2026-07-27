import {
  type Point,
  type Rect,
  type ProfessionalCalloutModel,
  type VectorPrimitive,
  getStyleContract,
  deepFreeze,
} from './model';
import { calculateCalloutBoxDimensions } from './typography';

export interface LeaderPath {
  points: readonly [Point, Point, ...Point[]];
  anchorRadius: number;
}

export interface VectorCalloutPlanOptions {
  width?: number;
  fontSize?: number;
  isReview?: boolean;
  leaderPath?: LeaderPath;
}

export function assertValidRect(rect: Rect, label: string): void {
  const values = [rect.x, rect.y, rect.width, rect.height];

  if (!values.every(Number.isFinite)) {
    throw new Error(`${label} contains a non-finite coordinate.`);
  }

  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(`${label} must have positive width and height.`);
  }
}

/**
 * Calculates the best anchor point on the perimeter of the callout rectangle towards the target point.
 */
export function getBoxAnchorTowards(box: Rect, target: Point): Point {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Determine which side is closest or most direct to target
  const dx = target.x - centerX;
  const dy = target.y - centerY;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Connect to left or right edge
    return {
      x: dx > 0 ? box.x + box.width : box.x,
      y: clamp(target.y, box.y + 4, box.y + box.height - 4),
    };
  }
  // Connect to top or bottom edge
  return {
    x: clamp(target.x, box.x + 4, box.x + box.width - 4),
    y: dy > 0 ? box.y + box.height : box.y,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Builds an auditable, pure vector callout plan consisting strictly of rectangle, line, circle, and text primitives.
 * Enforces zero raster image fallback.
 */
export function buildVectorCalloutPlan(
  id: string,
  psNo: string,
  tag: string,
  note: string,
  confidence: string,
  targetPoint: Point,
  initialBox: Omit<Rect, 'height'> & { height?: number },
  options: VectorCalloutPlanOptions = {},
): ProfessionalCalloutModel {
  const isReview = options.isReview ?? false;
  const fontSize = options.fontSize ?? 9;
  const width = options.width ?? initialBox.width ?? 200;
  
  const style = getStyleContract(isReview, fontSize);
  const dims = calculateCalloutBoxDimensions(tag, note, confidence, width, style.fontSize);
  
  const requestedHeight = initialBox.height ?? 0;
  const height = Math.max(dims.height, requestedHeight);

  const box: Rect = {
    x: initialBox.x,
    y: initialBox.y,
    width: dims.width,
    height,
  };

  assertValidRect(box, `Callout box geometry for ${id}`);

  const boxAnchor = getBoxAnchorTowards(box, targetPoint);
  const primitives: VectorPrimitive[] = [];

  // 1. Leader line polyline segments from box anchor to target point
  let leaderPoints: readonly Point[];
  let anchorRadius = 2;
  if (options.leaderPath) {
    leaderPoints = options.leaderPath.points;
    anchorRadius = options.leaderPath.anchorRadius;
  } else {
    if (boxAnchor.x === targetPoint.x || boxAnchor.y === targetPoint.y) {
      leaderPoints = [boxAnchor, targetPoint];
    } else {
      const isHorizontalExit = Math.abs(targetPoint.x - (box.x + box.width / 2)) > Math.abs(targetPoint.y - (box.y + box.height / 2));
      const knee: Point = isHorizontalExit
        ? { x: targetPoint.x, y: boxAnchor.y }
        : { x: boxAnchor.x, y: targetPoint.y };
      leaderPoints = [boxAnchor, knee, targetPoint];
    }
  }

  for (let i = 0; i < leaderPoints.length - 1; i += 1) {
    primitives.push({
      type: 'line',
      start: leaderPoints[i],
      end: leaderPoints[i + 1],
      color: style.leaderColor,
      width: 1,
      style: 'solid',
    });
  }

  // 2. Target anchor point dot
  const targetEnd = leaderPoints[leaderPoints.length - 1] ?? targetPoint;
  primitives.push({
    type: 'circle',
    center: targetEnd,
    radius: anchorRadius,
    fillColor: style.leaderColor,
    borderColor: style.leaderColor,
    borderWidth: 1,
  });

  // 3. Main callout box rectangle
  primitives.push({
    type: 'rectangle',
    rect: { ...box },
    fillColor: style.backgroundColor,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    cornerRadius: style.cornerRadius,
  });

  // 4. Text primitive: Tag header (bold)
  let currentY = box.y + dims.padding + dims.lineHeight * 0.8;
  primitives.push({
    type: 'text',
    position: { x: box.x + dims.padding, y: currentY },
    text: dims.tagLine,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    color: style.textColor,
    fontWeight: 'bold',
  });

  currentY += dims.lineHeight * 1.1;

  // 5. Text primitives: Note body lines
  for (const line of dims.noteLines) {
    primitives.push({
      type: 'text',
      position: { x: box.x + dims.padding, y: currentY },
      text: line,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      color: style.textColor,
      fontWeight: 'normal',
    });
    currentY += dims.lineHeight;
  }

  // Auditing check: Ensure no invalid primitives were injected
  for (const p of primitives) {
    if ((p.type as string) === 'raster' || (p.type as string) === 'image') {
      throw new Error('Violation of engineering vector contract: raster image primitive detected.');
    }
  }

  return deepFreeze({
    id,
    psNo,
    tag,
    note,
    confidence,
    targetPoint,
    box,
    style,
    primitives,
  });
}
