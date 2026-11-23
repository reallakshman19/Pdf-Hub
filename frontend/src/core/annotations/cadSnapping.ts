/**
 * CAD Magnetic Geometry Snapping Engine.
 *
 * Implements high-precision magnetic snapping for CAD, architectural, and piping
 * markups according to ISO 32000 and engineering CAD drafting conventions:
 * 1. Endpoint & Vertex Snapping (line ends, polygon vertices, callout anchors)
 * 2. Segment Midpoint Snapping (center of lines and bounding box edges)
 * 3. Bounding Box Corner & Center Snapping
 * 4. Orthogonal & Isometric Angle Locking (Shift-key 45° / 90° constraint)
 */

import type { Point2D, PdfAnnotation } from './types';

export type SnapPointKind = 'endpoint' | 'midpoint' | 'vertex' | 'center' | 'corner';

export interface SnapPoint {
  point: Point2D;
  kind: SnapPointKind;
  annotationId?: string;
  sourceDescription?: string;
}

export interface SnapResult {
  point: Point2D;
  distance: number;
  snapped: boolean;
  kind?: SnapPointKind;
  annotationId?: string;
}

/** Default magnetic capture radius in points (approx 8-10px viewport) */
export const DEFAULT_SNAP_THRESHOLD = 8;

/**
 * Extracts all valid magnetic snap points from an annotation.
 */
export function extractSnapPointsFromAnnotation(annotation: PdfAnnotation): SnapPoint[] {
  const points: SnapPoint[] = [];
  const id = annotation.id;

  // 1. Explicit coordinate points (lines, arrows, polygons, clouds)
  const rawPoints = (annotation.data?.points as number[]) ?? [];
  if (Array.isArray(rawPoints) && rawPoints.length >= 4) {
    const coords: Point2D[] = [];
    for (let i = 0; i < rawPoints.length; i += 2) {
      if (Number.isFinite(rawPoints[i]) && Number.isFinite(rawPoints[i + 1])) {
        coords.push({ x: rawPoints[i], y: rawPoints[i + 1] });
      }
    }

    const isLinear = annotation.type === 'line' || annotation.type === 'arrow';
    const vertexKind: SnapPointKind = isLinear ? 'endpoint' : 'vertex';

    // Add each vertex / endpoint
    coords.forEach((pt, index) => {
      points.push({
        point: { x: pt.x, y: pt.y },
        kind: vertexKind,
        annotationId: id,
        sourceDescription: `${annotation.type} point ${index + 1}`,
      });
    });

    // Add midpoints between consecutive vertices
    for (let i = 0; i < coords.length - 1; i++) {
      points.push({
        point: {
          x: (coords[i].x + coords[i + 1].x) / 2,
          y: (coords[i].y + coords[i + 1].y) / 2,
        },
        kind: 'midpoint',
        annotationId: id,
        sourceDescription: `${annotation.type} segment ${i + 1} midpoint`,
      });
    }

    // Closed polygon / cloud: add midpoint between last and first vertex
    if (!isLinear && coords.length > 2) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      points.push({
        point: {
          x: (first.x + last.x) / 2,
          y: (first.y + last.y) / 2,
        },
        kind: 'midpoint',
        annotationId: id,
        sourceDescription: `${annotation.type} closing segment midpoint`,
      });
    }
  }

  // 2. Callout leader anchors & knees
  if (annotation.type === 'callout') {
    const anchor = annotation.data?.anchor as Point2D | undefined;
    if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
      points.push({
        point: { x: anchor.x, y: anchor.y },
        kind: 'endpoint',
        annotationId: id,
        sourceDescription: 'callout leader anchor',
      });
    }

    const knee = annotation.data?.knee as Point2D | undefined;
    if (knee && Number.isFinite(knee.x) && Number.isFinite(knee.y)) {
      points.push({
        point: { x: knee.x, y: knee.y },
        kind: 'vertex',
        annotationId: id,
        sourceDescription: 'callout leader knee',
      });
    }

    const leaders = (annotation.data?.leaders as Array<{ anchor?: Point2D; knee?: Point2D | null }>) ?? [];
    leaders.forEach((branch, bIdx) => {
      if (branch.anchor && Number.isFinite(branch.anchor.x) && Number.isFinite(branch.anchor.y)) {
        points.push({
          point: { x: branch.anchor.x, y: branch.anchor.y },
          kind: 'endpoint',
          annotationId: id,
          sourceDescription: `callout leader branch ${bIdx + 1} anchor`,
        });
      }
      if (branch.knee && Number.isFinite(branch.knee.x) && Number.isFinite(branch.knee.y)) {
        points.push({
          point: { x: branch.knee.x, y: branch.knee.y },
          kind: 'vertex',
          annotationId: id,
          sourceDescription: `callout leader branch ${bIdx + 1} knee`,
        });
      }
    });
  }

  // 3. Bounding box corners, edge midpoints, and center
  const rect = annotation.rect;
  if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.width > 0 && rect.height > 0) {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;

    // Corners
    points.push({ point: { x: left, y: top }, kind: 'corner', annotationId: id, sourceDescription: 'top-left corner' });
    points.push({ point: { x: right, y: top }, kind: 'corner', annotationId: id, sourceDescription: 'top-right corner' });
    points.push({ point: { x: right, y: bottom }, kind: 'corner', annotationId: id, sourceDescription: 'bottom-right corner' });
    points.push({ point: { x: left, y: bottom }, kind: 'corner', annotationId: id, sourceDescription: 'bottom-left corner' });

    // Edge Midpoints
    points.push({ point: { x: midX, y: top }, kind: 'midpoint', annotationId: id, sourceDescription: 'top edge midpoint' });
    points.push({ point: { x: right, y: midY }, kind: 'midpoint', annotationId: id, sourceDescription: 'right edge midpoint' });
    points.push({ point: { x: midX, y: bottom }, kind: 'midpoint', annotationId: id, sourceDescription: 'bottom edge midpoint' });
    points.push({ point: { x: left, y: midY }, kind: 'midpoint', annotationId: id, sourceDescription: 'left edge midpoint' });

    // Center
    points.push({ point: { x: midX, y: midY }, kind: 'center', annotationId: id, sourceDescription: 'box center' });
  }

  return points;
}

