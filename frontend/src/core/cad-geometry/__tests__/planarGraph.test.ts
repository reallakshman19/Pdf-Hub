import { describe, expect, it } from 'vitest';
import {
  buildPlanarGraph,
  computeSignedPolygonArea,
  extractClosedLoops,
} from '../planarGraph';
import type { CadLineSegment } from '../types';

describe('CAD Planar Topological Graph & Closed Loop Detector (DCEL) - Mini-Phase O.3', () => {
  describe('FALSIFY-DCEL-01: Half-Edge Generation & Twin Invariant', () => {
    it('generates twin half-edges with opposite azimuth angles and mutual twin references', () => {
      const lines: CadLineSegment[] = [
        {
          id: 'seg_1',
          start: { x: 0, y: 0 },
          end: { x: 100, y: 0 },
          length: 100,
        },
      ];

      const graph = buildPlanarGraph(lines);

      expect(graph.vertices.size).toBe(2);
      expect(graph.halfEdges.size).toBe(2);

      const heFwd = graph.halfEdges.get('he_0_fwd');
      const heRev = graph.halfEdges.get('he_0_rev');

      expect(heFwd).toBeDefined();
      expect(heRev).toBeDefined();

      if (heFwd && heRev) {
        expect(heFwd.twinId).toBe(heRev.id);
        expect(heRev.twinId).toBe(heFwd.id);

        expect(heFwd.originId).toBe(heRev.targetId);
        expect(heFwd.targetId).toBe(heRev.originId);

        // East (0 rad) vs West (pi or -pi rad)
        expect(heFwd.angle).toBeCloseTo(0);
        expect(Math.abs(heRev.angle)).toBeCloseTo(Math.PI);
      }
    });
  });

  describe('FALSIFY-DCEL-02: Angular Sorting & Next/Prev Wiring', () => {
    it('sorts outgoing edges radially and correctly wires cyclical next/prev pointers', () => {
      // Triangle: (0,0) -> (10,0) -> (10,10) -> (0,0)
      const lines: CadLineSegment[] = [
        { id: 'l1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, length: 10 },
        { id: 'l2', start: { x: 10, y: 0 }, end: { x: 10, y: 10 }, length: 10 },
        { id: 'l3', start: { x: 10, y: 10 }, end: { x: 0, y: 0 }, length: 14.14 },
      ];

      const graph = buildPlanarGraph(lines);

      expect(graph.vertices.size).toBe(3);
      expect(graph.halfEdges.size).toBe(6);

      // Verify every half-edge has a valid nextId that exists in the graph
      for (const [, he] of graph.halfEdges.entries()) {
        expect(he.nextId).not.toBe('');
        expect(graph.halfEdges.has(he.nextId)).toBe(true);
      }
    });
  });

  describe('FALSIFY-DCEL-03: Single Closed Polygonal Face Extraction', () => {
    it('extracts exactly one interior closed loop with correct area, perimeter, and centroid for a rectangle', () => {
      // 100x50 rectangle from (0,0) to (100,50)
      const lines: CadLineSegment[] = [
        { id: 'b', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, length: 100 },
        { id: 'r', start: { x: 100, y: 0 }, end: { x: 100, y: 50 }, length: 50 },
        { id: 't', start: { x: 100, y: 50 }, end: { x: 0, y: 50 }, length: 100 },
        { id: 'l', start: { x: 0, y: 50 }, end: { x: 0, y: 0 }, length: 50 },
      ];

      const graph = buildPlanarGraph(lines);
      const loops = extractClosedLoops(graph);

      expect(loops).toHaveLength(1);
      const loop = loops[0];

      expect(loop.area).toBeCloseTo(100 * 50); // 5000
      expect(loop.perimeter).toBeCloseTo(300);
      expect(loop.centroid.x).toBeCloseTo(50);
      expect(loop.centroid.y).toBeCloseTo(25);
      expect(loop.vertices).toHaveLength(4);
      expect(loop.isClockwise).toBe(false); // Counter-clockwise boundary
    });
  });

  describe('FALSIFY-DCEL-04: Multi-Room / Multi-Cell Planar Partition', () => {
    it('decomposes a 2x2 grid sharing internal walls into exactly 4 distinct interior closed loops', () => {
      // 2x2 grid of 10x10 squares (total 7 internal/external segments)
      // Vertices: (0,0), (10,0), (20,0), (0,10), (10,10), (20,10), (0,20), (10,20), (20,20)
      const lines: CadLineSegment[] = [
        // Horizontal rows
        { id: 'h1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, length: 10 },
        { id: 'h2', start: { x: 10, y: 0 }, end: { x: 20, y: 0 }, length: 10 },
        { id: 'h3', start: { x: 0, y: 10 }, end: { x: 10, y: 10 }, length: 10 },
        { id: 'h4', start: { x: 10, y: 10 }, end: { x: 20, y: 10 }, length: 10 },
        { id: 'h5', start: { x: 0, y: 20 }, end: { x: 10, y: 20 }, length: 10 },
        { id: 'h6', start: { x: 10, y: 20 }, end: { x: 20, y: 20 }, length: 10 },

        // Vertical columns
        { id: 'v1', start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, length: 10 },
        { id: 'v2', start: { x: 0, y: 10 }, end: { x: 0, y: 20 }, length: 10 },
        { id: 'v3', start: { x: 10, y: 0 }, end: { x: 10, y: 10 }, length: 10 },
        { id: 'v4', start: { x: 10, y: 10 }, end: { x: 10, y: 20 }, length: 10 },
        { id: 'v5', start: { x: 20, y: 0 }, end: { x: 20, y: 10 }, length: 10 },
        { id: 'v6', start: { x: 20, y: 10 }, end: { x: 20, y: 20 }, length: 10 },
      ];

      const graph = buildPlanarGraph(lines);
      const loops = extractClosedLoops(graph);

      // Must find exactly 4 cells: bottom-left, bottom-right, top-left, top-right
      expect(loops).toHaveLength(4);

      for (const loop of loops) {
        expect(loop.area).toBeCloseTo(100); // 10x10 each
        expect(loop.perimeter).toBeCloseTo(40);
        expect(loop.vertices).toHaveLength(4);
      }

      // Check centroids
      const centroids = loops.map((l) => `${Math.round(l.centroid.x)},${Math.round(l.centroid.y)}`).sort();
      expect(centroids).toEqual(['15,15', '15,5', '5,15', '5,5'].sort());
    });
  });

  describe('FALSIFY-DCEL-05: Open Antenna / Dangling Spur Rejection', () => {
    it('ignores dangling spurs and extracts only the legitimate closed polygon', () => {
      // Square with a dangling antenna sticking out from (10, 10) to (30, 30)
      const lines: CadLineSegment[] = [
        { id: 's1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, length: 10 },
        { id: 's2', start: { x: 10, y: 0 }, end: { x: 10, y: 10 }, length: 10 },
        { id: 's3', start: { x: 10, y: 10 }, end: { x: 0, y: 10 }, length: 10 },
        { id: 's4', start: { x: 0, y: 10 }, end: { x: 0, y: 0 }, length: 10 },
        // Antenna
        { id: 'antenna', start: { x: 10, y: 10 }, end: { x: 30, y: 30 }, length: 28.28 },
      ];

      const graph = buildPlanarGraph(lines);
      const loops = extractClosedLoops(graph);

      // Only the square should be an interior face
      expect(loops).toHaveLength(1);
      expect(loops[0].area).toBeCloseTo(100);
      expect(loops[0].perimeter).toBeCloseTo(40);
    });
  });

  describe('Polygon Signed Area Mathematics', () => {
    it('computes positive area for CCW and negative area for CW polygons', () => {
      const ccwTriangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ];
      expect(computeSignedPolygonArea(ccwTriangle)).toBeCloseTo(50);

      const cwTriangle = [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ];
      expect(computeSignedPolygonArea(cwTriangle)).toBeCloseTo(-50);
    });
  });
});
