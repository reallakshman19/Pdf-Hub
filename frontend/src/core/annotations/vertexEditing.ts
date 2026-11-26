import type { AnnotationData, PdfAnnotation, Point2D, Rect } from './types';
import {
  computeRectFromPagePoints,
  getAnnotationPagePoints,
  getAnnotationPageVertices,
  resolveAnnotationPointsSpace,
} from './pointsSpace';

export interface VertexGeometryPatch {
  rect: Rect;
  points: number[];
  coordinateSpace: 'page' | 'rect-local';
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatPointsForSpace(
  pagePoints: number[],
  rect: Rect,
  space: 'page' | 'rect-local',
): number[] {
  if (space === 'page') {
    return pagePoints.map(roundCoord);
  }
  const local: number[] = [];
  for (let i = 0; i + 1 < pagePoints.length; i += 2) {
    local.push(roundCoord(pagePoints[i] - rect.x), roundCoord(pagePoints[i + 1] - rect.y));
  }
  return local;
}

function resolveTargetSpace(annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>): 'page' | 'rect-local' {
  if (annotation.data.coordinateSpace === 'page' || annotation.data.coordinateSpace === 'rect-local') {
    return annotation.data.coordinateSpace;
  }
  return resolveAnnotationPointsSpace(annotation);
}

/**
 * Moves a single vertex of a line, arrow, polyline, or polygon annotation
 * in page space and recomputes its tight bounding box.
 */
export function moveAnnotationVertex(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
  vertexIndex: number,
  newPagePoint: Point2D,
): VertexGeometryPatch | null {
  const pagePoints = getAnnotationPagePoints(annotation);
  const vertexCount = Math.floor(pagePoints.length / 2);
  if (vertexIndex < 0 || vertexIndex >= vertexCount) {
    return null;
  }

  const nextPagePoints = [...pagePoints];
  nextPagePoints[vertexIndex * 2] = roundCoord(newPagePoint.x);
  nextPagePoints[vertexIndex * 2 + 1] = roundCoord(newPagePoint.y);

  const space = resolveTargetSpace(annotation);
  const nextRect = computeRectFromPagePoints(nextPagePoints, 8);
  return {
    rect: nextRect,
    points: formatPointsForSpace(nextPagePoints, nextRect, space),
    coordinateSpace: space,
  };
}

/**
 * Inserts a new vertex on segment `segmentIndex` (between `segmentIndex` and `segmentIndex + 1`,
 * wrapping for closed polygons) at `point` or the segment midpoint.
 */
export function insertAnnotationVertex(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
  segmentIndex: number,
  point?: Point2D,
): VertexGeometryPatch | null {
  const pagePoints = getAnnotationPagePoints(annotation);
  const vertexCount = Math.floor(pagePoints.length / 2);
  if (vertexCount < 2) return null;

  const isClosed = annotation.type === 'shape-polygon' || annotation.type === 'area-takeoff';
  const maxSegmentIndex = isClosed ? vertexCount - 1 : vertexCount - 2;
  if (segmentIndex < 0 || segmentIndex > maxSegmentIndex) {
    return null;
  }

  const ax = pagePoints[segmentIndex * 2];
  const ay = pagePoints[segmentIndex * 2 + 1];
  const nextIdx = (segmentIndex + 1) % vertexCount;
  const bx = pagePoints[nextIdx * 2];
  const by = pagePoints[nextIdx * 2 + 1];

  const insertPt: Point2D = point ?? {
    x: roundCoord((ax + bx) / 2),
    y: roundCoord((ay + by) / 2),
  };

  const nextPagePoints = [...pagePoints];
  nextPagePoints.splice((segmentIndex + 1) * 2, 0, roundCoord(insertPt.x), roundCoord(insertPt.y));

  // Promote 2-point polyline/line insertions cleanly
  const targetSpace: 'page' | 'rect-local' =
    annotation.type === 'line' && nextPagePoints.length > 4
      ? 'page'
      : resolveTargetSpace(annotation);
  const nextRect = computeRectFromPagePoints(nextPagePoints, 8);
  return {
    rect: nextRect,
    points: formatPointsForSpace(nextPagePoints, nextRect, targetSpace),
    coordinateSpace: targetSpace,
  };
}

/**
 * Deletes vertex `vertexIndex` if removing it leaves at least the minimum valid vertices
 * (3 for polygons, 2 for linear runs).
 */
export function deleteAnnotationVertex(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
  vertexIndex: number,
): VertexGeometryPatch | null {
  const pagePoints = getAnnotationPagePoints(annotation);
  const vertexCount = Math.floor(pagePoints.length / 2);
  const minVertices =
    annotation.type === 'shape-polygon' || annotation.type === 'area-takeoff' ? 3 : 2;
  if (vertexCount <= minVertices || vertexIndex < 0 || vertexIndex >= vertexCount) {
    return null;
  }

  const nextPagePoints = [...pagePoints];
  nextPagePoints.splice(vertexIndex * 2, 2);

  const space = resolveTargetSpace(annotation);
  const nextRect = computeRectFromPagePoints(nextPagePoints, 8);
  return {
    rect: nextRect,
    points: formatPointsForSpace(nextPagePoints, nextRect, space),
    coordinateSpace: space,
  };
}

function defaultId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `poly-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/**
 * Splits an open polyline (`perimeter-takeoff` / `line`) at interior vertex `vertexIndex`
 * (`1 <= vertexIndex <= vertexCount - 2`) into two editable page-space runs.
 */
export function splitPolylineAtVertex(
  annotation: PdfAnnotation,
  vertexIndex: number,
  idFactory: () => string = defaultId,
): [PdfAnnotation, PdfAnnotation] | null {
  if (annotation.type !== 'perimeter-takeoff' && annotation.type !== 'line') {
    return null;
  }

  const pagePoints = getAnnotationPagePoints(annotation);
  const vertexCount = Math.floor(pagePoints.length / 2);
  if (vertexCount < 3 || vertexIndex <= 0 || vertexIndex >= vertexCount - 1) {
    return null;
  }

  const firstPoints = pagePoints.slice(0, (vertexIndex + 1) * 2).map(roundCoord);
  const secondPoints = pagePoints.slice(vertexIndex * 2).map(roundCoord);

  const now = Date.now();
  const baseData: AnnotationData = { ...annotation.data };
  delete baseData.nativeOriginalName;
  delete baseData.nativeSourceRef;
  delete baseData.nativeIdentityAmbiguous;
  delete baseData.nativeInterop;
  delete baseData.normalizedGeometry;
  delete baseData.geometryVersion;

  const branchBase = typeof baseData.branchName === 'string' && baseData.branchName.trim()
    ? baseData.branchName.trim()
    : undefined;

  const first: PdfAnnotation = {
    ...annotation,
    id: idFactory(),
    rect: computeRectFromPagePoints(firstPoints, 8),
    data: {
      ...baseData,
      points: firstPoints,
      coordinateSpace: 'page',
      ...(branchBase ? { branchName: `${branchBase}-A` } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };

  const second: PdfAnnotation = {
    ...annotation,
    id: idFactory(),
    rect: computeRectFromPagePoints(secondPoints, 8),
    data: {
      ...baseData,
      points: secondPoints,
      coordinateSpace: 'page',
      ...(branchBase ? { branchName: `${branchBase}-B` } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };

  return [first, second];
}

function reversePoint2Ds(pts: Point2D[]): Point2D[] {
  return [...pts].reverse();
}

/**
 * Merges two touching linear / polyline annotations on the same page (endpoints within
 * `tolerancePt`) into a single continuous `perimeter-takeoff` run.
 */
export function mergeConnectedPolylines(
  first: PdfAnnotation,
  second: PdfAnnotation,
  tolerancePt = 8,
  idFactory: () => string = defaultId,
): PdfAnnotation | null {
  if (first.pageNumber !== second.pageNumber) return null;
  const linearTypes = ['line', 'arrow', 'perimeter-takeoff'];
  if (!linearTypes.includes(first.type) || !linearTypes.includes(second.type)) {
    return null;
  }

  const ptsA = getAnnotationPageVertices(first);
  const ptsB = getAnnotationPageVertices(second);
  if (ptsA.length < 2 || ptsB.length < 2) return null;

  const aStart = ptsA[0];
  const aEnd = ptsA[ptsA.length - 1];
  const bStart = ptsB[0];
  const bEnd = ptsB[ptsB.length - 1];

  const candidates: Array<{ dist: number; ordered: Point2D[] }> = [
    {
      dist: Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y),
      ordered: [...ptsA, ...ptsB.slice(1)],
    },
    {
      dist: Math.hypot(aEnd.x - bEnd.x, aEnd.y - bEnd.y),
      ordered: [...ptsA, ...reversePoint2Ds(ptsB).slice(1)],
    },
    {
      dist: Math.hypot(aStart.x - bEnd.x, aStart.y - bEnd.y),
      ordered: [...ptsB, ...ptsA.slice(1)],
    },
    {
      dist: Math.hypot(aStart.x - bStart.x, aStart.y - bStart.y),
      ordered: [...reversePoint2Ds(ptsA), ...ptsB.slice(1)],
    },
  ];

  candidates.sort((a, b) => a.dist - b.dist);
  const best = candidates[0];
  if (!best || best.dist > tolerancePt) {
    return null;
  }

  const mergedFlat: number[] = [];
  for (const p of best.ordered) {
    mergedFlat.push(roundCoord(p.x), roundCoord(p.y));
  }
  const now = Date.now();
  const baseData: AnnotationData = { ...first.data };
  delete baseData.nativeOriginalName;
  delete baseData.nativeSourceRef;
  delete baseData.nativeIdentityAmbiguous;
  delete baseData.nativeInterop;
  delete baseData.normalizedGeometry;
  delete baseData.geometryVersion;

  return {
    id: idFactory(),
    type: 'perimeter-takeoff',
    ...(first.pageId ? { pageId: first.pageId } : {}),
    pageNumber: first.pageNumber,
    rect: computeRectFromPagePoints(mergedFlat, 8),
    data: {
      ...baseData,
      points: mergedFlat,
      coordinateSpace: 'page',
      isPipeRun: true,
      branchName: first.data.branchName ?? second.data.branchName,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export interface OrthogonalizeOptions {
  /** Snap angle increment in degrees: `90` (ortho, default) or `45` (isometric/45°). */
  stepDeg?: 90 | 45;
  /** Maximum angular deviation from a snap direction to snap (degrees). Default: 20 for 90°, 15 for 45°. */
  angleToleranceDeg?: number;
  /** Collapse interior vertices closer than this distance (pt) to segment A->C. Default: 1.5. */
  collinearTolerancePt?: number;
}

function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Snaps near-orthogonal or near-isometric segments of a polyline/line to clean
 * canonical angles (`stepDeg`: 90° or 45°) and collapses near-collinear interior nodes.
 */
export function orthogonalizePolyline(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
  options: OrthogonalizeOptions = {},
): VertexGeometryPatch | null {
  const verts = getAnnotationPageVertices(annotation);
  if (verts.length < 2) return null;

  const stepDeg = options.stepDeg ?? 90;
  const defaultTol = stepDeg === 90 ? 20 : 15;
  const angleTolDeg = options.angleToleranceDeg ?? defaultTol;
  const collinearTol = options.collinearTolerancePt ?? 1.5;

  const snapped: Point2D[] = [{ x: roundCoord(verts[0].x), y: roundCoord(verts[0].y) }];

  for (let i = 1; i < verts.length; i++) {
    const prevSnapped = snapped[snapped.length - 1];
    const origCurr = verts[i];
    // Anchor segment delta from prevSnapped -> origCurr so vertex drift never accumulates downstream.
    const dx = origCurr.x - prevSnapped.x;
    const dy = origCurr.y - prevSnapped.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const nearestStep = Math.round(angleDeg / stepDeg) * stepDeg;
    const diffDeg = Math.abs(angleDeg - nearestStep);

    if (diffDeg <= angleTolDeg) {
      const rad = (nearestStep * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      // Orthogonal projection preserves exact axis coordinates for 0°/90° steps
      const proj = dx * ux + dy * uy;
      snapped.push({
        x: roundCoord(prevSnapped.x + proj * ux),
        y: roundCoord(prevSnapped.y + proj * uy),
      });
    } else {
      snapped.push({
        x: roundCoord(prevSnapped.x + dx),
        y: roundCoord(prevSnapped.y + dy),
      });
    }
  }

  if (snapped.length < 2) return null;

  // Collapse redundant near-collinear interior vertices
  const cleaned: Point2D[] = [snapped[0]];
  for (let i = 1; i < snapped.length - 1; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = snapped[i];
    const next = snapped[i + 1];
    if (pointToSegmentDist(curr, prev, next) > collinearTol) {
      cleaned.push(curr);
    }
  }
  cleaned.push(snapped[snapped.length - 1]);

  if (cleaned.length < 2) return null;

  const flatPagePoints: number[] = [];
  for (const pt of cleaned) {
    flatPagePoints.push(roundCoord(pt.x), roundCoord(pt.y));
  }

  const space = resolveTargetSpace(annotation);
  const nextRect = computeRectFromPagePoints(flatPagePoints, 8);
  return {
    rect: nextRect,
    points: formatPointsForSpace(flatPagePoints, nextRect, space),
    coordinateSpace: space,
  };
}
