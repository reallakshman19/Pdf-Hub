import { describe, expect, it } from 'vitest';
import { snapLineEndpoints } from '../spatialSnap';
import { mergeCollinearSegments } from '../collinearMerge';
import { circumcircle3Points, evaluateCubicBezier, fitArcToBezier } from '../arcFitting';
import { cleanAndNormalizeGeometry } from '../cleanGeometry';
import type { CadCubicBezier, CadHarvestedPageGeometry, CadLineSegment } from '../types';

describe('CAD Geometry Normalization - Mini-Phase O.2 Snapping, Merging & Arc Fitting', () => {
  describe('Arc Fitting & Bezier Evaluation Primitives', () => {
    it('evaluates cubic Bezier at parameter extremes and midpoint', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 0, y: 50 };
      const p2 = { x: 100, y: 50 };
      const p3 = { x: 100, y: 0 };

      const pt0 = evaluateCubicBezier(p0, p1, p2, p3, 0);
      const pt1 = evaluateCubicBezier(p0, p1, p2, p3, 1);
      const ptMid = evaluateCubicBezier(p0, p1, p2, p3, 0.5);

      expect(pt0).toEqual(p0);
      expect(pt1).toEqual(p3);
      expect(ptMid.x).toBeCloseTo(50);
      expect(ptMid.y).toBeCloseTo(37.5);
    });

    it('computes exact circumcircle through 3 non-collinear points', () => {
      // 3 points on circle of radius 5 centered at (10, 10)
      const pA = { x: 5, y: 10 };
      const pB = { x: 10, y: 15 };
      const pC = { x: 15, y: 10 };

      const circle = circumcircle3Points(pA, pB, pC);
      expect(circle).not.toBeNull();
      if (circle) {
        expect(circle.center.x).toBeCloseTo(10);
        expect(circle.center.y).toBeCloseTo(10);
        expect(circle.radius).toBeCloseTo(5);
      }

      // Collinear points return null
      const collinear = circumcircle3Points({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 });
      expect(collinear).toBeNull();
    });
  });

  describe('FALSIFY-CLEAN-01: Spatial Endpoint Snapping', () => {
    it('snaps near-coincident vertices within epsilon and drops collapsed micro-segments', () => {
      // Two segments that should touch at (100, 100), but have slight jitter: (100.1, 99.9) and (99.95, 100.05)
      const lines: CadLineSegment[] = [
        {
          id: 'l1',
          start: { x: 50, y: 50 },
          end: { x: 100.1, y: 99.9 },
          length: 70.7,
        },
        {
          id: 'l2',
          start: { x: 99.95, y: 100.05 },
          end: { x: 150, y: 50 },
          length: 70.7,
        },
        // Micro segment that collapses
        {
          id: 'l3_micro',
          start: { x: 200, y: 200 },
          end: { x: 200.05, y: 200.05 },
          length: 0.07,
        },
      ];

      const snapRes = snapLineEndpoints(lines, 0.5);

      // Micro-segment collapsed and dropped
      expect(snapRes.droppedDegenerateCount).toBe(1);
      expect(snapRes.lines).toHaveLength(2);

      // The junction point of l1 and l2 should now match exactly
      const snappedL1 = snapRes.lines[0];
      const snappedL2 = snapRes.lines[1];
      expect(snappedL1.end.x).toBeCloseTo(snappedL2.start.x, 5);
      expect(snappedL1.end.y).toBeCloseTo(snappedL2.start.y, 5);
      expect(snapRes.snappedVertexCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FALSIFY-CLEAN-02: Collinear Segment Merging', () => {
    it('merges contiguous collinear line segments with identical styles into a single line', () => {
      // 3 collinear segments forming (0, 10) -> (20, 10) -> (50, 10) -> (100, 10)
      const lines: CadLineSegment[] = [
        {
          id: 's1',
          start: { x: 0, y: 10 },
          end: { x: 20, y: 10 },
          length: 20,
          strokeColor: '#000000',
          strokeWidth: 1,
        },
        {
          id: 's2',
          start: { x: 20, y: 10 },
          end: { x: 50, y: 10 },
          length: 30,
          strokeColor: '#000000',
          strokeWidth: 1,
        },
        {
          id: 's3',
          start: { x: 50, y: 10 },
          end: { x: 100, y: 10 },
          length: 50,
          strokeColor: '#000000',
          strokeWidth: 1,
        },
      ];

      const mergeRes = mergeCollinearSegments(lines);

      expect(mergeRes.mergedCount).toBe(2);
      expect(mergeRes.lines).toHaveLength(1);

      const merged = mergeRes.lines[0];
      expect(merged.start).toEqual({ x: 0, y: 10 });
      expect(merged.end).toEqual({ x: 100, y: 10 });
      expect(merged.length).toBeCloseTo(100);
    });
  });

  describe('FALSIFY-CLEAN-03: Non-Collinear & Style Isolation', () => {
    it('strictly preserves sharp corners and segments with different stroke colors or widths', () => {
      const lines: CadLineSegment[] = [
        // Corner at 90 degrees
        {
          id: 'c1',
          start: { x: 0, y: 0 },
          end: { x: 50, y: 0 },
          length: 50,
          strokeColor: '#000000',
          strokeWidth: 1,
        },
        {
          id: 'c2',
          start: { x: 50, y: 0 },
          end: { x: 50, y: 50 },
          length: 50,
          strokeColor: '#000000',
          strokeWidth: 1,
        },
        // Collinear with c1, but different stroke color (red)
        {
          id: 'c3_red',
          start: { x: 50, y: 0 },
          end: { x: 100, y: 0 },
          length: 50,
          strokeColor: '#ff0000',
          strokeWidth: 1,
        },
        // Collinear with c1, same color, but different stroke width (3)
        {
          id: 'c4_thick',
          start: { x: 100, y: 0 },
          end: { x: 150, y: 0 },
          length: 50,
          strokeColor: '#000000',
          strokeWidth: 3,
        },
      ];

      const mergeRes = mergeCollinearSegments(lines);

      // None of these should be merged together
      expect(mergeRes.mergedCount).toBe(0);
      expect(mergeRes.lines).toHaveLength(4);
    });
  });

  describe('FALSIFY-CLEAN-04: Arc Fitting from Cubic Bezier', () => {
    it('accurately fits a standard 90-degree circular arc cubic Bezier into CadArcPrimitive', () => {
      // 90-degree circular arc centered at (100, 100) with radius R = 50 from 0 to 90 degrees (pi/2)
      // Standard cubic Bezier control constant k = (4/3) * (sqrt(2) - 1) * R ~= 0.5522847 * 50 = 27.614237
      const cx = 100;
      const cy = 100;
      const R = 50;
      const k = 0.5522847498 * R;

      const p0 = { x: cx + R, y: cy }; // (150, 100)
      const p1 = { x: cx + R, y: cy + k }; // (150, 127.614)
      const p2 = { x: cx + k, y: cy + R }; // (127.614, 150)
      const p3 = { x: cx, y: cy + R }; // (100, 150)

      const bezier: CadCubicBezier = {
        id: 'arc_b1',
        p0,
        p1,
        p2,
        p3,
        strokeColor: '#0033aa',
        strokeWidth: 1.5,
      };

      const arc = fitArcToBezier(bezier, { maxError: 0.1 });

      expect(arc).not.toBeNull();
      if (arc) {
        expect(arc.center.x).toBeCloseTo(cx, 1);
        expect(arc.center.y).toBeCloseTo(cy, 1);
        expect(arc.radius).toBeCloseTo(R, 1);
        expect(arc.startAngleRad).toBeCloseTo(0, 2);
        expect(arc.endAngleRad).toBeCloseTo(Math.PI / 2, 2);
        expect(arc.strokeColor).toBe('#0033aa');
        expect(arc.strokeWidth).toBe(1.5);
      }
    });

    it('rejects an arbitrary S-shaped cubic Bezier from being misclassified as an arc', () => {
      // S-curve Bezier
      const bezier: CadCubicBezier = {
        id: 's_curve',
        p0: { x: 0, y: 0 },
        p1: { x: 50, y: 100 },
        p2: { x: -50, y: 100 },
        p3: { x: 100, y: 200 },
      };

      const arc = fitArcToBezier(bezier);
      expect(arc).toBeNull();
    });
  });

  describe('FALSIFY-CLEAN-05: End-to-End Page Geometry Normalization', () => {
    it('cleans jittered lines, merges fragmented collinear paths, and extracts arcs in a unified page model', () => {
      const R = 40;
      const k = 0.5522847498 * R;

      const raw: CadHarvestedPageGeometry = {
        pageNumber: 1,
        pageWidth: 612,
        pageHeight: 792,
        lines: [
          // Segmented line with jitter: (10, 10) -> (30.1, 10.05) -> (60, 10)
          { id: 'l1', start: { x: 10, y: 10 }, end: { x: 30.1, y: 10.05 }, length: 20.1, strokeColor: '#000', strokeWidth: 1 },
          { id: 'l2', start: { x: 30.0, y: 10.0 }, end: { x: 60, y: 10 }, length: 30, strokeColor: '#000', strokeWidth: 1 },
          // Micro segment to drop
          { id: 'l_micro', start: { x: 80, y: 80 }, end: { x: 80.01, y: 80.01 }, length: 0.014 },
          // Perpendicular sharp line
          { id: 'l_perp', start: { x: 60, y: 10 }, end: { x: 60, y: 40 }, length: 30, strokeColor: '#000', strokeWidth: 1 },
        ],
        beziers: [
          // Circular arc
          {
            id: 'b_arc',
            p0: { x: 100 + R, y: 100 },
            p1: { x: 100 + R, y: 100 + k },
            p2: { x: 100 + k, y: 100 + R },
            p3: { x: 100, y: 100 + R },
            strokeColor: '#000',
            strokeWidth: 1,
          },
          // Non-arc curve
          {
            id: 'b_freeform',
            p0: { x: 0, y: 0 },
            p1: { x: 20, y: 80 },
            p2: { x: 80, y: -20 },
            p3: { x: 100, y: 100 },
          },
        ],
        rectangles: [
          { id: 'r1', x: 200, y: 200, width: 50, height: 30, strokeColor: '#000', strokeWidth: 1 },
        ],
        paths: [],
        totalExtractedSegments: 6,
      };

      const result = cleanAndNormalizeGeometry(raw, { snapEpsilon: 0.5 });

      expect(result.pageNumber).toBe(1);
      expect(result.droppedDegenerateCount).toBe(1);
      expect(result.mergedCollinearCount).toBe(1);
      expect(result.fittedArcCount).toBe(1);

      // Lines should be merged (10, 10) -> (60, 10) + perp line (60, 10) -> (60, 40)
      expect(result.lines).toHaveLength(2);
      expect(result.arcs).toHaveLength(1);
      expect(result.beziers).toHaveLength(1); // Only freeform curve remains
      expect(result.rectangles).toHaveLength(1);

      expect(result.totalPrimitives).toBe(5); // 2 lines + 1 arc + 1 bezier + 1 rect
    });
  });
});
