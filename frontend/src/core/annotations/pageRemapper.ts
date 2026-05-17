import type { PdfAnnotation } from './types';

/**
 * Pure page-remapping functions.
 * No store imports. No React imports. No side effects.
 * All return new arrays — zero mutation.
 *
 * These are called by the annotation store on DocumentEvent subscription.
 * They must be 100% unit-tested (easy — pure functions).
 */

/**
 * Remaps annotation pageNumbers after a page reorder operation.
 * @param annotations - current annotation array
 * @param order - order[newIndex] = oldIndex (0-based)
 *
 * Example: 3-page doc, order = [2, 0, 1]
 *   Page 0 moves to position 1 (order[1] = 0)
 *   Page 1 moves to position 2 (order[2] = 1)
 *   Page 2 moves to position 0 (order[0] = 2)
 */
export function remapAfterReorder(
  annotations: PdfAnnotation[],
  order: number[],          // 0-based new-to-old mapping
): PdfAnnotation[] {
  // Build old-to-new index: newPosition[oldIdx] = newIdx
  const oldToNew = new Array<number>(order.length);
  order.forEach((oldIdx, newIdx) => {
    oldToNew[oldIdx] = newIdx;
  });

  return annotations.map(a => {
    const zeroBasedPage = a.pageNumber - 1;
    // If the page exists in the order map, remap it
    if (zeroBasedPage >= 0 && zeroBasedPage < oldToNew.length) {
      const newZeroBasedPage = oldToNew[zeroBasedPage];
      if (newZeroBasedPage !== undefined) {
        return { ...a, pageNumber: newZeroBasedPage + 1 };
      }
    }
    return a;
  });
}

/**
 * Remaps annotation pageNumbers after pages are deleted.
 * Annotations on deleted pages are removed from the array.
 * Annotations on pages above the deleted pages shift down.
 *
 * @param deletedIndices - 0-based page indices that were deleted (unsorted OK)
 */
export function remapAfterDelete(
  annotations: PdfAnnotation[],
  deletedIndices: number[],
): PdfAnnotation[] {
  if (deletedIndices.length === 0) return annotations;

  const deletedSet = new Set(deletedIndices);
  const sortedDeleted = [...deletedIndices].sort((a, b) => a - b);

  return annotations
    .filter(a => !deletedSet.has(a.pageNumber - 1))   // remove annotations on deleted pages
    .map(a => {
      const zeroPage = a.pageNumber - 1;
      // Count how many deleted pages are below this annotation's page
      const shiftDown = sortedDeleted.filter(d => d < zeroPage).length;
      return shiftDown > 0 ? { ...a, pageNumber: a.pageNumber - shiftDown } : a;
    });
}

/**
 * Remaps annotation pageNumbers after pages are inserted.
 * Annotations at pages >= atIndex shift up by count.
 *
 * @param atIndex - 0-based index where pages were inserted (before this index)
 * @param count   - number of pages inserted
 */
export function remapAfterInsert(
  annotations: PdfAnnotation[],
  atIndex: number,
  count: number,
): PdfAnnotation[] {
  if (count <= 0) return annotations;

  return annotations.map(a => {
    // Pages at position >= atIndex shift up by count
    const zeroPage = a.pageNumber - 1;
    if (zeroPage >= atIndex) {
      return { ...a, pageNumber: a.pageNumber + count };
    }
    return a;
  });
}

/**
 * Remaps annotation rects after pages are rotated.
 * Transforms x/y/width/height (and any geometric sub-fields) to the new orientation.
 *
 * Coordinate convention: top-left origin, matching PDF.js viewport at scale=1.
 * page dimensions (width/height) come from PdfEditAdapter.getPageSize (PDF user units).
 *
 * @param rotations - per-page rotation info: pageIndex (0-based), angle (degrees CW delta),
 *                    width/height of the page BEFORE rotation
 */
export function remapAfterRotate(
  annotations: PdfAnnotation[],
  rotations: Array<{ pageIndex: number; angle: number; width: number; height: number }>,
): PdfAnnotation[] {
  if (rotations.length === 0) return annotations;

  const rotationMap = new Map(rotations.map((r) => [r.pageIndex, r]));

  return annotations.map((annotation) => {
    const rot = rotationMap.get(annotation.pageNumber - 1);
    if (!rot) return annotation;

    const normalizedAngle = ((rot.angle % 360) + 360) % 360;
    if (normalizedAngle === 0) return annotation;

    const { width: W, height: H } = rot;
    const { x, y, width: w, height: h } = annotation.rect;

    let newRect: { x: number; y: number; width: number; height: number };
    if (normalizedAngle === 90) {
      newRect = { x: H - y - h, y: x, width: h, height: w };
    } else if (normalizedAngle === 270) {
      newRect = { x: y, y: W - x - w, width: h, height: w };
    } else {
      // 180°
      newRect = { x: W - x - w, y: H - y - h, width: w, height: h };
    }

    const newData = { ...annotation.data };

    if (annotation.data.anchor) {
      const { x: ax, y: ay } = annotation.data.anchor as { x: number; y: number };
      newData.anchor = rotatePoint(ax, ay, normalizedAngle, W, H);
    }
    if (annotation.data.knee) {
      const { x: kx, y: ky } = annotation.data.knee as { x: number; y: number };
      newData.knee = rotatePoint(kx, ky, normalizedAngle, W, H);
    }
    if (Array.isArray(annotation.data.paths)) {
      newData.paths = (annotation.data.paths as number[][]).map((path) =>
        rotatePath(path, normalizedAngle, W, H),
      );
    }
    if (Array.isArray(annotation.data.points)) {
      newData.points = rotatePath(annotation.data.points as number[], normalizedAngle, W, H);
    }

    return { ...annotation, rect: newRect, data: newData };
  });
}

function rotatePoint(
  px: number,
  py: number,
  angle: number,
  W: number,
  H: number,
): { x: number; y: number } {
  if (angle === 90)  return { x: H - py, y: px };
  if (angle === 270) return { x: py, y: W - px };
  return { x: W - px, y: H - py }; // 180°
}

function rotatePath(path: number[], angle: number, W: number, H: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    const pt = rotatePoint(path[i], path[i + 1], angle, W, H);
    out.push(pt.x, pt.y);
  }
  return out;
}
