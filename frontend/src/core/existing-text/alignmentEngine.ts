import type {
  AlignedLineLayout,
  ExistingTextAlign,
  ExistingTextAlignmentOptions,
} from './alignmentTypes';

export function computeLineAlignmentLayout(
  text: string,
  lineWidthPt: number,
  columnWidthPt: number,
  align: ExistingTextAlign = 'left',
  isLastLineOfParagraph: boolean = false,
  options?: Partial<ExistingTextAlignmentOptions>,
): AlignedLineLayout {
  const horizontalScalePercent = options?.horizontalScalePercent ?? 100;
  const charSpacingPt = options?.letterSpacingPt ?? 0;
  let wordSpacingPt = options?.wordSpacingPt ?? 0;

  // Compute scaled line width taking horizontal scaling and tracking into account
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  const charCount = text.length;
  const trackingTotalPt = charSpacingPt * Math.max(0, charCount - 1);
  const scaledLineWidthPt = (lineWidthPt + trackingTotalPt) * (horizontalScalePercent / 100);

  const effectiveColumnWidthPt = Math.max(columnWidthPt, scaledLineWidthPt);
  const remainingSpacePt = Math.max(0, effectiveColumnWidthPt - scaledLineWidthPt);

  let offsetX = 0;

  switch (align) {
    case 'center': {
      offsetX = Math.max(0, remainingSpacePt / 2);
      break;
    }
    case 'right': {
      offsetX = Math.max(0, remainingSpacePt);
      break;
    }
    case 'justify': {
      // In digital typography, the last line of a justified block is left-aligned
      if (!isLastLineOfParagraph && words.length > 1 && remainingSpacePt > 0) {
        const spaceCount = words.length - 1;
        wordSpacingPt = remainingSpacePt / spaceCount;
        offsetX = 0;
      } else {
        offsetX = 0;
        wordSpacingPt = 0;
      }
      break;
    }
    case 'left':
    default: {
      offsetX = 0;
      break;
    }
  }

  const effectiveLineWidthPt =
    align === 'justify' && !isLastLineOfParagraph && words.length > 1
      ? effectiveColumnWidthPt
      : scaledLineWidthPt;

  return {
    text,
    offsetX,
    wordSpacingPt,
    charSpacingPt,
    horizontalScalePercent,
    effectiveLineWidthPt,
  };
}
