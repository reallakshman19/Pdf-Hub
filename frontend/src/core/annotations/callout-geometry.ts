import type { CalloutLeaderBranch, CalloutShelfStyle, Point2D, Rect } from './types';

export type CalloutLeaderStyle = 'straight' | 'elbow';
export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

interface CalloutPathOptions {
  kneePoint?: Point2D | null;
  leaderStyle?: CalloutLeaderStyle;
}

export interface NearestEdge {
  side: EdgeSide;
  point: Point2D;
}

export interface CalloutPath {
  edgePoint: Point2D;
  elbowPoint: Point2D;
  kneePoint: Point2D | null;
  anchorPoint: Point2D;
  points: Point2D[];
}

export interface MultiCalloutLeaderPath extends CalloutPath {
  id: string;
  arrowHead: 'open' | 'filled' | 'circle' | 'square' | 'slash' | 'diamond' | 'none';
}

export interface CadCalloutShelf {
  start: Point2D;
  end: Point2D;
  side: EdgeSide;
  length: number;
  style: CalloutShelfStyle;
}

export interface CadCalloutLeaderPath {
  id: string;
  points: Point2D[];
  anchorPoint: Point2D;
  kneePoint: Point2D | null;
  shelfPoint: Point2D;
  arrowHead: 'open' | 'filled' | 'circle' | 'square' | 'slash' | 'diamond' | 'none';
  arrowAngleRad: number;
}

export interface CadCalloutGeometryResult {
  shelf: CadCalloutShelf;
  leaders: CadCalloutLeaderPath[];
  boundingBox: Rect;
}

export interface CadCalloutOptions {
  shelfStyle?: CalloutShelfStyle;
  shelfLength?: number;
  snapAnglesDeg?: number[];
  arrowHead?: 'open' | 'filled' | 'circle' | 'square' | 'slash' | 'diamond' | 'none';
  leaderStyle?: CalloutLeaderStyle;
}

/**
 * Computes the routed leader points for multiple branching callout leaders.
 */
export function computeMultiCalloutPaths(
  leaders: CalloutLeaderBranch[],
  boxRect: Rect,
): MultiCalloutLeaderPath[] {
  return leaders.map((branch) => {
    const path = computeCalloutPath(branch.anchor, boxRect, {
      kneePoint: branch.knee,
      leaderStyle: branch.leaderStyle,
    });
    return {
      ...path,
      id: branch.id,
      arrowHead: branch.arrowHead ?? 'open',
    };
  });
}

