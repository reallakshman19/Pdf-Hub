import type { CadClosedLoop, Point2D } from '../cad-geometry/types';
import type { Bounds3D, CadExtrudedMesh3D, ExtrudeOptions, Point3D } from './types';
import { triangulatePolygon } from './triangulation';
import { computeSignedPolygonArea } from '../cad-geometry/planarGraph';

function distance2D(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Extrudes a 2D closed polygon loop into a full 3D watertight mesh with front/back caps,
 * side walls, outward normals, volume, and bounding box.
 */
export function extrudeClosedLoopTo3D(
  loop: CadClosedLoop,
  options: ExtrudeOptions = { depth: 20 },
): CadExtrudedMesh3D {
  return extrudePolygonTo3D(loop.vertices, {
    ...options,
    sourceLoopId: loop.id,
  });
}

export interface ExtrudePolygonOptions extends ExtrudeOptions {
  sourceLoopId?: string;
  meshId?: string;
}

/**
 * Extrudes an arbitrary 2D polygon into a 3D watertight mesh.
 */
export function extrudePolygonTo3D(
  rawVertices: Point2D[],
  options: ExtrudePolygonOptions = { depth: 20 },
): CadExtrudedMesh3D {
  const depth = Math.max(0.01, options.depth ?? 20);
  const includeCaps = options.includeCaps ?? true;
  const n = rawVertices.length;

  if (n < 3) {
    throw new Error('Cannot extrude a polygon with fewer than 3 vertices.');
  }

  // Ensure counter-clockwise vertex orientation
  const isCCW = computeSignedPolygonArea(rawVertices) > 0;
  const poly: Point2D[] = isCCW ? [...rawVertices] : [...rawVertices].reverse();

  const vertexList: number[] = [];
  const normalList: number[] = [];
  const indexList: number[] = [];

  let vertexCounter = 0;

  const addVertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    vertexList.push(x, y, z);
    normalList.push(nx, ny, nz);
    return vertexCounter++;
  };

  // 1. Front and Back Caps
  let capTriangles: number[] = [];
  if (includeCaps) {
    capTriangles = triangulatePolygon(poly);

    // Front Cap (z = depth, normal = 0, 0, 1)
    const frontStartIdx = vertexCounter;
    for (let i = 0; i < n; i++) {
      addVertex(poly[i].x, poly[i].y, depth, 0, 0, 1);
    }
    for (let i = 0; i < capTriangles.length; i += 3) {
      indexList.push(
        frontStartIdx + capTriangles[i],
        frontStartIdx + capTriangles[i + 1],
        frontStartIdx + capTriangles[i + 2],
      );
    }

    // Back Cap (z = 0, normal = 0, 0, -1, reversed winding)
    const backStartIdx = vertexCounter;
    for (let i = 0; i < n; i++) {
      addVertex(poly[i].x, poly[i].y, 0, 0, 0, -1);
    }
    for (let i = 0; i < capTriangles.length; i += 3) {
      indexList.push(
        backStartIdx + capTriangles[i],
        backStartIdx + capTriangles[i + 2],
        backStartIdx + capTriangles[i + 1],
      );
    }
  }

  // 2. Side Walls
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];

    perimeter += distance2D(p1, p2);

    // Compute outward normal in 2D
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = len > 1e-9 ? dy / len : 0;
    const ny = len > 1e-9 ? -dx / len : 0;

    // 4 vertices of the quad
    const v0 = addVertex(p1.x, p1.y, 0, nx, ny, 0);
    const v1 = addVertex(p2.x, p2.y, 0, nx, ny, 0);
    const v2 = addVertex(p2.x, p2.y, depth, nx, ny, 0);
    const v3 = addVertex(p1.x, p1.y, depth, nx, ny, 0);

    // Two triangles forming the quad
    indexList.push(v0, v1, v2);
    indexList.push(v0, v2, v3);
  }

  // 3. Compute Bounding Box, Centroid, Area, Volume
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < n; i++) {
    const p = poly[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }

  const bounds: Bounds3D = {
    minX,
    minY,
    minZ: 0,
    maxX,
    maxY,
    maxZ: depth,
  };

  const centroid: Point3D = {
    x: sumX / n,
    y: sumY / n,
    z: depth / 2,
  };

  const polyArea = Math.abs(computeSignedPolygonArea(poly));
  const volume = polyArea * depth;
  const surfaceArea = 2 * polyArea + perimeter * depth;

  const id = options.meshId ?? `mesh3d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    sourceLoopId: options.sourceLoopId,
    vertices: new Float32Array(vertexList),
    normals: new Float32Array(normalList),
    indices: new Uint32Array(indexList),
    triangleCount: indexList.length / 3,
    vertexCount: vertexCounter,
    bounds,
    centroid,
    volume: Math.round(volume * 100) / 100,
    surfaceArea: Math.round(surfaceArea * 100) / 100,
  };
}
