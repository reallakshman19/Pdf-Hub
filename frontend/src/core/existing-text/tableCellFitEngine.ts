import type { DetectedTableCell } from './tableCellTypes';
import type { ExistingTextAlign } from './alignmentTypes';
import { suggestAlignmentForText } from './tableCellDetector';

export interface TableCellFitOptions {
  paddingPt?: number;
  minSqueezePercent?: number;
  allowFontSizeStepDown?: boolean;
  minFontSizeStepDownRatio?: number;
  preferredAlignment?: ExistingTextAlign;
}

export interface TableCellFitResult {
  cell: DetectedTableCell;
  replacementText: string;
  originalTextWidthPt: number;
  replacementTextWidthPt: number;
  maxAllowedWidthPt: number;
  horizontalScalingPercent: number; // Tz: 75..100
  effectiveFontSizePt: number;
  isSqueezed: boolean;
  isSteppedDown: boolean;
  isOverflowing: boolean;
  alignment: ExistingTextAlign;
  xOffsetPt: number; // offset relative to (cell.bounds.x + paddingPt)
  baselineXPts: number; // absolute user-space X coordinate for text drawing
}

export function computeTableCellFit(
  cell: DetectedTableCell,
  replacementText: string,
  measureWidthFn: (text: string, fontSize: number) => number,
  baseFontSize: number,
  options?: TableCellFitOptions,
): TableCellFitResult {
  const padding = options?.paddingPt ?? 3.0;
  const minSqueeze = options?.minSqueezePercent ?? 75;
  const allowStepDown = options?.allowFontSizeStepDown ?? true;
  const minStepDownRatio = options?.minFontSizeStepDownRatio ?? 0.8;

  const maxAllowedWidthPt = Math.max(10, cell.bounds.width - 2 * padding);
  const naturalWidth = measureWidthFn(replacementText, baseFontSize);
  const originalWidth = measureWidthFn(cell.text, baseFontSize);

  let horizontalScalingPercent = 100;
  let effectiveFontSizePt = baseFontSize;
  let isSqueezed = false;
  let isSteppedDown = false;
  let isOverflowing = false;

  if (naturalWidth <= maxAllowedWidthPt) {
    // Fits cleanly without scaling
    horizontalScalingPercent = 100;
    effectiveFontSizePt = baseFontSize;
  } else {
    // Attempt Tz squeeze
    const squeezeRatio = maxAllowedWidthPt / naturalWidth;
    const computedTz = Math.round(squeezeRatio * 100);

    if (computedTz >= minSqueeze) {
      horizontalScalingPercent = computedTz;
      effectiveFontSizePt = baseFontSize;
      isSqueezed = true;
    } else {
      // Tz is clamped to minSqueeze (75%)
      horizontalScalingPercent = minSqueeze;
      isSqueezed = true;

      if (allowStepDown) {
        // Remaining excess at minSqueeze
        const widthAtMinSqueeze = naturalWidth * (minSqueeze / 100);
        const stepDownRatio = maxAllowedWidthPt / widthAtMinSqueeze;
        const clampedRatio = Math.max(minStepDownRatio, stepDownRatio);

        effectiveFontSizePt = Number((baseFontSize * clampedRatio).toFixed(2));
        isSteppedDown = effectiveFontSizePt < baseFontSize;

        const finalWidth =
          measureWidthFn(replacementText, effectiveFontSizePt) * (horizontalScalingPercent / 100);
        if (finalWidth > maxAllowedWidthPt + 0.5) {
          isOverflowing = true;
        }
      } else {
        isOverflowing = true;
      }
    }
  }

  // Determine alignment
  const alignment: ExistingTextAlign =
    options?.preferredAlignment ??
    (cell.suggestedAlignment || suggestAlignmentForText(replacementText));

  // Compute rendered advance width
  const renderedWidth =
    measureWidthFn(replacementText, effectiveFontSizePt) * (horizontalScalingPercent / 100);

  // Compute horizontal offset
  let xOffsetPt = 0;
  if (alignment === 'right') {
    xOffsetPt = Math.max(0, maxAllowedWidthPt - renderedWidth);
  } else if (alignment === 'center') {
    xOffsetPt = Math.max(0, (maxAllowedWidthPt - renderedWidth) / 2);
  } else {
    // left or justify
    xOffsetPt = 0;
  }

  const baselineXPts = cell.bounds.x + padding + xOffsetPt;

  return {
    cell,
    replacementText,
    originalTextWidthPt: originalWidth,
    replacementTextWidthPt: renderedWidth,
    maxAllowedWidthPt,
    horizontalScalingPercent,
    effectiveFontSizePt,
    isSqueezed,
    isSteppedDown,
    isOverflowing,
    alignment,
    xOffsetPt,
    baselineXPts,
  };
}
