export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ExtrudeOptions {
  depth: number; // Extrusion depth along Z-axis in points (default: 20)
  bevelSize?: number; // Bevel offset (default: 0)
  includeCaps?: boolean; // Front and back caps (default: true)
}

export interface CadExtrudedMesh3D {
  id: string;
  sourceLoopId?: string;
  vertices: Float32Array; // Flattened [x, y, z, x, y, z, ...]
  normals: Float32Array; // Flattened [nx, ny, nz, ...]
  indices: Uint32Array; // Triangle indices [i0, i1, i2, ...]
  triangleCount: number;
  vertexCount: number;
  bounds: Bounds3D;
  centroid: Point3D;
  volume: number;
  surfaceArea: number;
}
