import { describe, expect, it } from 'vitest';
import { triangulatePolygon } from '../triangulation';
import { extrudeClosedLoopTo3D, extrudePolygonTo3D } from '../extrudeEngine';
import { serializeMeshToObj } from '../objExport';
import type { CadClosedLoop } from '../../cad-geometry/types';

describe('CAD 2D-to-3D Extrusion Engine & OBJ Export - Mini-Phase P.2', () => {
  describe('FALSIFY-EXT-01: Ear Clipping Polygon Triangulation', () => {
    it('triangulates a convex quad into exactly 2 triangles', () => {
      const quad = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const triangles = triangulatePolygon(quad);
      expect(triangles).toHaveLength(6); // 2 triangles * 3 indices
    });

    it('triangulates a non-convex L-shaped polygon (6 vertices) into exactly 4 triangles', () => {
      // L-shaped polygon
      const lShape = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 30 },
        { x: 0, y: 30 },
      ];

      const triangles = triangulatePolygon(lShape);
      expect(triangles).toHaveLength(12); // (6 - 2) * 3 = 12 indices (4 triangles)
    });
  });

  describe('FALSIFY-EXT-02 & FALSIFY-EXT-04: Watertight 3D Solid & Mathematical Metrics', () => {
    it('extrudes a 100x50 rectangle with depth 20 into a watertight 3D mesh with exact volume and area', () => {
      const loop: CadClosedLoop = {
        id: 'rect_loop',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        area: 5000,
        perimeter: 300,
        centroid: { x: 50, y: 25 },
        isClockwise: false,
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
        edgeIds: ['e1', 'e2', 'e3', 'e4'],
      };

      const mesh = extrudeClosedLoopTo3D(loop, { depth: 20 });

      // Verification of triangles:
      // Front cap: 2 triangles
      // Back cap: 2 triangles
      // 4 side walls * 2 triangles each = 8 triangles
      // Total = 12 triangles (36 indices)
      expect(mesh.triangleCount).toBe(12);
      expect(mesh.indices).toHaveLength(36);

      // Volume = 100 * 50 * 20 = 100,000 pt^3
      expect(mesh.volume).toBeCloseTo(100000);

      // Surface area = 2 * (100 * 50) + 300 * 20 = 10,000 + 6,000 = 16,000 pt^2
      expect(mesh.surfaceArea).toBeCloseTo(16000);

      // Centroid = (50, 25, 10)
      expect(mesh.centroid.x).toBeCloseTo(50);
      expect(mesh.centroid.y).toBeCloseTo(25);
      expect(mesh.centroid.z).toBeCloseTo(10);

      // Bounds
      expect(mesh.bounds).toEqual({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 100,
        maxY: 50,
        maxZ: 20,
      });
    });
  });

  describe('FALSIFY-EXT-03: Outward Normal Vectors', () => {
    it('assigns unit normal vectors pointing outward on caps and side walls', () => {
      const poly = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const mesh = extrudePolygonTo3D(poly, { depth: 5 });

      const normals = mesh.normals;
      expect(normals.length).toBe(mesh.vertexCount * 3);

      // Check front cap normals: must have nz = 1
      // Front cap vertices: indices 0, 1, 2, 3
      for (let i = 0; i < 4; i++) {
        expect(normals[i * 3 + 2]).toBeCloseTo(1);
      }

      // Check back cap normals: must have nz = -1
      // Back cap vertices: indices 4, 5, 6, 7
      for (let i = 4; i < 8; i++) {
        expect(normals[i * 3 + 2]).toBeCloseTo(-1);
      }

      // Check all normals have unit length: ||N|| == 1
      for (let i = 0; i < mesh.vertexCount; i++) {
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];
        const len = Math.hypot(nx, ny, nz);
        expect(len).toBeCloseTo(1, 4);
      }
    });
  });

  describe('FALSIFY-EXT-05: Wavefront OBJ Serialization', () => {
    it('serializes 3D mesh into valid Wavefront OBJ text format with 1-based indexing', () => {
      const poly = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ];

      const mesh = extrudePolygonTo3D(poly, { depth: 10 });
      const objText = serializeMeshToObj(mesh, 'TestPrism');

      expect(objText).toContain('# PDF Hub 3D CAD Engine - Wavefront OBJ Export');
      expect(objText).toContain('o TestPrism');

      // Check vertex and normal lines
      expect(objText).toMatch(/^v \d+\.\d+ \d+\.\d+ \d+\.\d+$/m);
      expect(objText).toMatch(/^vn \d+\.\d+ \d+\.\d+ \d+\.\d+$/m);

      // Check 1-based face lines: f v//vn
      expect(objText).toMatch(/^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/m);
    });
  });
});
