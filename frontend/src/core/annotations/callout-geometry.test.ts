import { describe, it, expect } from 'vitest';
import { computeCalloutPath, computeMultiCalloutPaths, findNearestEdge, snapKneeToOrtho } from './callout-geometry';
import type { CalloutLeaderBranch, Rect } from './types';

describe('callout geometry & multi-leader routing', () => {
  const boxRect: Rect = { x: 100, y: 100, width: 80, height: 40 };

  it('routes single callout elbow path to nearest edge with strictly orthogonal segments', () => {
    // Anchor to the right of the box
    const anchor = { x: 250, y: 160 };
    const path = computeCalloutPath(anchor, boxRect, { leaderStyle: 'elbow' });

    expect(path.points.length).toBe(3); // edge, knee, anchor
    expect(path.edgePoint).toEqual({ x: 180, y: 120 }); // right edge at center-y
    expect(path.kneePoint).toEqual({ x: 250, y: 120 }); // horizontal shelf to x=250 at y=120
    expect(path.anchorPoint).toEqual(anchor); // vertical drop to y=160 at x=250

    // Segment 1 (edge -> knee) is strictly horizontal: Δy === 0
    expect(path.kneePoint!.y).toBe(path.edgePoint.y);
    // Segment 2 (knee -> anchor) is strictly vertical: Δx === 0
    expect(path.kneePoint!.x).toBe(path.anchorPoint.x);
  });

  it('prioritizes side exit for CAD callouts when anchor is outside horizontally', () => {
    // Target is lower-right: x is outside, y is lower
    const anchorRight = { x: 240, y: 220 };
    const edgeRight = findNearestEdge(anchorRight, boxRect);
    expect(edgeRight.side).toBe('right');
    expect(edgeRight.point).toEqual({ x: 180, y: 120 });

    // Target is lower-left
    const anchorLeft = { x: 40, y: 200 };
    const edgeLeft = findNearestEdge(anchorLeft, boxRect);
    expect(edgeLeft.side).toBe('left');
    expect(edgeLeft.point).toEqual({ x: 100, y: 120 });
  });

  it('magnetically snaps knee point to horizontal shelf and vertical drop', () => {
    const edgePoint = { x: 180, y: 120 };
    const anchorPoint = { x: 280, y: 200 };

    // Candidate knee near horizontal shelf (y=124 is within snapThreshold 10 of y=120)
    const rawKnee1 = { x: 230, y: 124 };
    const snapped1 = snapKneeToOrtho(rawKnee1, edgePoint, anchorPoint, 'right', 10);
    expect(snapped1.y).toBe(120); // snapped to horizontal shelf

    // Candidate knee near vertical drop (x=278 is within snapThreshold 10 of x=280)
    const rawKnee2 = { x: 278, y: 150 };
    const snapped2 = snapKneeToOrtho(rawKnee2, edgePoint, anchorPoint, 'right', 10);
    expect(snapped2.x).toBe(280); // snapped to vertical drop
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