function deduplicateConsecutivePoints(points: Point2D[]): Point2D[] {
  if (points.length <= 1) return points;
  const result: Point2D[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    if (Math.abs(prev.x - curr.x) > 0.001 || Math.abs(prev.y - curr.y) > 0.001) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Authoritative ASME Y14.2 / ISO 128 CAD Callout Geometry Engine.
 * Computes horizontal landing shelf, branching multi-leaders, exact arrowhead angles,
 * and unified non-inverted bounding box.
 */
export function computeCadCalloutGeometry(
  boxRect: Rect,
  leaders: CalloutLeaderBranch[],
  options?: CadCalloutOptions,
): CadCalloutGeometryResult {
  const safeBox: Rect = {
    x: Number.isFinite(boxRect.x) ? boxRect.x : 0,
    y: Number.isFinite(boxRect.y) ? boxRect.y : 0,
    width: Math.max(1, Number.isFinite(boxRect.width) ? boxRect.width : 1),
    height: Math.max(1, Number.isFinite(boxRect.height) ? boxRect.height : 1),
  };

  const effectiveBranches = leaders.length > 0
    ? leaders
    : [{ id: 'default-leader', anchor: { x: safeBox.x - 40, y: safeBox.y + safeBox.height / 2 } }];

  // 1. Determine primary exit side based on centroid of anchor points
  let sumX = 0;
  for (const b of effectiveBranches) {
    sumX += Number.isFinite(b.anchor.x) ? b.anchor.x : safeBox.x;
  }
  const avgX = sumX / effectiveBranches.length;
  const centerX = safeBox.x + safeBox.width / 2;
  const side: EdgeSide = avgX <= centerX ? 'left' : 'right';

  // 2. Compute horizontal landing shelf
  const shelfStyle: CalloutShelfStyle = options?.shelfStyle ?? 'underline';
  const rawShelfLen = options?.shelfLength ?? 16;
  const shelfLength = shelfStyle === 'none' ? 0 : Math.max(0, rawShelfLen);

  const shelfY = shelfStyle === 'underline'
    ? safeBox.y + safeBox.height
    : safeBox.y + safeBox.height / 2;

  const shelfStart: Point2D = side === 'left'
    ? { x: safeBox.x, y: shelfY }
    : { x: safeBox.x + safeBox.width, y: shelfY };

  const shelfEnd: Point2D = side === 'left'
    ? { x: safeBox.x - shelfLength, y: shelfY }
    : { x: safeBox.x + safeBox.width + shelfLength, y: shelfY };

  const shelf: CadCalloutShelf = {
    start: shelfStart,
    end: shelfEnd,
    side,
    length: shelfLength,
    style: shelfStyle,
  };

  // 3. Compute routed paths and arrowhead angles for each leader branch
  const computedLeaders: CadCalloutLeaderPath[] = effectiveBranches.map((branch) => {
    const clampedAnchor = clampOutsideRect(branch.anchor, safeBox);
    const style: CalloutLeaderStyle = branch.leaderStyle ?? options?.leaderStyle ?? 'elbow';
    const explicitKnee = branch.knee ?? null;

    let points: Point2D[];
    let kneePoint: Point2D | null = null;
    let arrowAngleRad = 0;

    if (style === 'straight') {
      points = deduplicateConsecutivePoints([shelf.start, shelf.end, clampedAnchor]);
      const prevPoint = points.length >= 2 ? points[points.length - 2] : shelf.end;
      arrowAngleRad = Math.atan2(clampedAnchor.y - prevPoint.y, clampedAnchor.x - prevPoint.x);
    } else {
      // Elbow / Oblique CAD leader:
      if (explicitKnee) {
        kneePoint = explicitKnee;
        points = deduplicateConsecutivePoints([shelf.start, shelf.end, kneePoint, clampedAnchor]);
        arrowAngleRad = Math.atan2(clampedAnchor.y - kneePoint.y, clampedAnchor.x - kneePoint.x);
      } else {
        // Default ASME Y14.2 oblique leader: shelf.end serves as the knee turning point
        kneePoint = { ...shelf.end };
        points = deduplicateConsecutivePoints([shelf.start, shelf.end, clampedAnchor]);
        arrowAngleRad = Math.atan2(clampedAnchor.y - shelf.end.y, clampedAnchor.x - shelf.end.x);
      }
    }

    return {
      id: branch.id,
      points,
      anchorPoint: clampedAnchor,
      kneePoint,
      shelfPoint: shelf.end,
      arrowHead: branch.arrowHead ?? options?.arrowHead ?? 'open',
      arrowAngleRad,
    };
  });

  // 4. Calculate overall bounding box encompassing box, shelf, and all leaders
  let minX = Math.min(safeBox.x, shelf.start.x, shelf.end.x);
  let maxX = Math.max(safeBox.x + safeBox.width, shelf.start.x, shelf.end.x);
  let minY = Math.min(safeBox.y, shelf.start.y, shelf.end.y);
  let maxY = Math.max(safeBox.y + safeBox.height, shelf.start.y, shelf.end.y);

  for (const leader of computedLeaders) {
    for (const pt of leader.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  // Padding around bounds to accommodate arrowheads and line width
  const pad = 6;
  const boundingBox: Rect = {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };

  return {
    shelf,
    leaders: computedLeaders,
    boundingBox,
  };
}

/**
 * Snaps candidate knee vector to standard engineering drafting angles (0, 15, 30, 45, 60, 90).
 */
export function snapKneeAngle(
  candidateKnee: Point2D,
  origin: Point2D,
  snapAnglesDeg: number[] = [0, 15, 30, 45, 60, 90],
  toleranceDeg = 4,
): Point2D {
  const dx = candidateKnee.x - origin.x;
  const dy = candidateKnee.y - origin.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1) return { ...candidateKnee };

  // Angle in range [-180, 180]
  const angleRad = Math.atan2(dy, dx);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360; // normalize to [0, 360)

  // Find candidate target angles across all quadrants for each base snap angle
  let closestTargetAngle: number | null = null;
  let minDiff = Infinity;

  for (const base of snapAnglesDeg) {
    const candidates = [
      base,
      (180 - base + 360) % 360,
      (180 + base) % 360,
      (360 - base) % 360,
    ];

    for (const target of candidates) {
      const diff = Math.abs(angleDeg - target);
      const wrappedDiff = Math.min(diff, 360 - diff);
      if (wrappedDiff <= toleranceDeg && wrappedDiff < minDiff) {
        minDiff = wrappedDiff;
        closestTargetAngle = target;
      }
    }
  }

  if (closestTargetAngle !== null) {
    const snappedRad = (closestTargetAngle * Math.PI) / 180;
    return {
      x: origin.x + dist * Math.cos(snappedRad),
      y: origin.y + dist * Math.sin(snappedRad),
    };
  }

  return { ...candidateKnee };
}

/**
 * Computes the routed leader points for a callout.
 * Output points are in the same coordinate space as the inputs.
 */
export function computeCalloutPath(
  anchorPoint: Point2D,
  boxRect: Rect,
  options?: CalloutPathOptions,
): CalloutPath {
  const targetForEdge = options?.kneePoint ?? anchorPoint;
  const nearest = findNearestEdge(targetForEdge, boxRect);
  const clampedAnchor = clampOutsideRect(anchorPoint, boxRect);
  const defaultKnee = computeDefaultKnee(clampedAnchor, nearest);
  const style = options?.leaderStyle === 'straight' ? 'straight' : 'elbow';
  const explicitKnee = options?.kneePoint ?? null;
  const kneePoint = style === 'elbow' ? explicitKnee ?? defaultKnee : null;
  const points = kneePoint
    ? [nearest.point, kneePoint, clampedAnchor]
    : [nearest.point, clampedAnchor];

  return {
    edgePoint: nearest.point,
    elbowPoint: defaultKnee,
    kneePoint,
    anchorPoint: clampedAnchor,
    points,
  };
}

/**
 * Finds the nearest attachment edge on the callout bounding box.
 * Prioritizes left/right side edges to preserve horizontal reading flow in CAD drafting.
 */
export function findNearestEdge(anchorPoint: Point2D, boxRect: Rect): NearestEdge {
  const { x, y, width, height } = boxRect;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Standard CAD convention: If target is outside the box horizontally, exit left or right side
  if (anchorPoint.x < x) {
    return { side: 'left', point: { x, y: centerY } };
  }
  if (anchorPoint.x > x + width) {
    return { side: 'right', point: { x: x + width, y: centerY } };
  }

  // Target is horizontally within the box span: exit top or bottom
  if (anchorPoint.y < centerY) {
    return { side: 'top', point: { x: centerX, y } };
  }
  return { side: 'bottom', point: { x: centerX, y: y + height } };
}

/**
 * Computes a strictly orthogonal knee (elbow) point.
 * For left/right edges, produces a horizontal landing shelf followed by a vertical drop/rise.
 * For top/bottom edges, produces a vertical stem followed by a horizontal run.
 */
export function computeDefaultKnee(anchorPoint: Point2D, nearest: NearestEdge): Point2D {
  if (nearest.side === 'left' || nearest.side === 'right') {
    return {
      x: anchorPoint.x,
      y: nearest.point.y,
    };
  }

  return {
    x: nearest.point.x,
    y: anchorPoint.y,
  };
}

/**
 * Magnetically snaps a candidate knee point to orthogonal lines relative to
 * the callout edge point and the anchor point.
 */
export function snapKneeToOrtho(
  candidateKnee: Point2D,
  edgePoint: Point2D,
  anchorPoint: Point2D,
  edgeSide: EdgeSide,
  snapThreshold = 10,
): Point2D {
  const snapped = { ...candidateKnee };

  if (edgeSide === 'left' || edgeSide === 'right') {
    // Snap to horizontal shelf from edgePoint (Δy = 0)
    if (Math.abs(candidateKnee.y - edgePoint.y) <= snapThreshold) {
      snapped.y = edgePoint.y;
    }
    // Snap to vertical drop aligned with anchorPoint (Δx = 0)
    if (Math.abs(candidateKnee.x - anchorPoint.x) <= snapThreshold) {
      snapped.x = anchorPoint.x;
    }
  } else {
    // Snap to vertical stem from edgePoint (Δx = 0)
    if (Math.abs(candidateKnee.x - edgePoint.x) <= snapThreshold) {
      snapped.x = edgePoint.x;
    }
    // Snap to horizontal run aligned with anchorPoint (Δy = 0)
    if (Math.abs(candidateKnee.y - anchorPoint.y) <= snapThreshold) {
      snapped.y = anchorPoint.y;
    }
  }

  return snapped;
}

function clampOutsideRect(point: Point2D, rect: Rect): Point2D {
  const { x, y, width, height } = rect;
  const insideX = point.x >= x && point.x <= x + width;
  const insideY = point.y >= y && point.y <= y + height;
  if (!insideX || !insideY) return point;

  const dists = {
    top: point.y - y,
    bottom: y + height - point.y,
    left: point.x - x,
    right: x + width - point.x,
  };
  const minKey = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];

  if (minKey === 'top') {
    return { ...point, y: y - 10 };
  }
  if (minKey === 'bottom') {
    return { ...point, y: y + height + 10 };
  }
  if (minKey === 'left') {
    return { ...point, x: x - 10 };
  }
  return { ...point, x: x + width + 10 };
}
