import type {
  ExistingTextParagraphBlock,
  ExistingTextParagraphReflowOptions,
  ExistingTextParagraphReflowResult,
  ExistingTextReflowLine,
} from './paragraphTypes';
import type { ExistingTextFitRect } from './fitTypes';
import { computeLineAlignmentLayout } from './alignmentEngine';

export type TextWidthMeasurementFn = (text: string, fontSizePt: number) => number;

export function defaultApproximateTextWidth(text: string, fontSizePt: number): number {
  // Conservative estimate: 0.52em average character width for standard sans-serif
  return text.length * fontSizePt * 0.52;
}

export function reflowParagraphText(
  paragraph: ExistingTextParagraphBlock,
  replacementText: string,
  options?: ExistingTextParagraphReflowOptions,
  measureWidth: TextWidthMeasurementFn = defaultApproximateTextWidth,
): ExistingTextParagraphReflowResult {
  const fontSizePt = options?.fontSizePt ?? paragraph.fontSizePt;
  const leadingPt = options?.leadingPt ?? paragraph.leadingPt;
  const columnWidthPt = Math.max(
    options?.columnWidthPt ?? paragraph.columnWidthPt,
    fontSizePt * 2,
  );

  const spaceWidth = measureWidth(' ', fontSizePt);

  // Split on manual hard newlines first
  const manualLines = replacementText.split(/\r?\n/);
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
      const wordWidth = measureWidth(word, fontSizePt);

      if (currentLine.length === 0) {
        currentLine = word;
        currentLineWidth = wordWidth;
      } else if (currentLineWidth + spaceWidth + wordWidth <= columnWidthPt) {
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

  // Handle case where text is completely empty
  if (wrappedLines.length === 0) {
    wrappedLines.push('');
  }

  const firstBaseline = paragraph.lines[0]?.baselinePt ?? {
    x: paragraph.boundsPt.x,
    y: paragraph.boundsPt.y + paragraph.boundsPt.height - fontSizePt,
  };

  const align = options?.align ?? options?.styleOverride?.align ?? 'left';
  const horizontalScalePercent =
    options?.horizontalScalePercent ?? options?.styleOverride?.horizontalScalePercent ?? 100;
  const letterSpacingPt =
    options?.letterSpacingPt ?? options?.styleOverride?.letterSpacingPt ?? 0;

  let minX = firstBaseline.x;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const lines: ExistingTextReflowLine[] = wrappedLines.map((lineText, index) => {
    const advanceWidthPt = lineText.length > 0 ? measureWidth(lineText, fontSizePt) : 0;
    const isLastLineOfParagraph = index === wrappedLines.length - 1;
    const alignmentLayout = computeLineAlignmentLayout(
      lineText,
      advanceWidthPt,
      columnWidthPt,
      align,
      isLastLineOfParagraph,
      {
        horizontalScalePercent,
        letterSpacingPt,
      },
    );

    const x = firstBaseline.x + alignmentLayout.offsetX;
    const y = firstBaseline.y - index * leadingPt;
    const height = fontSizePt * 1.2;
    const rectY = y - fontSizePt * 0.25;

    minX = Math.min(minX, x);
    minY = Math.min(minY, rectY);
    maxX = Math.max(maxX, x + Math.max(alignmentLayout.effectiveLineWidthPt, advanceWidthPt, 1));
    maxY = Math.max(maxY, rectY + height);

    const boundsPt: ExistingTextFitRect = {
      x,
      y: rectY,
      width: alignmentLayout.effectiveLineWidthPt,
      height,
    };

    return {
      lineIndex: index,
      text: lineText,
      advanceWidthPt,
      baselinePt: { x, y },
      boundsPt,
      alignmentLayout,
    };
  });

  const aggregateBoundsPt: ExistingTextFitRect = {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, columnWidthPt),
    height: Math.max(maxY - minY, fontSizePt),
  };

  const totalHeightPt = lines.length * leadingPt;
  const lineCountDelta = lines.length - paragraph.lines.length;

  return {
    lines,
    columnWidthPt,
    leadingPt,
    boundsPt: aggregateBoundsPt,
    totalHeightPt,
    lineCountDelta,
  };
}
