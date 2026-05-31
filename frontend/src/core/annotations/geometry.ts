import type { Rect, Point2D } from './types';
import type { NormalizedAnnotationGeometry } from './normalized';
import { normalizeRect, denormalizeRect } from './normalized';

export type PageRotation = 0 | 90 | 180 | 270;

/**
 * Canonical annotation geometry with page context.
 * Combines viewport rect with normalized coordinates for zoom/rotation stability.
 */
export interface AnnotationGeometry {
  pageNumber: number;
  pageRotation: PageRotation;
  pageWidth: number;
  pageHeight: number;
  /** Absolute coordinates in viewport space */
  rectViewport: Rect;
  /** Normalized [0,1] coordinates — rotation-independent */
  normalized: NormalizedAnnotationGeometry;
  /** Optional freeform points in viewport space */
  pointsViewport?: Point2D[];
}

/**
 * Convert viewport rect to annotation geometry with normalization.
 * Uses the existing normalizeRect() from normalized.ts for consistency.
 */
export function createAnnotationGeometry(
  pageNumber: number,
  pageRotation: PageRotation,
  pageWidth: number,
  pageHeight: number,
  rectViewport: Rect,
): AnnotationGeometry {
  // Guard against zero dimensions
  const safeWidth = Math.max(1, pageWidth);
  const safeHeight = Math.max(1, pageHeight);

  return {
    pageNumber,
    pageRotation,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport,
    normalized: {
      rect: normalizeRect(rectViewport, { width: safeWidth, height: safeHeight }),
    },
  };
}

/**
 * Reproject annotation geometry for a new page size (e.g., after zoom).
 * Uses normalized coordinates for stability.
 */
export function reprojectGeometry(
  geometry: AnnotationGeometry,
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry {
  const safeWidth = Math.max(1, newPageWidth);
  const safeHeight = Math.max(1, newPageHeight);
  const { normalized } = geometry;

  return {
    ...geometry,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport: denormalizeRect(normalized.rect, {
      width: safeWidth,
      height: safeHeight,
    }),
  };
}

/**
 * Reproject geometry after page rotation.
 * When a page rotates 90°, what was (x, y) in a WxH page
 * becomes a different position in an HxW page.
 * Normalized coordinates handle this naturally because they're [0,1] relative.
 */
export function reprojectForRotation(
  geometry: AnnotationGeometry,
  newRotation: PageRotation,
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry {
  const safeWidth = Math.max(1, newPageWidth);
  const safeHeight = Math.max(1, newPageHeight);

  return {
    ...geometry,
    pageRotation: newRotation,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport: denormalizeRect(geometry.normalized.rect, {
      width: safeWidth,
      height: safeHeight,
    }),
  };
}

/**
 * Batch reproject all geometries for a new viewport size.
 * Useful when zoom level changes — call once, update all annotations.
 */
export function batchReproject(
  geometries: AnnotationGeometry[],
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry[] {
  return geometries.map((g) => reprojectGeometry(g, newPageWidth, newPageHeight));
}
