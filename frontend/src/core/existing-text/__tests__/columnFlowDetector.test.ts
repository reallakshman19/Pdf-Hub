import { describe, it, expect } from 'vitest';
import { detectMultiColumnLayoutFromSpans } from '../columnFlowDetector';
import { buildExistingTextSpan } from '../model';

describe('Multi-Column Layout Detector', () => {
  const context = {
    revisionId: 'rev-1',
    pageId: 'page-1',
    pageIndex: 0,
  };

  it('detects a clean 2-column layout with 24pt gutter', () => {
    // Column 0: x in [72, 272] (width 200), y in [700, 680, 660, 640]
    // Gutter: [272, 296] (width 24)
    // Column 1: x in [296, 496] (width 200), y in [700, 680, 660, 640]
    const spans = [
      buildExistingTextSpan(context, {
        sourceIndex: 0,
        text: 'Column 1 Line 1',
        transform: [12, 0, 0, 12, 72, 700],
        width: 180,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 1,
        text: 'Column 1 Line 2',
        transform: [12, 0, 0, 12, 72, 680],
        width: 175,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 2,
        text: 'Column 1 Line 3',
        transform: [12, 0, 0, 12, 72, 660],
        width: 170,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 3,
        text: 'Column 2 Line 1',
        transform: [12, 0, 0, 12, 296, 700],
        width: 185,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 4,
        text: 'Column 2 Line 2',
        transform: [12, 0, 0, 12, 296, 680],
        width: 180,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 5,
        text: 'Column 2 Line 3',
        transform: [12, 0, 0, 12, 296, 660],
        width: 178,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
    ];

    const layout = detectMultiColumnLayoutFromSpans(spans, 0, 'page-1');
    expect(layout).not.toBeNull();
    expect(layout?.columnCount).toBe(2);
    expect(layout?.columns[0].leftPt).toBe(72);
    expect(layout?.columns[0].gutterRightPt).toBeGreaterThanOrEqual(12);
    expect(layout?.columns[1].leftPt).toBe(296);
    expect(layout?.readingOrder).toEqual([0, 1]);
  });

  it('rejects layout when gutter between clusters is narrower than 12pt', () => {
    // Column 0 right is 200, Column 1 left is 205 (gutter only 5pt)
    const spans = [
      buildExistingTextSpan(context, {
        sourceIndex: 0,
        text: 'Left 1',
        transform: [12, 0, 0, 12, 50, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 1,
        text: 'Left 2',
        transform: [12, 0, 0, 12, 50, 680],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 2,
        text: 'Right 1',
        transform: [12, 0, 0, 12, 205, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 3,
        text: 'Right 2',
        transform: [12, 0, 0, 12, 205, 680],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
    ];

    const layout = detectMultiColumnLayoutFromSpans(spans, 0, 'page-1');
    expect(layout).toBeNull();
  });

  it('returns null for single column spans', () => {
    const spans = [
      buildExistingTextSpan(context, {
        sourceIndex: 0,
        text: 'Single Column Paragraph Line 1',
        transform: [12, 0, 0, 12, 72, 700],
        width: 450,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 1,
        text: 'Single Column Paragraph Line 2',
        transform: [12, 0, 0, 12, 72, 685],
        width: 440,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 2,
        text: 'Single Column Paragraph Line 3',
        transform: [12, 0, 0, 12, 72, 670],
        width: 430,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 3,
        text: 'Single Column Paragraph Line 4',
        transform: [12, 0, 0, 12, 72, 655],
        width: 410,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
    ];

    const layout = detectMultiColumnLayoutFromSpans(spans, 0, 'page-1');
    expect(layout).toBeNull();
  });
});
