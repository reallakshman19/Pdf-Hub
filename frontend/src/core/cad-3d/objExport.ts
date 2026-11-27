import type { CadExtrudedMesh3D } from './types';

/**
 * Serializes a 3D extruded mesh into standard Wavefront OBJ (.obj) text format.
 */
export function serializeMeshToObj(mesh: CadExtrudedMesh3D, objectName = 'ExtrudedPart'): string {
  const lines: string[] = [
    `# PDF Hub 3D CAD Engine - Wavefront OBJ Export`,
    `# Object: ${objectName} (ID: ${mesh.id})`,
    `# Vertices: ${mesh.vertexCount}`,
    `# Triangles: ${mesh.triangleCount}`,
    `# Volume: ${mesh.volume} pt^3, Surface Area: ${mesh.surfaceArea} pt^2`,
    `o ${objectName}`,
    '',
  ];

  const verts = mesh.vertices;
  const norms = mesh.normals;
  const indices = mesh.indices;

  // 1. Output Vertices
  for (let i = 0; i < verts.length; i += 3) {
    lines.push(`v ${verts[i].toFixed(4)} ${verts[i + 1].toFixed(4)} ${verts[i + 2].toFixed(4)}`);
  }
  lines.push('');

  // 2. Output Vertex Normals
  for (let i = 0; i < norms.length; i += 3) {
    lines.push(`vn ${norms[i].toFixed(4)} ${norms[i + 1].toFixed(4)} ${norms[i + 2].toFixed(4)}`);
  }
  lines.push('');

  // 3. Output Faces (OBJ format indices are 1-based)
  lines.push(`s 1`); // Smooth shading group
  for (let i = 0; i < indices.length; i += 3) {
    const idx1 = indices[i] + 1;
    const idx2 = indices[i + 1] + 1;
    const idx3 = indices[i + 2] + 1;
    lines.push(`f ${idx1}//${idx1} ${idx2}//${idx2} ${idx3}//${idx3}`);
  }

  return lines.join('\n');
}
