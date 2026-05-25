import type { PdfAnnotation } from './types';
import {
  denormalizeAnnotationGeometry,
  normalizeAnnotationGeometry,
  rotateNormalizedAnnotationGeometry,
  type NormalizedAnnotationGeometry,
} from './normalized';

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

    const page = { width: rot.width, height: rot.height };
    const existingNormalized = annotation.data.normalizedGeometry as NormalizedAnnotationGeometry | undefined;
    const normalizedGeometry = existingNormalized ?? normalizeAnnotationGeometry(annotation, page);
    const rotatedNormalizedGeometry = rotateNormalizedAnnotationGeometry(normalizedGeometry, normalizedAngle);
    const outputPage =
      normalizedAngle === 90 || normalizedAngle === 270
        ? { width: rot.height, height: rot.width }
        : page;
    const denormalized = denormalizeAnnotationGeometry(annotation, rotatedNormalizedGeometry, outputPage);

    return {
      ...denormalized,
      data: {
        ...denormalized.data,
        geometryVersion: 2,
        normalizedGeometry: rotatedNormalizedGeometry,
      },
    };
  });
}

/**
 * Remaps annotations after pages are duplicated.
 * Each duplicated page at sortedIndex[i] is inserted immediately after the original.
 * Annotations on duplicated pages are copied to the new pages; all other annotations
 * shift up to account for the inserted pages.
 *
 * @param pageIndices - 0-based indices of pages that were duplicated (unsorted OK)
 */
export function remapAfterDuplicate(
  annotations: PdfAnnotation[],
  pageIndices: number[],
): PdfAnnotation[] {
  if (pageIndices.length === 0) return annotations;

  const sortedIndices = [...pageIndices].sort((a, b) => a - b);

  // For each annotation, compute its new page number after duplicates are inserted
  // and collect copies for duplicated pages.
  const result: PdfAnnotation[] = [];

  for (const annotation of annotations) {
    const zeroPage = annotation.pageNumber - 1;
    // Count how many duplicated pages were inserted before this annotation's page
    const insertedBefore = sortedIndices.filter(idx => idx < zeroPage).length;
    result.push({ ...annotation, pageNumber: annotation.pageNumber + insertedBefore });
  }

  // Now add copies of annotations from duplicated pages to the new duplicate pages.
  // Duplicate of page at sortedIndices[i] lands at sortedIndices[i] + i + 1 (after offset).
  for (let i = 0; i < sortedIndices.length; i++) {
    const origIndex = sortedIndices[i];
    const insertedBefore = i; // i pages were already inserted before this one
    const newPageNumber = origIndex + insertedBefore + 2; // +1 for 1-based, +1 for "after original"
    const origPageNumber = origIndex + insertedBefore + 1; // original's new page number

    for (const annotation of annotations) {
      if (annotation.pageNumber - 1 === origIndex) {
        result.push({ ...annotation, pageNumber: newPageNumber });
        // Also fix the original which we already pushed — it now lives at origPageNumber
        // (already handled in the loop above via insertedBefore count)
        void origPageNumber; // used above for clarity
      }
    }
  }

  return result;
}