/**
 * Gathers all snap candidates across annotations for a given page.
 */
export function collectPageSnapPoints(
  annotations: PdfAnnotation[],
  currentPage: number,
  excludeIds?: string[],
): SnapPoint[] {
  const points: SnapPoint[] = [];
  for (const ann of annotations) {
    if (ann.pageNumber !== currentPage) continue;
    if (excludeIds && excludeIds.includes(ann.id)) continue;
    points.push(...extractSnapPointsFromAnnotation(ann));
  }
  return points;
}

/**
 * Finds the nearest magnetic snap candidate within threshold distance of cursor.
 */
export function findSnapTarget(
  cursor: Point2D,
  snapPoints: SnapPoint[],
  threshold: number = DEFAULT_SNAP_THRESHOLD,
): SnapResult {
  let closest: SnapPoint | null = null;
  let minDistance = Infinity;

  for (const candidate of snapPoints) {
    const dist = Math.hypot(candidate.point.x - cursor.x, candidate.point.y - cursor.y);
    if (dist <= threshold && dist < minDistance) {
      minDistance = dist;
      closest = candidate;
    }
  }

  if (closest) {
    return {
      point: { x: closest.point.x, y: closest.point.y },
      distance: minDistance,
      snapped: true,
      kind: closest.kind,
      annotationId: closest.annotationId,
    };
  }

  return {
    point: { x: cursor.x, y: cursor.y },
    distance: Infinity,
    snapped: false,
  };
}

/**
 * Resolves the endpoint of a two-click line/arrow from the actual pointer
 * position: Shift constrains to 45° increments, otherwise magnetic snapping
 * applies. Used by both the hover preview and the committing click so the
 * created geometry never depends on a possibly stale hover state.
 */
export function resolveLineEndpoint(
  origin: Point2D,
  cursor: Point2D,
  snapPoints: SnapPoint[],
  shiftKey: boolean,
): { point: Point2D; snapResult: SnapResult | null; angleConstrained: boolean } {
  if (shiftKey) {
    return { point: constrainAngleTo45(origin, cursor), snapResult: null, angleConstrained: true };
  }
  const snapResult = findSnapTarget(cursor, snapPoints);
  if (snapResult.snapped) {
    return { point: snapResult.point, snapResult, angleConstrained: false };
  }
  return { point: { x: cursor.x, y: cursor.y }, snapResult: null, angleConstrained: false };
}

/**
 * Constrains a target point relative to an origin point to 45° angle increments
 * (0°, 45°, 90°, 135°, 180°, -45°, -90°, -135°), used for orthogonal CAD drafting.
 */
export function constrainAngleTo45(origin: Point2D, target: Point2D): Point2D {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) return { ...target };

  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45 degrees in radians
  const snappedAngle = Math.round(angle / step) * step;

  return {
    x: Math.round((origin.x + length * Math.cos(snappedAngle)) * 1000) / 1000,
    y: Math.round((origin.y + length * Math.sin(snappedAngle)) * 1000) / 1000,
  };
}

/**
 * Constrains a target point relative to an origin point to standard 3D piping isometric axes
 * (30°, 90°, 150°, 210°, 270°, 330°), used for drafting on Piping Isometric (ISO) sheets.
 */
export function constrainAngleToIsometric(origin: Point2D, target: Point2D): Point2D {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) return { ...target };

  const angle = Math.atan2(dy, dx);
  // 6 standard isometric axes in radians: 30°, 90°, 150°, -150° (210°), -90° (270°), -30° (330°)
  const isoAngles = [
    Math.PI / 6,
    Math.PI / 2,
    (5 * Math.PI) / 6,
    (-5 * Math.PI) / 6,
    -Math.PI / 2,
    -Math.PI / 6,
  ];

  let closestAngle = isoAngles[0];
  let minDiff = Infinity;
  for (const a of isoAngles) {
    let diff = Math.abs(angle - a);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < minDiff) {
      minDiff = diff;
      closestAngle = a;
    }
  }

  return {
    x: Math.round((origin.x + length * Math.cos(closestAngle)) * 1000) / 1000,
    y: Math.round((origin.y + length * Math.sin(closestAngle)) * 1000) / 1000,
  };
}
