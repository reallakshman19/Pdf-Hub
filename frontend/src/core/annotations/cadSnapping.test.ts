import { describe, expect, it } from 'vitest';
import {
  constrainAngleTo45,
  constrainAngleToIsometric,
  extractSnapPointsFromAnnotation,
  collectPageSnapPoints,
  findSnapTarget,
  resolveLineEndpoint,
} from './cadSnapping';
import type { PdfAnnotation } from './types';

describe('cadSnapping engine', () => {
  describe('extractSnapPointsFromAnnotation', () => {
    it('extracts endpoints and midpoint for a linear annotation', () => {
      const lineAnn: PdfAnnotation = {
        id: 'line-1',
        type: 'line',
        pageNumber: 1,
        rect: { x: 100, y: 100, width: 200, height: 0 },
        createdAt: 1,
        updatedAt: 1,
        data: {
          points: [100, 100, 300, 100],
        },
      };

      const points = extractSnapPointsFromAnnotation(lineAnn);
      // Vertices: (100, 100) and (300, 100)
      const endpoints = points.filter((p) => p.kind === 'endpoint');
      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].point).toEqual({ x: 100, y: 100 });
      expect(endpoints[1].point).toEqual({ x: 300, y: 100 });

      // Midpoint: (200, 100)
      const midpoints = points.filter((p) => p.kind === 'midpoint');
      expect(midpoints.some((p) => p.point.x === 200 && p.point.y === 100)).toBe(true);
    });

    it('extracts callout leader anchor, knee, and branch anchor', () => {
      const calloutAnn: PdfAnnotation = {
        id: 'callout-1',
        type: 'callout',
        pageNumber: 1,
        rect: { x: 200, y: 200, width: 100, height: 50 },
        createdAt: 1,
        updatedAt: 1,
        data: {
          text: 'Rest\nAxial Stop',
          anchor: { x: 50, y: 50 },
          knee: { x: 120, y: 150 },
          leaders: [
            {
              id: 'branch-1',
              anchor: { x: 80, y: 90 },
              knee: { x: 140, y: 160 },
            },
          ],
        },
      };

      const points = extractSnapPointsFromAnnotation(calloutAnn);
      const calloutAnchor = points.find((p) => p.point.x === 50 && p.point.y === 50);
      expect(calloutAnchor).toBeDefined();
      expect(calloutAnchor?.kind).toBe('endpoint');

      const calloutKnee = points.find((p) => p.point.x === 120 && p.point.y === 150);
      expect(calloutKnee).toBeDefined();
      expect(calloutKnee?.kind).toBe('vertex');

      const branchAnchor = points.find((p) => p.point.x === 80 && p.point.y === 90);
      expect(branchAnchor).toBeDefined();
      expect(branchAnchor?.kind).toBe('endpoint');
    });

    it('extracts corners, edge midpoints, and center of bounding box', () => {
      const rectAnn: PdfAnnotation = {
        id: 'rect-1',
        type: 'shape-rect',
        pageNumber: 1,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        createdAt: 1,
        updatedAt: 1,
        data: {},
      };

      const points = extractSnapPointsFromAnnotation(rectAnn);
      const corners = points.filter((p) => p.kind === 'corner');
      expect(corners).toHaveLength(4);

      const center = points.find((p) => p.kind === 'center');
      expect(center?.point).toEqual({ x: 50, y: 50 });

      const edgeMidpoints = points.filter((p) => p.kind === 'midpoint');
      expect(edgeMidpoints).toHaveLength(4);
    });
  });

  describe('collectPageSnapPoints', () => {
    it('filters annotations by page and respects excludeIds', () => {
      const annotations: PdfAnnotation[] = [
        {
          id: 'p1-ann',
          type: 'shape-rect',
          pageNumber: 1,
          rect: { x: 10, y: 10, width: 20, height: 20 },
          createdAt: 1,
          updatedAt: 1,
          data: {},
        },
        {
          id: 'p2-ann',
          type: 'shape-rect',
          pageNumber: 2,
          rect: { x: 50, y: 50, width: 20, height: 20 },
          createdAt: 1,
          updatedAt: 1,
          data: {},
        },
      ];

      const page1Points = collectPageSnapPoints(annotations, 1);
      expect(page1Points.length).toBeGreaterThan(0);
      expect(page1Points.every((p) => p.annotationId === 'p1-ann')).toBe(true);

      const excludedPoints = collectPageSnapPoints(annotations, 1, ['p1-ann']);
      expect(excludedPoints).toHaveLength(0);
    });
  });

  describe('findSnapTarget', () => {
    it('snaps to nearest candidate point within threshold', () => {
      const snapPoints = [
        { point: { x: 100, y: 100 }, kind: 'endpoint' as const },
        { point: { x: 200, y: 200 }, kind: 'vertex' as const },
      ];

      // Cursor at (102, 103) is distance ~3.6 from (100, 100)
      const res = findSnapTarget({ x: 102, y: 103 }, snapPoints, 8);
      expect(res.snapped).toBe(true);
      expect(res.point).toEqual({ x: 100, y: 100 });
      expect(res.kind).toBe('endpoint');
      expect(res.distance).toBeCloseTo(3.605, 2);
    });

    it('does not snap if cursor is outside threshold', () => {
      const snapPoints = [
        { point: { x: 100, y: 100 }, kind: 'endpoint' as const },
      ];

      // Cursor at (120, 120) is distance ~28.28 from (100, 100)
      const res = findSnapTarget({ x: 120, y: 120 }, snapPoints, 8);
      expect(res.snapped).toBe(false);
      expect(res.point).toEqual({ x: 120, y: 120 });
    });
  });

  describe('constrainAngleTo45', () => {
    const origin = { x: 0, y: 0 };

    it('locks nearly horizontal vectors to 0°', () => {
      const target = { x: 100, y: 5 }; // ~2.8 degrees
      const constrained = constrainAngleTo45(origin, target);
      expect(constrained.x).toBeCloseTo(100.12, 1);
      expect(constrained.y).toBeCloseTo(0, 1);
    });

    it('locks diagonal vectors to 45°', () => {
      const target = { x: 100, y: 90 }; // ~42 degrees
      const constrained = constrainAngleTo45(origin, target);
      const expectedDist = Math.hypot(100, 90);
      expect(constrained.x).toBeCloseTo(expectedDist * Math.cos(Math.PI / 4), 1);
      expect(constrained.y).toBeCloseTo(expectedDist * Math.sin(Math.PI / 4), 1);
      expect(constrained.x).toEqual(constrained.y);
    });

    it('locks nearly vertical vectors to 90°', () => {
      const target = { x: 4, y: 100 }; // ~87.7 degrees
      const constrained = constrainAngleTo45(origin, target);
      expect(constrained.x).toBeCloseTo(0, 1);
      expect(constrained.y).toBeCloseTo(100.08, 1);
    });

    it('handles zero-length vector without crashing', () => {
      const target = { x: 0, y: 0 };
      const constrained = constrainAngleTo45(origin, target);
      expect(constrained).toEqual({ x: 0, y: 0 });
    });
  });

  describe('constrainAngleToIsometric', () => {
    const origin = { x: 0, y: 0 };

    it('locks ~35° vectors to standard 30° isometric axis', () => {
      const target = { x: 86.6, y: 55 }; // ~32.4 degrees
      const constrained = constrainAngleToIsometric(origin, target);
      const dist = Math.hypot(86.6, 55);
      expect(constrained.x).toBeCloseTo(dist * Math.cos(Math.PI / 6), 1);
      expect(constrained.y).toBeCloseTo(dist * Math.sin(Math.PI / 6), 1);
    });

    it('locks ~85° vectors to vertical 90° elevation axis', () => {
      const target = { x: 10, y: 100 }; // ~84.3 degrees
      const constrained = constrainAngleToIsometric(origin, target);
      const dist = Math.hypot(10, 100);
      expect(constrained.x).toBeCloseTo(0, 1);
      expect(constrained.y).toBeCloseTo(dist, 1);
    });

    it('locks ~145° vectors to 150° isometric axis', () => {
      const target = { x: -85, y: 50 }; // ~149.5 degrees
      const constrained = constrainAngleToIsometric(origin, target);
      const dist = Math.hypot(-85, 50);
      expect(constrained.x).toBeCloseTo(dist * Math.cos((5 * Math.PI) / 6), 1);
      expect(constrained.y).toBeCloseTo(dist * Math.sin((5 * Math.PI) / 6), 1);
    });
  });
});

describe('resolveLineEndpoint', () => {
  it('uses the raw cursor when nothing is in snap range', () => {
    const result = resolveLineEndpoint({ x: 0, y: 0 }, { x: 120, y: 40 }, [], false);
    expect(result.point).toEqual({ x: 120, y: 40 });
    expect(result.snapResult).toBeNull();
    expect(result.angleConstrained).toBe(false);
  });

  it('snaps to a nearby candidate', () => {
    const result = resolveLineEndpoint(
      { x: 0, y: 0 },
      { x: 101, y: 99 },
      [{ point: { x: 100, y: 100 }, kind: 'endpoint', annotationId: 'a' }],
      false,
    );
    expect(result.point).toEqual({ x: 100, y: 100 });
    expect(result.snapResult?.snapped).toBe(true);
  });

  it('constrains to 45 degree steps when shift is held, ignoring snaps', () => {
    const result = resolveLineEndpoint(
      { x: 0, y: 0 },
      { x: 100, y: 5 },
      [{ point: { x: 100, y: 5 }, kind: 'endpoint', annotationId: 'a' }],
      true,
    );
    expect(result.point.y).toBeCloseTo(0, 3);
    expect(result.angleConstrained).toBe(true);
    expect(result.snapResult).toBeNull();
  });
});
