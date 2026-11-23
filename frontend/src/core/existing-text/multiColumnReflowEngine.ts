/**
 * Multi-Column Reflow Engine.
 * Flows text across linked columns in reading order, handling overflow and spillover.
 * Pure TypeScript (INV-4 compliant).
 */

import type {
  MultiColumnLayout,
  MultiColumnReflowResult,
  ColumnFlowSegment,
  MultiColumnReflowOptions,
} from './columnFlowTypes';

export function resolveCharWidthRatio(fontName?: string, overrideRatio?: number): number {
  if (typeof overrideRatio === 'number' && overrideRatio > 0) {
    return overrideRatio;
  }
  if (!fontName) return 0.52;
  const lower = fontName.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono')) {
    return 0.60;
  }
  if (lower.includes('bold') || lower.includes('black') || lower.includes('heavy')) {
    return 0.56;
  }
  if (lower.includes('times')) {
    return 0.50;
  }
  return 0.52;
}

export function reflowTextAcrossColumns(
  text: string,
  layout: MultiColumnLayout,
  options?: MultiColumnReflowOptions,
): MultiColumnReflowResult {
  const fontSizePt = options?.fontSizePt ?? layout.fontSizePt ?? 12;
  const leadingPt = options?.leadingPt ?? layout.averageLeadingPt ?? fontSizePt * 1.2;
  const fontName = options?.fontName ?? layout.fontName;
  const charWidthRatio = resolveCharWidthRatio(fontName, options?.charWidthRatio);

  const measureText: (str: string) => number =
    options?.measureTextWidth ??
    ((str: string) => str.length * fontSizePt * charWidthRatio);

  // Split text into words while preserving explicit newlines
  const paragraphs = text.split('\n');
  const allWords: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const words = p.split(/\s+/).filter(Boolean);
    allWords.push(...words);
    if (i < paragraphs.length - 1) {
      allWords.push('\n');
    }
  }

  let wordIndex = 0;
  const segments: ColumnFlowSegment[] = [];
  let totalLines = 0;

  for (let colIdx = 0; colIdx < layout.readingOrder.length; colIdx++) {
    const columnIndex = layout.readingOrder[colIdx];
    const column = layout.columns[columnIndex];
    if (!column) continue;

    const columnWidth = column.widthPt;
    const maxLines = Math.max(1, column.maxLines);
    const columnLines: string[] = [];

    let currentLineWords: string[] = [];
    let currentLineWidth = 0;

    while (wordIndex < allWords.length && columnLines.length < maxLines) {
      const word = allWords[wordIndex];

      if (word === '\n') {
        // Explicit newline forces end of line
        columnLines.push(currentLineWords.join(' '));
        currentLineWords = [];
        currentLineWidth = 0;
        wordIndex++;
        continue;
      }

      const wordWidth = measureText(word);
      const spaceWidth = measureText(' ');
      const testWidth =
        currentLineWidth === 0
          ? wordWidth
          : currentLineWidth + spaceWidth + wordWidth;

      if (testWidth <= columnWidth || currentLineWords.length === 0) {
        currentLineWords.push(word);
        currentLineWidth = testWidth;
        wordIndex++;
      } else {
        // Line full
        columnLines.push(currentLineWords.join(' '));
        currentLineWords = [];
        currentLineWidth = 0;
      }
    }

    if (currentLineWords.length > 0 && columnLines.length < maxLines) {
      columnLines.push(currentLineWords.join(' '));
    }

    if (columnLines.length > 0) {
      // Calculate baseline Y coordinates for this column
      const baselines: Array<{ x: number; y: number }> = [];
      const topY =
        column.baselineYsPt.length > 0
          ? column.baselineYsPt[0]
          : column.topPt - fontSizePt;

      for (let lineI = 0; lineI < columnLines.length; lineI++) {
        const y =
          lineI < column.baselineYsPt.length
            ? column.baselineYsPt[lineI]
            : topY - lineI * leadingPt;
        baselines.push({
          x: column.leftPt,
          y,
        });
      }

      const isTerminalColumn =
        wordIndex >= allWords.length || colIdx === layout.readingOrder.length - 1;

      segments.push({
        columnIndex,
        lines: columnLines,
        lineBaselinesPt: baselines,
        columnBoundsPt: {
          x: column.leftPt,
          y: column.topPt - column.heightPt,
          width: column.widthPt,
          height: column.heightPt,
        },
        isTerminalColumn,
      });

      totalLines += columnLines.length;
    }

    if (wordIndex >= allWords.length) {
      break;
    }
  }

  const overflowsEntireLayout = wordIndex < allWords.length;
  const remainingWords = overflowsEntireLayout
    ? allWords.slice(wordIndex).join(' ')
    : undefined;

  return {
    totalLines,
    columnsUsed: segments.length,
    overflowsEntireLayout,
    segments,
    spillOverText: remainingWords,
  };
}
