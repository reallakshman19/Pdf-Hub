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
