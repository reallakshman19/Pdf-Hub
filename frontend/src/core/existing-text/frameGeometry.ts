/**
 * Interactive Text Frame Geometry Engine.
 * Pure TypeScript (INV-4 compliant: zero external library imports).
 */

import type { PageId } from '@/core/pages/types';
import type {
  ExistingTextFrame,
  FramePoint2D,
  FrameRect,
} from './frameManipulationTypes';

export type { ExistingTextFrame } from './frameManipulationTypes';
export type FrameReflowResult = ReturnType<typeof calculateFrameResizeReflow>;
import type { ExistingTextSpan } from './types';
import type { ExistingTextParagraphBlock } from './paragraphTypes';
import { defaultApproximateTextWidth, type TextWidthMeasurementFn } from './paragraphReflowEngine';

export interface RepositioningOptions {
  snapThreshold?: number;
  centerSnap?: boolean;
  margins?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * Calculates clamped and snapped target coordinates for dragging a text frame.
 */
export function calculateFrameRepositioning(
  frame: ExistingTextFrame,
  rawTarget: FramePoint2D,
  pageSize: { width: number; height: number },
  options: RepositioningOptions = {},
): FramePoint2D {
  const threshold = options.snapThreshold ?? 8;
  const frameWidth = frame.bounds.width;
  const frameHeight = frame.bounds.height;

  // 1. Initial clamp to page bounds
  let targetX = Math.max(0, Math.min(pageSize.width - frameWidth, rawTarget.x));
  let targetY = Math.max(0, Math.min(pageSize.height - frameHeight, rawTarget.y));

  // 2. Magnetic Centerline Snapping
  if (options.centerSnap !== false) {
    const pageCenterX = pageSize.width / 2;
    const frameCenterX = targetX + frameWidth / 2;
    if (Math.abs(frameCenterX - pageCenterX) <= threshold) {
      targetX = pageCenterX - frameWidth / 2;
    }

    const pageCenterY = pageSize.height / 2;
    const frameCenterY = targetY + frameHeight / 2;
    if (Math.abs(frameCenterY - pageCenterY) <= threshold) {
      targetY = pageCenterY - frameHeight / 2;
    }
  }

  // 3. Margin Snapping
  if (options.margins) {
    if (Math.abs(targetX - options.margins.left) <= threshold) {
      targetX = options.margins.left;
    }
    const rightMarginX = pageSize.width - options.margins.right - frameWidth;
    if (Math.abs(targetX - rightMarginX) <= threshold) {
      targetX = rightMarginX;
    }

    if (Math.abs(targetY - options.margins.top) <= threshold) {
      targetY = options.margins.top;
    }
    const bottomMarginY = pageSize.height - options.margins.bottom - frameHeight;
    if (Math.abs(targetY - bottomMarginY) <= threshold) {
      targetY = bottomMarginY;
    }
  }

  return {
    x: Math.round(targetX * 10) / 10,
    y: Math.round(targetY * 10) / 10,
  };
}

export interface FrameResizeOptions {
  minWidthPt?: number;
  measureWidth?: TextWidthMeasurementFn;
}

/**
 * Dynamically re-wraps text lines and recalculates bounds height as frame width changes.
 */
export function calculateFrameResizeReflow(
  frame: ExistingTextFrame,
  newWidthPt: number,
  options: FrameResizeOptions = {},
): {
  newWidthPt: number;
  newHeightPt: number;
  lines: string[];
} {
  const minWidth = Math.max(36, options.minWidthPt ?? frame.fontSizePt * 2);
  const clampedWidth = Math.max(minWidth, Math.round(newWidthPt));
  const measure = options.measureWidth ?? defaultApproximateTextWidth;
  const spaceWidth = measure(' ', frame.fontSizePt);

  const manualLines = frame.text.split(/\r?\n/);
  const wrappedLines: string[] = [];

  for (const manualLine of manualLines) {
    const trimmed = manualLine.trim();
    if (trimmed.length === 0) {
      wrappedLines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';
    let currentLineWidth = 0;

    for (const word of words) {
      const wordWidth = measure(word, frame.fontSizePt);

      if (currentLine.length === 0) {
        currentLine = word;
        currentLineWidth = wordWidth;
      } else if (currentLineWidth + spaceWidth + wordWidth <= clampedWidth) {
        currentLine += ` ${word}`;
        currentLineWidth += spaceWidth + wordWidth;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
        currentLineWidth = wordWidth;
      }
    }

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }
  }

  const effectiveLines = wrappedLines.length > 0 ? wrappedLines : [''];
  const newHeightPt = Math.max(
    frame.fontSizePt,
    Math.round(effectiveLines.length * frame.leadingPt),
  );

  return {
    newWidthPt: clampedWidth,
    newHeightPt,
    lines: effectiveLines,
  };
}

/**
 * Checks whether an AABB marquee rectangle intersects with a text frame.
 */
export function isFrameIntersectingMarquee(marquee: FrameRect, frameBounds: FrameRect): boolean {
  const mLeft = Math.min(marquee.x, marquee.x + marquee.width);
  const mRight = Math.max(marquee.x, marquee.x + marquee.width);
  const mTop = Math.min(marquee.y, marquee.y + marquee.height);
  const mBottom = Math.max(marquee.y, marquee.y + marquee.height);

  const fLeft = frameBounds.x;
  const fRight = frameBounds.x + frameBounds.width;
  const fTop = frameBounds.y;
  const fBottom = frameBounds.y + frameBounds.height;

  return !(mRight < fLeft || mLeft > fRight || mBottom < fTop || mTop > fBottom);
}

/**
 * Filters and returns the IDs of all frames that intersect with the active marquee selection.
 */
export function getMarqueeIntersectingFrames(
  marqueeRect: FrameRect,
  availableFrames: ExistingTextFrame[],
): string[] {
  return availableFrames
    .filter((f) => isFrameIntersectingMarquee(marqueeRect, f.bounds))
    .map((f) => f.frameId);
}

/**
 * Constructs an ExistingTextFrame from a cluster of ExistingTextSpans.
 */
export function createFrameFromSpans(
  spans: ExistingTextSpan[],
  pageIndex: number,
  pageId: PageId,
  revisionId: string,
): ExistingTextFrame | null {
  if (spans.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let totalFontSize = 0;

  for (const s of spans) {
    minX = Math.min(minX, s.originPt.x);
    minY = Math.min(minY, s.originPt.y);
    maxX = Math.max(maxX, s.originPt.x + s.advanceWidthPt);
    maxY = Math.max(maxY, s.originPt.y + s.sourceHeightPt);
    totalFontSize += s.fontSizePt;
  }

  const avgFontSize = Math.round(totalFontSize / spans.length);
  const leadingPt = Math.round(avgFontSize * 1.3);
  const fullText = spans.map((s) => s.text).join(' ');

  const bounds: FrameRect = {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(36, Math.round(maxX - minX)),
    height: Math.max(avgFontSize, Math.round(maxY - minY)),
  };

  return {
    frameId: `frame-${spans[0].id}`,
    revisionId,
    pageIndex,
    pageId,
    bounds,
    originalBounds: { ...bounds },
    text: fullText,
    originalText: fullText,
    spanIds: spans.map((s) => s.id),
    fontSizePt: avgFontSize,
    leadingPt,
    fontName: spans[0].fontName,
  };
}

/**
 * Constructs an ExistingTextFrame from an existing paragraph block.
 */
export function createFrameFromParagraph(
  paragraph: ExistingTextParagraphBlock,
  revisionId: string,
): ExistingTextFrame {
  const bounds: FrameRect = {
    x: Math.round(paragraph.boundsPt.x),
    y: Math.round(paragraph.boundsPt.y),
    width: Math.round(paragraph.columnWidthPt || paragraph.boundsPt.width),
    height: Math.round(paragraph.boundsPt.height || paragraph.lines.length * paragraph.leadingPt),
  };

  const spanIds = paragraph.lines.map((l) => l.span.id);

  return {
    frameId: `frame-${paragraph.paragraphId}`,
    revisionId,
    pageIndex: paragraph.pageIndex,
    pageId: paragraph.pageId,
    bounds,
    originalBounds: { ...bounds },
    text: paragraph.fullText,
    originalText: paragraph.fullText,
    spanIds,
    fontSizePt: paragraph.fontSizePt,
    leadingPt: paragraph.leadingPt,
    fontName: paragraph.fontName,
  };
}
