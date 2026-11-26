import type { CadExtrudedMesh3D } from './types';

/**
 * Serializes a 3D extruded mesh into standard glTF 2.0 JSON text with embedded base64 binary buffer.
 */
export function serializeMeshToGltf(mesh: CadExtrudedMesh3D, meshName = 'ExtrudedPart'): string {
  const verts = mesh.vertices;
  const norms = mesh.normals;
  const indices = mesh.indices;

  // 1. Calculate buffer byte lengths and byte offsets
  const posByteLength = verts.byteLength;
  const normByteLength = norms.byteLength;
  const idxByteLength = indices.byteLength;

  const totalByteLength = posByteLength + normByteLength + idxByteLength;

  // 2. Pack binary data into combined ArrayBuffer
  const combinedBuffer = new ArrayBuffer(totalByteLength);
  const combinedBytes = new Uint8Array(combinedBuffer);

  let offset = 0;
  combinedBytes.set(new Uint8Array(verts.buffer, verts.byteOffset, posByteLength), offset);
  const posOffset = offset;
  offset += posByteLength;

  combinedBytes.set(new Uint8Array(norms.buffer, norms.byteOffset, normByteLength), offset);
  const normOffset = offset;
  offset += normByteLength;

  combinedBytes.set(new Uint8Array(indices.buffer, indices.byteOffset, idxByteLength), offset);
  const idxOffset = offset;

  // 3. Base64 encode the combined buffer
  let binaryStr = '';
  for (let i = 0; i < totalByteLength; i++) {
    binaryStr += String.fromCharCode(combinedBytes[i]);
  }
  const base64Buffer = typeof btoa !== 'undefined' ? btoa(binaryStr) : Buffer.from(binaryStr, 'binary').toString('base64');
  const bufferUri = `data:application/octet-stream;base64,${base64Buffer}`;

  // 4. Construct glTF 2.0 Document Structure
  const gltfDoc = {
    asset: {
      version: '2.0',
      generator: 'PDF Hub 3D CAD Engine',
    },
    scene: 0,
    scenes: [
      {
        nodes: [0],
      },
    ],
    nodes: [
      {
        mesh: 0,
        name: meshName,
      },
    ],
    meshes: [
      {
        name: meshName,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            mode: 4, // TRIANGLES
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: mesh.vertexCount,
        type: 'VEC3',
        max: [mesh.bounds.maxX, mesh.bounds.maxY, mesh.bounds.maxZ],
        min: [mesh.bounds.minX, mesh.bounds.minY, mesh.bounds.minZ],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: mesh.vertexCount,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5125, // UNSIGNED_INT
        count: mesh.indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: posOffset,
        byteLength: posByteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: normOffset,
        byteLength: normByteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: idxOffset,
        byteLength: idxByteLength,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        byteLength: totalByteLength,
        uri: bufferUri,
      },
    ],
  };

  return JSON.stringify(gltfDoc, null, 2);
}
