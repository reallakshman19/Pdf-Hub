import { describe, it, expect } from 'vitest';
import type { DetectedTableCell } from '../tableCellTypes';
import { computeTableCellFit } from '../tableCellFitEngine';

function makeMockCell(
  width: number,
  suggestedAlignment: 'left' | 'center' | 'right' = 'left',
): DetectedTableCell {
  return {
    tableId: 't1',
    rowIndex: 1,
    columnIndex: 1,
    bounds: { x: 100, y: 200, width, height: 20 },
    spanIds: ['s1'],
    text: '$50.00',
    isHeader: false,
    suggestedAlignment,
  };
}

// Proportional mock width measure: length * (fontSize * 0.5)
const mockMeasureWidth = (text: string, fontSize: number) => text.length * fontSize * 0.5;

describe('tableCellFitEngine', () => {
  it('preserves 100% horizontal scale and font size when text fits naturally', () => {
    // Cell width 100pt, padding 3pt => maxAllowedWidth = 94pt
    // "$50.00" length = 6 => width at 10pt = 30pt <= 94pt
    const cell = makeMockCell(100, 'right');
    const result = computeTableCellFit(cell, '$50.00', mockMeasureWidth, 10);

    expect(result.horizontalScalingPercent).toBe(100);
    expect(result.effectiveFontSizePt).toBe(10);
    expect(result.isSqueezed).toBe(false);
    expect(result.isSteppedDown).toBe(false);
    expect(result.isOverflowing).toBe(false);
    expect(result.alignment).toBe('right');
    // Right alignment check: baselineXPts = 100 + 3 + (94 - 30) = 167
    expect(result.baselineXPts).toBeCloseTo(167, 1);
  });

  it('squeezes horizontal scale (Tz) without reducing font size for moderate overflow', () => {
    // Cell width 60pt => maxAllowed = 54pt
    // Replacement: "$123,456.78" length = 11 => width at 10pt = 55pt > 54pt
    // Ratio = 54 / 55 = 0.9818 => Tz = 98%
    const cell = makeMockCell(60, 'right');
    const result = computeTableCellFit(cell, '$123,456.78', mockMeasureWidth, 10);

    expect(result.horizontalScalingPercent).toBeLessThan(100);
    expect(result.horizontalScalingPercent).toBeGreaterThanOrEqual(75);
    expect(result.effectiveFontSizePt).toBe(10);
    expect(result.isSqueezed).toBe(true);
    expect(result.isSteppedDown).toBe(false);
    expect(result.isOverflowing).toBe(false);
  });

  it('applies font size step-down when text overflows beyond the 75% Tz squeeze floor', () => {
    // Cell width 50pt => maxAllowed = 44pt
    // Text length = 16 => width at 10pt = 80pt
    // At Tz = 75%, width = 60pt > 44pt
    // Step down ratio = 44 / 60 = 0.733 -> clamped to min ratio 0.8
    const cell = makeMockCell(50, 'left');
    const result = computeTableCellFit(cell, 'Long Account No.', mockMeasureWidth, 10, {
      minFontSizeStepDownRatio: 0.7,
    });

    expect(result.horizontalScalingPercent).toBe(75);
    expect(result.effectiveFontSizePt).toBeLessThan(10);
    expect(result.isSqueezed).toBe(true);
    expect(result.isSteppedDown).toBe(true);
  });

  it('flags isOverflowing when text exceeds both 75% Tz squeeze and step-down minimums', () => {
    // Cell width 30pt => maxAllowed = 24pt
    // Text length = 30 => width at 10pt = 150pt
    const cell = makeMockCell(30, 'left');
    const result = computeTableCellFit(
      cell,
      'Extremely Long Cell Content That Exceeds All Limits',
      mockMeasureWidth,
      10,
    );

    expect(result.isOverflowing).toBe(true);
    expect(result.horizontalScalingPercent).toBe(75);
  });

  it('computes centered baseline origin for center-aligned text', () => {
    // Cell width 100pt => maxAllowed = 94pt
    // "2026-11-23" length = 10 => width at 10pt = 50pt
    // Center offset = (94 - 50) / 2 = 22pt
    // baselineXPts = 100 + 3 + 22 = 125pt
    const cell = makeMockCell(100, 'center');
    const result = computeTableCellFit(cell, '2026-11-23', mockMeasureWidth, 10);

    expect(result.alignment).toBe('center');
    expect(result.xOffsetPt).toBeCloseTo(22, 1);
    expect(result.baselineXPts).toBeCloseTo(125, 1);
  });
});
