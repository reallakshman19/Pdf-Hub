import type { CalloutLeaderBranch, Point2D, Rect } from './types';

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
