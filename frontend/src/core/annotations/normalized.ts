import type { PdfAnnotation, Point2D, Rect } from './types';

export interface PageDimensions {
  width: number;
  height: number;
}

export interface NormPoint {
  x: number;
  y: number;
}

export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedAnnotationGeometry {
  rect: NormRect;
  anchor?: NormPoint;
  knee?: NormPoint;
  points?: number[];
  paths?: number[][];
}

export const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export const normalizePoint = (point: Point2D, dims: PageDimensions): NormPoint => ({
  x: clampUnit(point.x / Math.max(1, dims.width)),
  y: clampUnit(point.y / Math.max(1, dims.height)),
});

export const denormalizePoint = (point: NormPoint, dims: PageDimensions): Point2D => ({
  x: clampUnit(point.x) * dims.width,
  y: clampUnit(point.y) * dims.height,
});

export const normalizeRect = (rect: Rect, dims: PageDimensions): NormRect => {
  const nx = rect.x / Math.max(1, dims.width);
  const ny = rect.y / Math.max(1, dims.height);
  const nw = rect.width / Math.max(1, dims.width);
  const nh = rect.height / Math.max(1, dims.height);
  return {
    x: clampUnit(nx),
    y: clampUnit(ny),
    width: clampUnit(nw),
    height: clampUnit(nh),
  };
};

export const denormalizeRect = (rect: NormRect, dims: PageDimensions): Rect => ({
  x: clampUnit(rect.x) * dims.width,
  y: clampUnit(rect.y) * dims.height,
  width: clampUnit(rect.width) * dims.width,
  height: clampUnit(rect.height) * dims.height,
});

export const normalizePath = (path: number[], dims: PageDimensions): number[] => {
  const normalized: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    normalized.push(clampUnit(path[i] / Math.max(1, dims.width)));
    normalized.push(clampUnit(path[i + 1] / Math.max(1, dims.height)));
  }
  return normalized;
};

export const denormalizePath = (path: number[], dims: PageDimensions): number[] => {
  const denormalized: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    denormalized.push(clampUnit(path[i]) * dims.width);
    denormalized.push(clampUnit(path[i + 1]) * dims.height);
  }
  return denormalized;
};

export const rotateNormPoint = (point: NormPoint, angle: number): NormPoint => {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  if (normalizedAngle === 90) return { x: 1 - point.y, y: point.x };
  if (normalizedAngle === 180) return { x: 1 - point.x, y: 1 - point.y };
  if (normalizedAngle === 270) return { x: point.y, y: 1 - point.x };
  return point;
};

export const rotateNormRect = (rect: NormRect, angle: number): NormRect => {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  if (normalizedAngle === 90) {
    return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width };
  }
  if (normalizedAngle === 180) {
    return { x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height, width: rect.width, height: rect.height };
  }
  if (normalizedAngle === 270) {
    return { x: rect.y, y: 1 - rect.x - rect.width, width: rect.height, height: rect.width };
  }
  return rect;
};

export const rotateNormPath = (path: number[], angle: number): number[] => {
  const output: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    const rotated = rotateNormPoint({ x: path[i], y: path[i + 1] }, angle);
    output.push(rotated.x, rotated.y);
  }
  return output;
};

export const normalizeAnnotationGeometry = (
  annotation: PdfAnnotation,
  dims: PageDimensions,
): NormalizedAnnotationGeometry => {
  const result: NormalizedAnnotationGeometry = {
    rect: normalizeRect(annotation.rect, dims),
  };

  if (annotation.data.anchor) {
    result.anchor = normalizePoint(annotation.data.anchor, dims);
  }
  if (annotation.data.knee) {
    result.knee = normalizePoint(annotation.data.knee, dims);
  }
  if (Array.isArray(annotation.data.points)) {
    result.points = normalizePath(annotation.data.points, dims);
  }
  if (Array.isArray(annotation.data.paths)) {
    result.paths = annotation.data.paths.map(path => normalizePath(path, dims));
  }
  return result;
};

export const denormalizeAnnotationGeometry = (
  annotation: PdfAnnotation,
  geometry: NormalizedAnnotationGeometry,
  dims: PageDimensions,
): PdfAnnotation => {
  const next = {
    ...annotation,
    rect: denormalizeRect(geometry.rect, dims),
    data: { ...annotation.data },
  };

  if (geometry.anchor) {
    next.data.anchor = denormalizePoint(geometry.anchor, dims);
  }
  if (geometry.knee) {
    next.data.knee = denormalizePoint(geometry.knee, dims);
  }
  if (geometry.points) {
    next.data.points = denormalizePath(geometry.points, dims);
  }
  if (geometry.paths) {
    next.data.paths = geometry.paths.map(path => denormalizePath(path, dims));
  }
  return next;
};

export const rotateNormalizedAnnotationGeometry = (
  geometry: NormalizedAnnotationGeometry,
  angle: number,
): NormalizedAnnotationGeometry => ({
  rect: rotateNormRect(geometry.rect, angle),
  anchor: geometry.anchor ? rotateNormPoint(geometry.anchor, angle) : undefined,
  knee: geometry.knee ? rotateNormPoint(geometry.knee, angle) : undefined,
  points: geometry.points ? rotateNormPath(geometry.points, angle) : undefined,
  paths: geometry.paths ? geometry.paths.map(path => rotateNormPath(path, angle)) : undefined,
});

export const migrateAnnotationToNormalized = (
  annotation: PdfAnnotation,
  dims: PageDimensions,
): PdfAnnotation => {
  const normalized = normalizeAnnotationGeometry(annotation, dims);
  return {
    ...annotation,
    data: {
      ...annotation.data,
      geometryVersion: 2,
      normalizedGeometry: normalized,
    },
  };
};

export const migrateAnnotationFromNormalized = (
  annotation: PdfAnnotation,
  dims: PageDimensions,
): PdfAnnotation => {
  const normalized = annotation.data.normalizedGeometry as NormalizedAnnotationGeometry | undefined;
  if (!normalized) return annotation;
  const denormalized = denormalizeAnnotationGeometry(annotation, normalized, dims);
  return {
    ...denormalized,
    data: {
      ...denormalized.data,
      geometryVersion: 2,
      normalizedGeometry: normalized,
    },
  };
};
