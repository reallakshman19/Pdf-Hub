import { describe, it, expect } from 'vitest';
import {
  calculateFrameRepositioning,
  calculateFrameResizeReflow,
  isFrameIntersectingMarquee,
  getMarqueeIntersectingFrames,
  createFrameFromSpans,
} from '../frameGeometry';
import type { ExistingTextFrame, FrameRect } from '../frameManipulationTypes';
import type { ExistingTextSpan } from '../types';

describe('frameGeometry engine', () => {
  const dummyFrame: ExistingTextFrame = {
    frameId: 'frame-test-1',
    revisionId: 'rev-1',
    pageIndex: 0,
    pageId: 'page-1',
    bounds: { x: 50, y: 100, width: 200, height: 40 },
    originalBounds: { x: 50, y: 100, width: 200, height: 40 },
    text: 'The quick brown fox jumps over the lazy dog repeatedly.',
    spanIds: ['span-1'],
    fontSizePt: 12,
    leadingPt: 16,
  };

  const pageSize = { width: 612, height: 792 }; // Letter

  describe('calculateFrameRepositioning', () => {
    it('clamps frame coordinates within page boundaries', () => {
      // Trying to drag past left edge
      const pos1 = calculateFrameRepositioning(dummyFrame, { x: -20, y: 50 }, pageSize, { centerSnap: false });
      expect(pos1.x).toBe(0);

      // Trying to drag past right edge (612 - 200 = 412)
      const pos2 = calculateFrameRepositioning(dummyFrame, { x: 500, y: 50 }, pageSize, { centerSnap: false });
      expect(pos2.x).toBe(412);

      // Trying to drag past bottom edge (792 - 40 = 752)
      const pos3 = calculateFrameRepositioning(dummyFrame, { x: 100, y: 800 }, pageSize, { centerSnap: false });
      expect(pos3.y).toBe(752);
    });

    it('snaps magnetically to horizontal and vertical page centerlines', () => {
      const pageCenterX = 612 / 2; // 306
      const expectedTargetX = pageCenterX - dummyFrame.bounds.width / 2; // 306 - 100 = 206

      // Raw target within threshold (e.g. 208 is 2pt away from 206)
      const pos = calculateFrameRepositioning(dummyFrame, { x: 208, y: 300 }, pageSize, {
        snapThreshold: 8,
      });
      expect(pos.x).toBe(expectedTargetX);
    });

    it('snaps magnetically to margins', () => {
      const margins = { left: 72, top: 72, right: 72, bottom: 72 };
      // Raw target at 75 is within 8pt of 72
      const pos = calculateFrameRepositioning(dummyFrame, { x: 75, y: 74 }, pageSize, {
        margins,
        snapThreshold: 8,
      });
      expect(pos.x).toBe(72);
      expect(pos.y).toBe(72);
    });
  });

  describe('calculateFrameResizeReflow', () => {
    it('dynamically re-wraps text into more lines as width decreases', () => {
      // Wide width (e.g. 400pt) -> 1 or 2 lines
      const wide = calculateFrameResizeReflow(dummyFrame, 400);
      expect(wide.lines.length).toBeLessThanOrEqual(2);

      // Narrow width (e.g. 100pt) -> 4+ lines
      const narrow = calculateFrameResizeReflow(dummyFrame, 100);
      expect(narrow.lines.length).toBeGreaterThan(wide.lines.length);
      expect(narrow.newHeightPt).toBeGreaterThan(wide.newHeightPt);
    });

    it('enforces minimum width boundary', () => {
      const result = calculateFrameResizeReflow(dummyFrame, 10, { minWidthPt: 50 });
      expect(result.newWidthPt).toBe(50);
    });
  });

  describe('isFrameIntersectingMarquee & getMarqueeIntersectingFrames', () => {
    const frameA: ExistingTextFrame = {
      ...dummyFrame,
      frameId: 'frame-A',
      bounds: { x: 50, y: 50, width: 100, height: 30 },
    };

    const frameB: ExistingTextFrame = {
      ...dummyFrame,
      frameId: 'frame-B',
      bounds: { x: 200, y: 50, width: 100, height: 30 },
    };

    const frameC: ExistingTextFrame = {
      ...dummyFrame,
      frameId: 'frame-C',
      bounds: { x: 400, y: 300, width: 100, height: 30 },
    };

    it('identifies intersecting frames and filters disjoint frames', () => {
      // Marquee covers x: 40..250, y: 40..100 (intersects A and B, excludes C)
      const marquee: FrameRect = { x: 40, y: 40, width: 210, height: 60 };
      expect(isFrameIntersectingMarquee(marquee, frameA.bounds)).toBe(true);
      expect(isFrameIntersectingMarquee(marquee, frameB.bounds)).toBe(true);
      expect(isFrameIntersectingMarquee(marquee, frameC.bounds)).toBe(false);

      const captured = getMarqueeIntersectingFrames(marquee, [frameA, frameB, frameC]);
      expect(captured).toEqual(['frame-A', 'frame-B']);
    });
  });

  describe('createFrameFromSpans', () => {
    it('constructs an accurate ExistingTextFrame from spans', () => {
      const spans: ExistingTextSpan[] = [
        {
          id: 's1',
          revisionId: 'rev-1',
          pageId: 'p1',
          pageIndex: 0,
          sourceIndex: 0,
          text: 'Hello',
          transform: [12, 0, 0, 12, 50, 100],
          originPt: { x: 50, y: 100 },
          advanceWidthPt: 30,
          sourceHeightPt: 12,
          horizontalScalePt: 12,
          fontSizePt: 12,
          rotationDegrees: 0,
          skewCosine: 1,
          hasEol: false,
          editability: 'native-replacement-candidate',
          reasons: [],
        },
        {
          id: 's2',
          revisionId: 'rev-1',
          pageId: 'p1',
          pageIndex: 0,
          sourceIndex: 1,
          text: 'World',
          transform: [12, 0, 0, 12, 85, 100],
          originPt: { x: 85, y: 100 },
          advanceWidthPt: 35,
          sourceHeightPt: 12,
          horizontalScalePt: 12,
          fontSizePt: 12,
          rotationDegrees: 0,
          skewCosine: 1,
          hasEol: true,
          editability: 'native-replacement-candidate',
          reasons: [],
        },
      ];

      const frame = createFrameFromSpans(spans, 0, 'p1', 'rev-1');
      expect(frame).not.toBeNull();
      expect(frame!.text).toBe('Hello World');
      expect(frame!.bounds.x).toBe(50);
      expect(frame!.bounds.y).toBe(100);
      expect(frame!.bounds.width).toBe(70); // 85 + 35 - 50 = 70
    });
  });
});
