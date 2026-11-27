import type { Bounds3D, CadExtrudedMesh3D, Point3D } from './types';

/**
 * Computes axis-aligned bounds, centroid, signed volume, and surface area
 * for any indexed triangle mesh (Float32Array vertices + Uint32Array indices).
 */
export function computeMeshMetrics(
  vertices: Float32Array,
  indices: Uint32Array,
): {
  bounds: Bounds3D;
  centroid: Point3D;
  volume: number;
  surfaceArea: number;
} {
  const vertexCount = Math.floor(vertices.length / 3);
  if (vertexCount === 0) {
    return {
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
      centroid: { x: 0, y: 0, z: 0 },
      volume: 0,
      surfaceArea: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    sumX += x;
    sumY += y;
    sumZ += z;
  }

  let surfaceArea = 0;
  let signedVolume6 = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;

    const ax = vertices[i0 * 3];
    const ay = vertices[i0 * 3 + 1];
    const az = vertices[i0 * 3 + 2];
    const bx = vertices[i1 * 3];
    const by = vertices[i1 * 3 + 1];
    const bz = vertices[i1 * 3 + 2];
    const cx = vertices[i2 * 3];
    const cy = vertices[i2 * 3 + 1];
    const cz = vertices[i2 * 3 + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const crx = aby * acz - abz * acy;
    const cry = abz * acx - abx * acz;
    const crz = abx * acy - aby * acx;
    surfaceArea += 0.5 * Math.hypot(crx, cry, crz);

    // Signed tetrahedron volume determinant * 6 = a · (b × c)
    const bcx = by * cz - bz * cy;
    const bcy = bz * cx - bx * cz;
    const bcz = bx * cy - by * cx;
    signedVolume6 += ax * bcx + ay * bcy + az * bcz;
  }

  return {
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    centroid: {
      x: sumX / vertexCount,
      y: sumY / vertexCount,
      z: sumZ / vertexCount,
    },
    volume: Math.round((Math.abs(signedVolume6) / 6) * 100) / 100,
    surfaceArea: Math.round(surfaceArea * 100) / 100,
  };
}

/**
 * Generates smooth vertex normals by accumulating area-weighted triangle face normals.
 */
export function computeSmoothVertexNormals(
  vertices: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const normals = new Float32Array(vertices.length);
  const vertexCount = Math.floor(vertices.length / 3);

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;

    const ax = vertices[i0 * 3];
    const ay = vertices[i0 * 3 + 1];
    const az = vertices[i0 * 3 + 2];
    const bx = vertices[i1 * 3];
    const by = vertices[i1 * 3 + 1];
    const bz = vertices[i1 * 3 + 2];
    const cx = vertices[i2 * 3];
    const cy = vertices[i2 * 3 + 1];
    const cz = vertices[i2 * 3 + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[i0 * 3] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    } else {
      normals[i * 3 + 2] = 1;
    }
  }

  return normals;
}

/**
 * Merges multiple CadExtrudedMesh3D parts into a single unified indexed mesh.
 */
export function mergeMeshes3D(
  meshes: CadExtrudedMesh3D[],
  mergedId = 'merged_mesh_3d',
): CadExtrudedMesh3D {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const m of meshes) {
    totalVerts += m.vertexCount;
    totalIndices += m.indices.length;
  }

  const vertices = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const m of meshes) {
    vertices.set(m.vertices, vOffset * 3);
    normals.set(m.normals, vOffset * 3);
    for (let i = 0; i < m.indices.length; i++) {
      indices[iOffset + i] = m.indices[i] + vOffset;
    }
    vOffset += m.vertexCount;
    iOffset += m.indices.length;
  }

  const metrics = computeMeshMetrics(vertices, indices);
  return {
    id: mergedId,
    vertices,
    normals,
    indices,
    triangleCount: Math.floor(indices.length / 3),
    vertexCount: totalVerts,
    bounds: metrics.bounds,
    centroid: metrics.centroid,
    volume: metrics.volume,
    surfaceArea: metrics.surfaceArea,
  };
}
