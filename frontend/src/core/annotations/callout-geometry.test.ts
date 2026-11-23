import { describe, it, expect } from 'vitest';
import { computeCalloutPath, computeMultiCalloutPaths } from './callout-geometry';
import type { CalloutLeaderBranch, Rect } from './types';

describe('callout geometry & multi-leader routing', () => {
  const boxRect: Rect = { x: 100, y: 100, width: 80, height: 40 };

  it('routes single callout elbow path to nearest edge', () => {
    // Anchor to the right of the box
    const anchor = { x: 250, y: 120 };
    const path = computeCalloutPath(anchor, boxRect, { leaderStyle: 'elbow' });

    expect(path.points.length).toBe(3); // edge, knee, anchor
    expect(path.edgePoint).toEqual({ x: 180, y: 120 }); // right edge
    expect(path.anchorPoint).toEqual(anchor);
  });

  it('routes straight leader path without knee', () => {
    const anchor = { x: 50, y: 50 };
    const path = computeCalloutPath(anchor, boxRect, { leaderStyle: 'straight' });

    expect(path.points.length).toBe(2); // edge, anchor
    expect(path.kneePoint).toBeNull();
  });

  it('computes independent paths for multiple branching leaders', () => {
    const branches: CalloutLeaderBranch[] = [
      {
        id: 'branch-1',
        anchor: { x: 250, y: 120 }, // pointing right
        leaderStyle: 'elbow',
        arrowHead: 'open',
      },
      {
        id: 'branch-2',
        anchor: { x: 140, y: 220 }, // pointing down
        leaderStyle: 'straight',
        arrowHead: 'filled',
      },
      {
        id: 'branch-3',
        anchor: { x: 40, y: 120 }, // pointing left
        leaderStyle: 'elbow',
        arrowHead: 'circle',
      },
    ];

    const multi = computeMultiCalloutPaths(branches, boxRect);

    expect(multi.length).toBe(3);
    expect(multi[0].id).toBe('branch-1');
    expect(multi[0].arrowHead).toBe('open');
    expect(multi[0].edgePoint.x).toBe(180); // exits right edge

    expect(multi[1].id).toBe('branch-2');
    expect(multi[1].arrowHead).toBe('filled');
    expect(multi[1].edgePoint.y).toBe(140); // exits bottom edge

    expect(multi[2].id).toBe('branch-3');
    expect(multi[2].arrowHead).toBe('circle');
    expect(multi[2].edgePoint.x).toBe(100); // exits left edge
  });
});
