import type { WriterElementV2 } from '../../types';

/**
 * DOCX is reflowed content, but Writer V2 elements are PDF-page-attached.
 *
 * Sorting rule:
 * 1. pageIndex ASC
 * 2. rect.y DESC because PDF page origin is bottom-left
 * 3. rect.x ASC
 * 4. style.zIndex ASC
 * 5. createdAt ASC
 */
export function sortWriterElementsForDocx(
  elements: WriterElementV2[],
): WriterElementV2[] {
  return elements
    .slice()
    .sort((a, b) => {
      const pageDelta = a.pageIndex - b.pageIndex;
      if (pageDelta !== 0) return pageDelta;

      const yDelta = b.rect.y - a.rect.y;
      if (yDelta !== 0) return yDelta;

      const xDelta = a.rect.x - b.rect.x;
      if (xDelta !== 0) return xDelta;

      const zDelta = a.style.zIndex - b.style.zIndex;
      if (zDelta !== 0) return zDelta;

      return a.createdAt.localeCompare(b.createdAt);
    });
}
