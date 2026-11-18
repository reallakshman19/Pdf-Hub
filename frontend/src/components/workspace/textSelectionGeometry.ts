import type { Rect } from '@/core/annotations/types';

/** Project the browser's selected substring onto the authoritative PDF.js
 * text-item span box. Browser glyph metrics are only used as a ratio, never
 * as the final PDF geometry. */
export function projectSelectedSpan(
  span: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  browserFull: Pick<DOMRect, 'left' | 'width'>,
  browserSelected: Pick<DOMRect, 'left' | 'right'>,
  page: Pick<DOMRect, 'left' | 'top'>,
  scale: number,
): Rect | null {
  if (!(scale > 0) || browserFull.width <= 0 || span.width <= 0 || span.height <= 0) return null;
  const start = Math.max(0, Math.min(1, (browserSelected.left - browserFull.left) / browserFull.width));
  const end = Math.max(0, Math.min(1, (browserSelected.right - browserFull.left) / browserFull.width));
  const selectedWidth = (end - start) * span.width;
  if (selectedWidth <= 0.1) return null;
  return {
    x: (span.left - page.left + start * span.width) / scale,
    y: (span.top - page.top) / scale,
    width: selectedWidth / scale,
    height: span.height / scale,
  };
}

/** Never admit a selection spanning different page surfaces. */
export function selectedMarkupTextRects(
  range: Range,
  page: HTMLElement,
  scale: number,
): Rect[] {
  if (!page.contains(range.startContainer) || !page.contains(range.endContainer)) return [];
  const pageRect = page.getBoundingClientRect();
  const spans = page.querySelectorAll<HTMLSpanElement>('[data-text-item="true"]');
  const rects: Rect[] = [];
  for (const span of spans) {
    if (!range.intersectsNode(span)) continue;
    const full = page.ownerDocument.createRange();
    full.selectNodeContents(span);
    const clipped = range.cloneRange();
    if (clipped.compareBoundaryPoints(Range.START_TO_START, full) < 0) {
      clipped.setStart(full.startContainer, full.startOffset);
    }
    if (clipped.compareBoundaryPoints(Range.END_TO_END, full) > 0) {
      clipped.setEnd(full.endContainer, full.endOffset);
    }
    if (clipped.collapsed || !clipped.toString()) continue;
    const projected = projectSelectedSpan(
      span.getBoundingClientRect(), full.getBoundingClientRect(),
      clipped.getBoundingClientRect(), pageRect, scale,
    );
    if (projected) rects.push(projected);
  }
  return rects;
}
