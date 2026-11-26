import type { PdfAnnotation, Point2D, Rect } from './types';

export type AnnotationPointsCoordinateSpace = 'page' | 'rect-local';

function readValidNumericPoints(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 4 || raw.length % 2 !== 0) {
    return null;
  }
  for (let i = 0; i < raw.length; i += 1) {
    if (typeof raw[i] !== 'number' || !Number.isFinite(raw[i])) {
      return null;
    }
  }
  return raw as number[];
}

/**
 * Resolves the authoritative coordinate space of `annotation.data.points`.
 *
 * When `annotation.data.coordinateSpace` is explicitly set (`'page'` or `'rect-local'`),
 * it is returned verbatim with zero heuristics. Legacy annotations without this field
 * default deterministically by annotation type, only falling back to `'page'` for
 * linear annotations whose legacy vertices exceed `[0..rect.width] x [0..rect.height]`.
 */
export function resolveAnnotationPointsSpace(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
): AnnotationPointsCoordinateSpace {
  const explicit = annotation.data?.coordinateSpace;
  if (explicit === 'page' || explicit === 'rect-local') {
    return explicit;
  }

  if (
    annotation.type === 'shape-polygon' ||
    annotation.type === 'area-takeoff' ||
    annotation.type === 'ink'
  ) {
    return 'page';
  }

  const pts = readValidNumericPoints(annotation.data?.points);
  if (!pts) {
    return 'rect-local';
  }

  const eps = 0.5;
  const { width, height } = annotation.rect;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const px = pts[i];
    const py = pts[i + 1];
    if (px < -eps || py < -eps || px > width + eps || py > height + eps) {
      return 'page';
    }
  }

  return 'rect-local';
}

/**
 * Returns flat `[x0, y0, x1, y1, ...]` vertices in unscaled top-left page view space.
 */
export function getAnnotationPagePoints(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
): number[] {
  const pts = readValidNumericPoints(annotation.data?.points);
  if (!pts) {
    return [];
  }

  if (resolveAnnotationPointsSpace(annotation) === 'page') {
    return [...pts];
  }

  const ox = annotation.rect.x;
  const oy = annotation.rect.y;
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    out.push(pts[i] + ox, pts[i + 1] + oy);
  }
  return out;
}

/**
 * Returns flat `[x0, y0, x1, y1, ...]` vertices relative to `annotation.rect` origin `(0, 0)`.
 */
export function getAnnotationLocalPoints(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
): number[] {
  const pts = readValidNumericPoints(annotation.data?.points);
  if (!pts) {
    return [];
  }

  if (resolveAnnotationPointsSpace(annotation) === 'rect-local') {
    return [...pts];
  }

  const ox = annotation.rect.x;
  const oy = annotation.rect.y;
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    out.push(pts[i] - ox, pts[i + 1] - oy);
  }
  return out;
}

/**
 * Returns page-space `Point2D[]` vertices for topology, snapping, and measurements.
 */
export function getAnnotationPageVertices(
  annotation: Pick<PdfAnnotation, 'type' | 'rect' | 'data'>,
): Point2D[] {
  const flat = getAnnotationPagePoints(annotation);
  const verts: Point2D[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    verts.push({ x: flat[i], y: flat[i + 1] });
  }
  return verts;
}

/**
 * Computes a clickable bounding `Rect` around page-space points, preserving center on degenerate axes.
 */
export function computeRectFromPagePoints(points: number[], minSize = 8): Rect {
  if (points.length < 2) {
    return { x: 0, y: 0, width: minSize, height: minSize };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: minSize, height: minSize };
  }

  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const width = Math.max(rawW, minSize);
  const height = Math.max(rawH, minSize);
  const x = rawW < minSize ? (minX + maxX) / 2 - minSize / 2 : minX;
  const y = rawH < minSize ? (minY + maxY) / 2 - minSize / 2 : minY;

  return { x, y, width, height };
}

/**
 * Normalizes an annotation's vertices into explicit page-space representation.
 */
export function rebaseAnnotationToPageSpace(annotation: PdfAnnotation): PdfAnnotation {
  const pagePoints = getAnnotationPagePoints(annotation);
  if (pagePoints.length < 4) {
    return annotation;
  }

  return {
    ...annotation,
    data: {
      ...annotation.data,
      points: pagePoints,
      coordinateSpace: 'page',
    },
  };
}
