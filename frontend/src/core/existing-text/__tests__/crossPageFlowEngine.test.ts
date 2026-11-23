import { describe, it, expect } from 'vitest';
import { executeCrossPageFlow } from '../crossPageFlowEngine';
import type { CrossPageFlowIntent } from '../crossPageFlowTypes';
import type { MultiColumnLayout } from '../columnFlowTypes';

describe('Cross-Page Flow Engine', () => {
  const sourceLayout: MultiColumnLayout = {
    pageIndex: 0,
    pageId: 'page-0',
    columnCount: 1,
    readingOrder: [0],
    averageLeadingPt: 16,
    fontSizePt: 12,
    fontName: 'Helvetica',
    columns: [
      {
        columnIndex: 0,
        leftPt: 72,
        topPt: 700,
        widthPt: 200,
        heightPt: 48, // 3 lines max
        gutterRightPt: 0,
        maxLines: 3,
        baselineYsPt: [700, 684, 668],
      },
    ],
  };

  const targetLayout: MultiColumnLayout = {
    pageIndex: 1,
    pageId: 'page-1',
    columnCount: 1,
    readingOrder: [0],
    averageLeadingPt: 16,
    fontSizePt: 12,
    fontName: 'Helvetica',
    columns: [
      {
        columnIndex: 0,
        leftPt: 72,
        topPt: 750,
        widthPt: 200,
        heightPt: 80, // 5 lines max
        gutterRightPt: 0,
        maxLines: 5,
        baselineYsPt: [750, 734, 718, 702, 686],
      },
    ],
  };

  it('keeps short text entirely on source page without spillover to target page', () => {
    const intent: CrossPageFlowIntent = {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout,
      targetLayout,
      text: 'Short line of text fitting page zero.',
    };

    const result = executeCrossPageFlow(intent);
    expect(result.sourceLinesEmitted).toBeGreaterThan(0);
    expect(result.targetLinesEmitted).toBe(0);
    expect(result.targetSegments).toHaveLength(0);
    expect(result.overflowsTargetLayout).toBe(false);
  });

  it('flows overflow text from Page 0 into Page 1 when Page 0 capacity is exceeded', () => {
    // 35 words will exceed 3 lines of 200pt (~15-18 words max)
    const longText = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(' ');
    const intent: CrossPageFlowIntent = {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout,
      targetLayout,
      text: longText,
    };

    const result = executeCrossPageFlow(intent);
    expect(result.sourceLinesEmitted).toBe(3); // Exactly 3 lines on Page 0
    expect(result.targetLinesEmitted).toBeGreaterThan(0); // Spilled into Page 1
    expect(result.targetSegments[0].lines.length).toBeGreaterThan(0);
    expect(result.targetSegments[0].lineBaselinesPt[0].y).toBeLessThanOrEqual(750);
  });

  it('enforces header exclusion zone on target page so text is not drawn above header threshold', () => {
    const longText = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(' ');
    const intent: CrossPageFlowIntent = {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout,
      targetLayout,
      text: longText,
      headerExclusionTopPt: 720, // Must exclude 750 and 734
    };

    const result = executeCrossPageFlow(intent);
    expect(result.targetLinesEmitted).toBeGreaterThan(0);
    // All target baselines must be <= 720
    for (const seg of result.targetSegments) {
      for (const pt of seg.lineBaselinesPt) {
        expect(pt.y).toBeLessThanOrEqual(720);
      }
    }
  });

  it('throws LAYOUT_CAPACITY_EXCEEDED when overflowPolicy is fail-closed', () => {
    const longText = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(' ');
    const intent: CrossPageFlowIntent = {
      schemaVersion: 1,
      sourceRevisionId: 'rev-1',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout,
      targetLayout,
      text: longText,
      overflowPolicy: 'fail-closed',
    };

    expect(() => executeCrossPageFlow(intent)).toThrow(/LAYOUT_CAPACITY_EXCEEDED/);
  });
});
