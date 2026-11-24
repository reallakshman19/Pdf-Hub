import { describe, it, expect } from 'vitest';
import { reflowTextAcrossColumns } from '../multiColumnReflowEngine';
import type { MultiColumnLayout } from '../columnFlowTypes';

describe('Multi-Column Reflow Engine', () => {
  const layout: MultiColumnLayout = {
    pageIndex: 0,
    pageId: 'page-1',
    columnCount: 2,
    readingOrder: [0, 1],
    averageLeadingPt: 14,
    fontSizePt: 12,
    fontName: 'Helvetica',
    columns: [
      {
        columnIndex: 0,
        leftPt: 72,
        topPt: 700,
        widthPt: 200,
        heightPt: 56, // Allows 4 lines (56 / 14 = 4)
        gutterRightPt: 24,
        maxLines: 4,
        baselineYsPt: [700, 686, 672, 658],
      },
      {
        columnIndex: 1,
        leftPt: 296,
        topPt: 700,
        widthPt: 200,
        heightPt: 56, // Allows 4 lines
        gutterRightPt: 0,
        maxLines: 4,
        baselineYsPt: [700, 686, 672, 658],
      },
    ],
  };

  it('fits short text entirely within column 0 without spillover', () => {
    const text = 'This is a short paragraph fitting in the first column.';
    const result = reflowTextAcrossColumns(text, layout);

    expect(result.columnsUsed).toBe(1);
    expect(result.overflowsEntireLayout).toBe(false);
    expect(result.segments[0].columnIndex).toBe(0);
    expect(result.segments[0].isTerminalColumn).toBe(true);
    expect(result.segments[0].lines.length).toBeLessThanOrEqual(4);
  });

  it('flows overflow text from column 0 into column 1 when column 0 reaches maxLines', () => {
    // 50 words will exceed 4 lines of width 200 (~6 words/line -> ~24 words per column)
    const words = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ');
    const result = reflowTextAcrossColumns(words, layout);

    expect(result.columnsUsed).toBe(2);
    expect(result.segments).toHaveLength(2);

    // Column 0 should have exactly maxLines (4)
    expect(result.segments[0].columnIndex).toBe(0);
    expect(result.segments[0].lines).toHaveLength(4);
    expect(result.segments[0].isTerminalColumn).toBe(false);

    // Column 1 should have the spillover lines
    expect(result.segments[1].columnIndex).toBe(1);
    expect(result.segments[1].lines.length).toBeGreaterThan(0);
    expect(result.segments[1].isTerminalColumn).toBe(true);
    expect(result.segments[1].lineBaselinesPt[0].x).toBe(296);
  });

  it('detects overflow when text exceeds capacity of all columns combined', () => {
    // 150 words will exceed both columns (4 + 4 = 8 lines total)
    const longText = Array.from({ length: 120 }, (_, i) => `textblock${i + 1}`).join(' ');
    const result = reflowTextAcrossColumns(longText, layout);

    expect(result.columnsUsed).toBe(2);
    expect(result.overflowsEntireLayout).toBe(true);
    expect(result.spillOverText).toBeDefined();
    expect(result.totalLines).toBe(8);
  });

  it('uses measureTextWidth callback when provided for exact typographic reflow (Finding F-03)', () => {
    // Custom measureTextWidth simulating a wide font (each char = 12pt)
    const customMeasure = (str: string) => str.length * 12;
    const text = 'alpha beta gamma delta epsilon zeta eta';
    const result = reflowTextAcrossColumns(text, layout, {
      measureTextWidth: customMeasure,
    });

    expect(result.columnsUsed).toBeGreaterThan(0);
    // With 12pt per char, 'alpha' is 60pt, 'alpha beta' is 120pt, 'alpha beta gamma' is 192pt <= 200pt
    expect(result.segments[0].lines[0]).toBe('alpha beta gamma');
  });

  it('adjusts width ratio for Courier monospace fonts vs Helvetica (Finding F-03)', () => {
    const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
    const helveticaResult = reflowTextAcrossColumns(text, layout, { fontName: 'Helvetica' });
    const courierResult = reflowTextAcrossColumns(text, layout, { fontName: 'Courier' });

    // Courier monospace has higher width ratio (0.60 vs 0.52), wrapping lines earlier
    expect(courierResult.segments[0].lines.length).toBeGreaterThanOrEqual(
      helveticaResult.segments[0].lines.length,
    );
  });
});
