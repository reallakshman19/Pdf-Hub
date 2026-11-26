import { describe, it, expect } from 'vitest';
import {
  computeCadCalloutGeometry,
  snapKneeAngle,
} from '../callout-geometry';
import type { CalloutLeaderBranch, Rect } from '../types';

describe('OnBoard-IR: CAD Multi-Leader & Underline Shelf Geometry Falsifiers (Mini-Phase N.1)', () => {
  const standardBox: Rect = { x: 200, y: 200, width: 120, height: 50 };

  // ── FALSIFY-CAD-01: Underline shelf strictly maintains horizontal orientation (Δy = 0) ──
  it('FALSIFY-CAD-01: enforces strictly horizontal shelf (Δy = 0) across all 4 quadrants', () => {
    const quadrants = [
      { name: 'Quadrant 1 (Top-Right)', anchor: { x: 450, y: 100 }, expectedSide: 'right' },
      { name: 'Quadrant 2 (Top-Left)', anchor: { x: 50, y: 100 }, expectedSide: 'left' },
      { name: 'Quadrant 3 (Bottom-Left)', anchor: { x: 50, y: 350 }, expectedSide: 'left' },
      { name: 'Quadrant 4 (Bottom-Right)', anchor: { x: 450, y: 350 }, expectedSide: 'right' },
    ];

    for (const q of quadrants) {
      const branches: CalloutLeaderBranch[] = [
        { id: `branch-${q.name}`, anchor: q.anchor, arrowHead: 'open' },
      ];

      // Test underline style
      const resultUnderline = computeCadCalloutGeometry(standardBox, branches, {
        shelfStyle: 'underline',
        shelfLength: 20,
      });

      expect(resultUnderline.shelf.side, `Quadrant ${q.name} side mismatch`).toBe(q.expectedSide);
      expect(resultUnderline.shelf.start.y, `Quadrant ${q.name} underline shelf start Y`).toBe(standardBox.y + standardBox.height);
      expect(resultUnderline.shelf.end.y, `Quadrant ${q.name} underline shelf end Y`).toBe(standardBox.y + standardBox.height);
      // Strictly horizontal: Δy === 0
      expect(resultUnderline.shelf.end.y - resultUnderline.shelf.start.y).toBe(0);

      if (q.expectedSide === 'right') {
        expect(resultUnderline.shelf.start.x).toBe(standardBox.x + standardBox.width);
        expect(resultUnderline.shelf.end.x).toBe(standardBox.x + standardBox.width + 20);
      } else {
        expect(resultUnderline.shelf.start.x).toBe(standardBox.x);
        expect(resultUnderline.shelf.end.x).toBe(standardBox.x - 20);
      }

      // Test midpoint style
      const resultMidpoint = computeCadCalloutGeometry(standardBox, branches, {
        shelfStyle: 'midpoint',
        shelfLength: 15,
      });

      expect(resultMidpoint.shelf.start.y).toBe(standardBox.y + standardBox.height / 2);
      expect(resultMidpoint.shelf.end.y).toBe(standardBox.y + standardBox.height / 2);
      expect(resultMidpoint.shelf.end.y - resultMidpoint.shelf.start.y).toBe(0);
    }
  });

  // ── FALSIFY-CAD-02: Multi-leader shared shelf branching routes 5 simultaneous leaders ──
  it('FALSIFY-CAD-02: correctly routes 5 branching leaders sharing a single landing shelf', () => {
    // 5 leader targets fanning out to the left
    const fiveBranches: CalloutLeaderBranch[] = [
      { id: 'leader-1', anchor: { x: 50, y: 150 }, arrowHead: 'open' },
      { id: 'leader-2', anchor: { x: 60, y: 200 }, arrowHead: 'filled' },
      { id: 'leader-3', anchor: { x: 50, y: 250 }, arrowHead: 'circle' },
      { id: 'leader-4', anchor: { x: 70, y: 300 }, arrowHead: 'slash' },
      { id: 'leader-5', anchor: { x: 40, y: 350 }, arrowHead: 'square' },
    ];

    const result = computeCadCalloutGeometry(standardBox, fiveBranches, {
      shelfStyle: 'underline',
      shelfLength: 25,
    });

    expect(result.shelf.side).toBe('left');
    expect(result.leaders.length).toBe(5);

    const sharedShelfPoint = result.shelf.end;

    for (let i = 0; i < 5; i++) {
      const leader = result.leaders[i];
      const sourceBranch = fiveBranches[i];

      expect(leader.id).toBe(sourceBranch.id);
      expect(leader.arrowHead).toBe(sourceBranch.arrowHead);
      expect(leader.anchorPoint).toEqual(sourceBranch.anchor);

      // In oblique CAD drafting, leader shaft connects back to the shared shelf endpoint
      expect(leader.shelfPoint).toEqual(sharedShelfPoint);

      // Verify path points sequence: [shelf.start, shelf.end, anchor]
      expect(leader.points.length).toBe(3);
      expect(leader.points[0]).toEqual(result.shelf.start);
      expect(leader.points[1]).toEqual(sharedShelfPoint);
      expect(leader.points[2]).toEqual(sourceBranch.anchor);
    }
  });

  // ── FALSIFY-CAD-03: Arrowhead angle precisely matches shaft vector direction within 0.001 rad ──
  it('FALSIFY-CAD-03: computes exact arrowhead incoming vector angle for arbitrary oblique shafts', () => {
    const shelfEnd = { x: 180, y: 250 };
    const anglesToTest = [
      { deg: 0, dx: 100, dy: 0 },
      { deg: 30, dx: 100 * Math.cos(Math.PI / 6), dy: 100 * Math.sin(Math.PI / 6) },
      { deg: 45, dx: 100 * Math.cos(Math.PI / 4), dy: 100 * Math.sin(Math.PI / 4) },
      { deg: 90, dx: 0, dy: 100 },
      { deg: 150, dx: -100 * Math.cos(Math.PI / 6), dy: 100 * Math.sin(Math.PI / 6) },
      { deg: 210, dx: -100 * Math.cos(Math.PI / 6), dy: -100 * Math.sin(Math.PI / 6) },
      { deg: 315, dx: 100 * Math.cos(Math.PI / 4), dy: -100 * Math.sin(Math.PI / 4) },
    ];

    const branches: CalloutLeaderBranch[] = anglesToTest.map((t, idx) => ({
      id: `angle-test-${idx}`,
      anchor: { x: Math.round(shelfEnd.x + t.dx), y: Math.round(shelfEnd.y + t.dy) },
      arrowHead: 'filled',
    }));

    const result = computeCadCalloutGeometry(standardBox, branches, {
      shelfStyle: 'underline',
      shelfLength: 20,
    });

    for (let i = 0; i < branches.length; i++) {
      const leader = result.leaders[i];
      const prevPoint = leader.points[leader.points.length - 2];
      const expectedAngle = Math.atan2(leader.anchorPoint.y - prevPoint.y, leader.anchorPoint.x - prevPoint.x);

      expect(Math.abs(leader.arrowAngleRad - expectedAngle)).toBeLessThan(0.0001);
    }
  });

  // ── FALSIFY-CAD-04: Knee snapping locks to 15, 30, 45, 60, 90 degrees within tolerance ──
  it('FALSIFY-CAD-04: snaps candidate knees to standard drafting angles within 4 deg tolerance', () => {
    const origin = { x: 100, y: 100 };
    const radius = 50;

    // Test near 30 degrees: 28.5 degrees (within 4 deg tolerance of 30)
    const angle28_5 = (28.5 * Math.PI) / 180;
    const candidate30 = {
      x: origin.x + radius * Math.cos(angle28_5),
      y: origin.y + radius * Math.sin(angle28_5),
    };
    const snapped30 = snapKneeAngle(candidate30, origin, [0, 15, 30, 45, 60, 90], 4);
    const snapped30Angle = (Math.atan2(snapped30.y - origin.y, snapped30.x - origin.x) * 180) / Math.PI;

    expect(Math.abs(snapped30Angle - 30)).toBeLessThan(0.01);
    expect(Math.abs(Math.hypot(snapped30.x - origin.x, snapped30.y - origin.y) - radius)).toBeLessThan(0.01);

    // Test near 45 degrees: 43.8 degrees (within 4 deg tolerance of 45)
    const angle43_8 = (43.8 * Math.PI) / 180;
    const candidate45 = {
      x: origin.x + radius * Math.cos(angle43_8),
      y: origin.y + radius * Math.sin(angle43_8),
    };
    const snapped45 = snapKneeAngle(candidate45, origin, [0, 15, 30, 45, 60, 90], 4);
    const snapped45Angle = (Math.atan2(snapped45.y - origin.y, snapped45.x - origin.x) * 180) / Math.PI;

    expect(Math.abs(snapped45Angle - 45)).toBeLessThan(0.01);

    // Test out of tolerance: 22.5 degrees (not within 4 deg of 15 or 30)
    const angle22_5 = (22.5 * Math.PI) / 180;
    const candidate22_5 = {
      x: origin.x + radius * Math.cos(angle22_5),
      y: origin.y + radius * Math.sin(angle22_5),
    };
    const unsnapped = snapKneeAngle(candidate22_5, origin, [0, 15, 30, 45, 60, 90], 4);

    expect(unsnapped.x).toBeCloseTo(candidate22_5.x, 3);
    expect(unsnapped.y).toBeCloseTo(candidate22_5.y, 3);
  });

  // ── FALSIFY-CAD-05: Bounding box non-inversion and NaN safety on zero-width boxes ──
  it('FALSIFY-CAD-05: maintains non-inverted valid bounding boxes even on zero-dimension degeneracies', () => {
    const degenerateBoxes: Rect[] = [
      { x: 100, y: 100, width: 0, height: 0 },
      { x: -50, y: -80, width: 20, height: 10 },
      { x: NaN as unknown as number, y: NaN as unknown as number, width: 0, height: 0 },
    ];

    for (const box of degenerateBoxes) {
      const branches: CalloutLeaderBranch[] = [
        { id: 'b1', anchor: { x: 300, y: 300 } },
      ];

      const result = computeCadCalloutGeometry(box, branches);

      expect(Number.isFinite(result.boundingBox.x)).toBe(true);
      expect(Number.isFinite(result.boundingBox.y)).toBe(true);
      expect(result.boundingBox.width).toBeGreaterThan(0);
      expect(result.boundingBox.height).toBeGreaterThan(0);

      // Verify text box is enclosed
      if (Number.isFinite(box.x) && Number.isFinite(box.y)) {
        expect(result.boundingBox.x).toBeLessThanOrEqual(box.x);
        expect(result.boundingBox.y).toBeLessThanOrEqual(box.y);
      }

      // Verify all leader points are strictly inside bounding box
      for (const leader of result.leaders) {
        for (const pt of leader.points) {
          expect(pt.x).toBeGreaterThanOrEqual(result.boundingBox.x);
          expect(pt.x).toBeLessThanOrEqual(result.boundingBox.x + result.boundingBox.width);
          expect(pt.y).toBeGreaterThanOrEqual(result.boundingBox.y);
          expect(pt.y).toBeLessThanOrEqual(result.boundingBox.y + result.boundingBox.height);
        }
      }
    }
  });
});
