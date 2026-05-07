import type { Point2D, Rect } from './types';

export type CalloutLeaderStyle = 'straight' | 'elbow';
type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

interface CalloutPathOptions {
  kneePoint?: Point2D | null;
  leaderStyle?: CalloutLeaderStyle;
}

interface NearestEdge {
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

/**
 * Computes the routed leader points for a callout.
 * Output points are in the same coordinate space as the inputs.
 */
export function computeCalloutPath(
  anchorPoint: Point2D,
  boxRect: Rect,
  options?: CalloutPathOptions,
): CalloutPath {
  const nearest = findNearestEdge(anchorPoint, boxRect);
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

function findNearestEdge(anchorPoint: Point2D, boxRect: Rect): NearestEdge {
  const { x, y, width, height } = boxRect;
  const candidates: NearestEdge[] = [
    { side: 'top', point: { x: x + width / 2, y } },
    { side: 'bottom', point: { x: x + width / 2, y: y + height } },
    { side: 'left', point: { x, y: y + height / 2 } },
    { side: 'right', point: { x: x + width, y: y + height / 2 } },
  ];

  let nearest = candidates[0];
  let minDistance = Infinity;

  for (const candidate of candidates) {
    const distance = Math.hypot(
      candidate.point.x - anchorPoint.x,
      candidate.point.y - anchorPoint.y,
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = candidate;
    }
  }

  return nearest;
}

function computeDefaultKnee(anchorPoint: Point2D, nearest: NearestEdge): Point2D {
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
