import { describe, expect, it } from 'vitest';
import {
  classifySegmentIntersection,
  generateCandidateBox,
  routeRectHits,
  segmentIntersectsRect,
} from './layoutGeometry';
import {
  createLeaderRoute,
  generateLeaderRoutes,
  normalizeRoutePoints,
} from './leaderRouter';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';

function expectOrthogonal(points: readonly { readonly x: number; readonly y: number }[]): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    if (!start || !end) continue;
    expect(start.x === end.x || start.y === end.y).toBe(true);
    expect(start).not.toEqual(end);
  }
}

const horizontal = [{ x: 0, y: 0 }, { x: 10, y: 0 }] as const;
const vectorInput = {
  id: 'route-callout',
  psNo: 'PS-ROUTE',
  content: { isoNoteValue: 'Route test', confidence: 'HIGH' as const },
  targetPoint: { x: 100, y: 100 },
  boxPlacement: { x: 180, y: 40, width: 160 },
  style: { isReview: false, fontSize: 10 },
};

describe('orthogonal leader routing and geometry', () => {
  it('normalizes duplicate and collinear points before rendering', () => {
    expect(normalizeRoutePoints([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
    ]);
  });

  it('rejects zero-length-only and diagonal routes', () => {
    expect(() => createLeaderRoute([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ])).toThrow('at least two distinct points');
    expect(() => createLeaderRoute([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
    ])).toThrow('diagonal');
  });

  it('generates deterministic one-elbow and two-elbow alternatives', () => {
    const routes = generateLeaderRoutes(
      { x: 20, y: 20, width: 60, height: 30 },
      { x: 120, y: 100 },
    );
    expect(routes.map((route) => route.kind)).toEqual([
      'one-elbow-hv',
      'one-elbow-vh',
      'two-elbow-hvh',
      'two-elbow-vhv',
    ]);
    for (const route of routes) expectOrthogonal(route.points);
  });

  it('emits direct routes only for already aligned endpoints', () => {
    const routes = generateLeaderRoutes(
      { x: 20, y: 20, width: 60, height: 30 },
      { x: 120, y: 35 },
    );
    expect(routes).toHaveLength(1);
    expect(routes[0]?.kind).toBe('direct');
    expectOrthogonal(routes[0]?.points ?? []);
  });

  it('classifies proper crossings, endpoint touches, and collinear overlap', () => {
    expect(classifySegmentIntersection(
      horizontal[0], horizontal[1], { x: 5, y: -5 }, { x: 5, y: 5 },
    )).toBe('cross');
    expect(classifySegmentIntersection(
      horizontal[0], horizontal[1], { x: 10, y: 0 }, { x: 10, y: 5 },
    )).toBe('touch');
    expect(classifySegmentIntersection(
      horizontal[0], horizontal[1], { x: 4, y: 0 }, { x: 12, y: 0 },
    )).toBe('overlap');
    expect(classifySegmentIntersection(
      horizontal[0], horizontal[1], { x: 12, y: 0 }, { x: 4, y: 0 },
    )).toBe('overlap');
    expect(classifySegmentIntersection(
      horizontal[0], horizontal[1], { x: 11, y: 0 }, { x: 12, y: 0 },
    )).toBe('none');
  });

  it('detects rectangle-edge touching and interior crossing', () => {
    const rect = { x: 10, y: -2, width: 4, height: 4 };
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 10, y: 0 }, rect)).toBe('touch');
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 12, y: 0 }, rect)).toBe('cross');
  });

  it('checks every actual route segment instead of the straight chord', () => {
    const route = createLeaderRoute([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(routeRectHits(
      route,
      { x: 4, y: 4, width: 2, height: 2 },
      { x: 10, y: 10 },
    )).toEqual([]);
    expect(routeRectHits(
      route,
      { x: -1, y: 4, width: 2, height: 2 },
      { x: 10, y: 10 },
    )).toHaveLength(1);
  });

  it('exempts only a final-point touch at the route own target', () => {
    const route = createLeaderRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(routeRectHits(
      route,
      { x: 10, y: -1, width: 2, height: 2 },
      { x: 10, y: 0 },
    )).toEqual([]);
    expect(routeRectHits(
      route,
      { x: 9, y: -1, width: 2, height: 2 },
      { x: 10, y: 0 },
    )).toHaveLength(1);
  });

  it('does not exempt a final segment that traverses the target obstacle', () => {
    const route = createLeaderRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(routeRectHits(
      route,
      { x: 0, y: -1, width: 10, height: 2 },
      { x: 10, y: 0 },
    )).toEqual([{ segmentIndex: 0, kind: 'cross' }]);
  });

  it('generates the approved exact greedy-trap candidate boxes', () => {
    const target = { x: 230, y: 190 };
    expect(generateCandidateBox(target, 160, 56, 'right', 640, 420, 20)).toEqual({
      x: 258,
      y: 162,
      width: 160,
      height: 56,
    });
    expect(generateCandidateBox(target, 160, 56, 'top', 640, 420, 20)).toEqual({
      x: 150,
      y: 106,
      width: 160,
      height: 56,
    });
  });
});

describe('ordered route primitives', () => {
  it('preserves the M001 no-route primitive behavior', () => {
    const plan = buildVectorCalloutPlan(vectorInput);
    expect(plan.primitives.slice(0, 3).map((primitive) => primitive.type)).toEqual([
      'line',
      'circle',
      'rectangle',
    ]);
  });

  it('renders supplied route segments in point order before marker and box', () => {
    const route = Object.freeze([
      Object.freeze({ x: 180, y: 70 }),
      Object.freeze({ x: 140, y: 70 }),
      Object.freeze({ x: 140, y: 100 }),
      Object.freeze({ x: 100, y: 100 }),
    ] as const);
    const plan = buildVectorCalloutPlan({ ...vectorInput, leaderRoute: route });
    const lines = plan.primitives.filter((primitive) => primitive.type === 'line');

    expect(plan.primitives.slice(0, 5).map((primitive) => primitive.type)).toEqual([
      'line',
      'line',
      'line',
      'circle',
      'rectangle',
    ]);
    expect(lines.map((line) => [line.start, line.end])).toEqual([
      [{ x: 180, y: 70 }, { x: 140, y: 70 }],
      [{ x: 140, y: 70 }, { x: 140, y: 100 }],
      [{ x: 140, y: 100 }, { x: 100, y: 100 }],
    ]);
    expect(lines.every((line) => line.start.x === line.end.x
      || line.start.y === line.end.y)).toBe(true);
    expect(lines[0]?.start).not.toBe(route[0]);
  });

  it('rejects diagonal, zero-length, and non-terminating explicit routes', () => {
    expect(() => buildVectorCalloutPlan({
      ...vectorInput,
      leaderRoute: [{ x: 180, y: 70 }, { x: 100, y: 100 }],
    })).toThrow('exactly horizontal or vertical');
    expect(() => buildVectorCalloutPlan({
      ...vectorInput,
      leaderRoute: [{ x: 180, y: 70 }, { x: 180, y: 70 }, { x: 100, y: 100 }],
    })).toThrow('non-zero length');
    expect(() => buildVectorCalloutPlan({
      ...vectorInput,
      leaderRoute: [{ x: 180, y: 70 }, { x: 180, y: 90 }],
    })).toThrow('terminate at targetPoint');
  });
});
