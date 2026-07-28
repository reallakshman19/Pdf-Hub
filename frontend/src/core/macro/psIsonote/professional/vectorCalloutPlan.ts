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
  // Always attach to Left or Right vertical side boundary for professional horizontal shelf leaders
  const isTargetLeft = target.x < centerX;
  return {
    x: isTargetLeft ? box.x : box.x + box.width,
    y: clamp(target.y, box.y + 12, box.y + box.height - 12),
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
  const fontSize = options.fontSize ?? 10;
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

  // 1. Leader line polyline segments from box anchor to target point (Oblique 2-line leader with arrows)
  let leaderPoints: readonly Point[];
  let anchorRadius = 1.5;
  if (options.leaderPath) {
    leaderPoints = options.leaderPath.points;
    anchorRadius = options.leaderPath.anchorRadius;
  } else {
    if (boxAnchor.x === targetPoint.x || boxAnchor.y === targetPoint.y) {
      leaderPoints = [boxAnchor, targetPoint];
    } else {
      // Oblique 2-line leader: horizontal shelf exiting callout box, then diagonal oblique segment to target point
      const shelfLength = 24;
      const isTargetLeft = targetPoint.x < (box.x + box.width / 2);
      const shelfEnd: Point = {
        x: isTargetLeft ? boxAnchor.x - shelfLength : boxAnchor.x + shelfLength,
        y: boxAnchor.y,
      };
      leaderPoints = [boxAnchor, shelfEnd, targetPoint];
    }
  }

  for (let i = 0; i < leaderPoints.length - 1; i += 1) {
    const isTerminalSegment = (i === leaderPoints.length - 2);
    if (isTerminalSegment) {
      primitives.push({
        type: 'arrow',
        start: { ...leaderPoints[i] },
        end: { ...leaderPoints[i + 1] },
        color: style.leaderColor,
        width: style.borderWidth,
        headStyle: 'filled-triangle',
        headSize: 6,
      });
    } else {
      primitives.push({
        type: 'line',
        start: { ...leaderPoints[i] },
        end: { ...leaderPoints[i + 1] },
        color: style.leaderColor,
        width: style.borderWidth,
        style: 'solid',
      });
    }
  }

  // 2. Leader origin anchor node on callout box perimeter (leaves target arrowhead cleanly unobstructed)
  primitives.push({
    type: 'circle',
    center: { ...boxAnchor },
    radius: 1.2,
    fillColor: style.leaderColor,
    borderColor: style.leaderColor,
    borderWidth: 0.5,
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

  // 5. Confidence badge (top-right CAD annotation chip)
  if (confidence && style.fontSize >= 8) {
    const c = confidence.trim().toUpperCase();
    const badgeText = c.includes('HIGH') || c.startsWith('H') ? '[HIGH]' :
                      c.includes('MED') || c.startsWith('M') ? '[MED]' : '[LOW]';
    primitives.push({
      type: 'text',
      position: { x: box.x + box.width - dims.padding - 40, y: currentY },
      text: badgeText,
      fontSize: Math.max(7, style.fontSize - 2),
      fontFamily: style.fontFamily,
      color: style.textColor,
      fontWeight: 'bold',
    });
  }

  // 6. Horizontal rule dividing Tag Header from Note Body
  currentY += dims.lineHeight * 0.3;
  primitives.push({
    type: 'line',
    start: { x: box.x + dims.padding, y: currentY },
    end: { x: box.x + box.width - dims.padding, y: currentY },
    color: style.borderColor,
    width: 0.5,
    style: 'solid',
  });
  currentY += dims.lineHeight * 0.8;

  // 7. Text primitives: Note body lines
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
