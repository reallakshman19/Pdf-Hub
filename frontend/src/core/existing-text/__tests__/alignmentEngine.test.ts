import { describe, it, expect } from 'vitest';
import { computeLineAlignmentLayout } from '../alignmentEngine';

describe('Typographic Alignment Engine', () => {
  const columnWidthPt = 200;
  const lineWidthPt = 120; // 80pt remaining space

  it('computes left alignment with zero offset and zero extra word spacing', () => {
    const layout = computeLineAlignmentLayout('Hello World', lineWidthPt, columnWidthPt, 'left');
    expect(layout.offsetX).toBe(0);
    expect(layout.wordSpacingPt).toBe(0);
    expect(layout.charSpacingPt).toBe(0);
    expect(layout.effectiveLineWidthPt).toBe(120);
  });

  it('computes center alignment with exact midpoint offset', () => {
    const layout = computeLineAlignmentLayout('Centered Heading', lineWidthPt, columnWidthPt, 'center');
    // remainingSpace = 200 - 120 = 80 -> offset = 40
    expect(layout.offsetX).toBe(40);
    expect(layout.wordSpacingPt).toBe(0);
  });

  it('computes right alignment with full remaining space offset', () => {
    const layout = computeLineAlignmentLayout('$1,234.56', lineWidthPt, columnWidthPt, 'right');
    // remainingSpace = 200 - 120 = 80 -> offset = 80
    expect(layout.offsetX).toBe(80);
    expect(layout.wordSpacingPt).toBe(0);
  });

  it('computes justified alignment distributing space across inter-word gaps', () => {
    // 3 words -> 2 spaces. remainingSpace = 80pt -> wordSpacingPt = 40pt
    const layout = computeLineAlignmentLayout('Word1 Word2 Word3', lineWidthPt, columnWidthPt, 'justify', false);
    expect(layout.offsetX).toBe(0);
    expect(layout.wordSpacingPt).toBeCloseTo(40, 0.01);
    expect(layout.effectiveLineWidthPt).toBe(200);
  });

  it('formats last line of justified paragraph as left-aligned without inflated spacing', () => {
    const layout = computeLineAlignmentLayout('Final closing line.', lineWidthPt, columnWidthPt, 'justify', true);
    expect(layout.offsetX).toBe(0);
    expect(layout.wordSpacingPt).toBe(0);
    expect(layout.effectiveLineWidthPt).toBe(120);
  });

  it('applies horizontal scaling (Tz) in offset calculations', () => {
    // If text is horizontally scaled to 90%, lineWidth = 120 * 0.9 = 108pt.
    // remainingSpace = 200 - 108 = 92pt -> center offset = 46pt.
    const layout = computeLineAlignmentLayout(
      'Condensed Text',
      lineWidthPt,
      columnWidthPt,
      'center',
      false,
      { horizontalScalePercent: 90 },
    );
    expect(layout.horizontalScalePercent).toBe(90);
    expect(layout.offsetX).toBeCloseTo(46, 0.01);
  });

  it('applies letter spacing (Tc) in offset calculations', () => {
    // text length = 5 ('A B C'). 4 gaps * 2pt = 8pt extra tracking.
    // effective width = 120 + 8 = 128pt.
    // remaining space = 200 - 128 = 72pt.
    // right offset = 72pt.
    const layout = computeLineAlignmentLayout(
      'A B C',
      lineWidthPt,
      columnWidthPt,
      'right',
      false,
      { letterSpacingPt: 2 },
    );
    expect(layout.charSpacingPt).toBe(2);
    expect(layout.offsetX).toBe(72);
  });
});
