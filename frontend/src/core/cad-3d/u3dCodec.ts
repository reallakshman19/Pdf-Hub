import type { CadExtrudedMesh3D } from './types';
import type { U3DBlockSummary, U3DNodeSummary, U3DParseResult } from './pdf3dTypes';
import { computeMeshMetrics, computeSmoothVertexNormals } from './meshGeometryUtils';

export const U3D_MAGIC_FILE_HEADER = 0x00443355; // 'U3D\0'
export const U3D_BLOCK_PRIORITY_UPDATE = 0xffffff12;
export const U3D_BLOCK_MODIFIER_CHAIN = 0xffffff14;
export const U3D_BLOCK_GROUP_NODE = 0xffffff21;
export const U3D_BLOCK_MODEL_NODE = 0xffffff22;
export const U3D_BLOCK_LIGHT_NODE = 0xffffff23;
export const U3D_BLOCK_VIEW_NODE = 0xffffff24;
export const U3D_BLOCK_CLOD_MESH_DECLARATION = 0xffffff31;
export const U3D_BLOCK_POINT_SET_DECLARATION = 0xffffff36;
export const U3D_BLOCK_LINE_SET_DECLARATION = 0xffffff37;
export const U3D_BLOCK_CLOD_BASE_MESH_CONT = 0xffffff3b;
export const U3D_BLOCK_CLOD_PROG_MESH_CONT = 0xffffff3c;
export const U3D_BLOCK_LIT_TEXTURE_SHADER = 0xffffff41;
export const U3D_BLOCK_MATERIAL_RESOURCE = 0xffffff42;
export const U3D_BLOCK_LIGHT_RESOURCE = 0xffffff51;
export const U3D_BLOCK_VIEW_RESOURCE = 0xffffff52;

const U3D_UNCOMPRESSED_TAG = 0x55334430; // 'U3D0' uncompressed BitStream tag marker inside mesh data

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

const BLOCK_NAMES: Record<number, string> = {
  [U3D_BLOCK_FILE_HEADER_KEY()]: 'FILE_HEADER',
  [U3D_BLOCK_PRIORITY_UPDATE]: 'PRIORITY_UPDATE',
  [U3D_BLOCK_MODIFIER_CHAIN]: 'MODIFIER_CHAIN',
  [U3D_BLOCK_GROUP_NODE]: 'GROUP_NODE',
  [U3D_BLOCK_MODEL_NODE]: 'MODEL_NODE',
  [U3D_BLOCK_LIGHT_NODE]: 'LIGHT_NODE',
  [U3D_BLOCK_VIEW_NODE]: 'VIEW_NODE',
  [U3D_BLOCK_CLOD_MESH_DECLARATION]: 'CLOD_MESH_DECLARATION',
  [U3D_BLOCK_POINT_SET_DECLARATION]: 'POINT_SET_DECLARATION',
  [U3D_BLOCK_LINE_SET_DECLARATION]: 'LINE_SET_DECLARATION',
  [U3D_BLOCK_CLOD_BASE_MESH_CONT]: 'CLOD_BASE_MESH_CONTINUATION',
  [U3D_BLOCK_CLOD_PROG_MESH_CONT]: 'CLOD_PROGRESSIVE_MESH_CONTINUATION',
  [U3D_BLOCK_LIT_TEXTURE_SHADER]: 'LIT_TEXTURE_SHADER',
  [U3D_BLOCK_MATERIAL_RESOURCE]: 'MATERIAL_RESOURCE',
  [U3D_BLOCK_LIGHT_RESOURCE]: 'LIGHT_RESOURCE',
  [U3D_BLOCK_VIEW_RESOURCE]: 'VIEW_RESOURCE',
};

function U3D_BLOCK_FILE_HEADER_KEY(): number {
  return U3D_MAGIC_FILE_HEADER;
}

function align4(n: number): number {
  return (n + 3) & ~3;
}

function toHexU32(val: number): string {
  return `0x${(val >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initialCapacity = 1024) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    const needed = this.pos + extra;
    if (needed <= this.buf.length) return;
    let nextCap = this.buf.length * 2;
    while (nextCap < needed) nextCap *= 2;
    const next = new Uint8Array(nextCap);
    next.set(this.buf.subarray(0, this.pos), 0);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.pos;
  }

  writeU16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff, true);
    this.pos += 2;
  }

  writeU32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }

  writeU64FromNumber(v: number): void {
    const lo = v >>> 0;
    const hi = Math.floor(v / 0x100000000) >>> 0;
    this.writeU32(lo);
    this.writeU32(hi);
  }

  writeF32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  writeU3DString(value: string): void {
    const encoded = textEncoder.encode(value);
    this.writeU16(encoded.length);
    this.writeBytes(encoded);
  }

  padTo4(): void {
    const rem = this.pos % 4;
    if (rem === 0) return;
    const pad = 4 - rem;
    this.ensure(pad);
    for (let i = 0; i < pad; i++) {
      this.buf[this.pos++] = 0;
    }
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

class ByteReader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private pos: number;
  private readonly limit: number;

  constructor(bytes: Uint8Array, offset = 0, limit = bytes.length) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = offset;
    this.limit = Math.min(limit, bytes.length);
  }

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.pos);
  }

  seek(offset: number): void {
    this.pos = Math.max(0, Math.min(this.limit, offset));
  }

  alignTo4(): void {
    const rem = this.pos % 4;
    if (rem !== 0) {
      this.pos = Math.min(this.limit, this.pos + (4 - rem));
    }
  }

  readU16(): number {
    if (this.remaining < 2) throw new Error('Unexpected EOF reading U16');
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readU32(): number {
    if (this.remaining < 4) throw new Error('Unexpected EOF reading U32');
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU64AsNumber(): number {
    const lo = this.readU32();
    const hi = this.readU32();
    return hi * 0x100000000 + lo;
  }

  readF32(): number {
    if (this.remaining < 4) throw new Error('Unexpected EOF reading F32');
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU3DString(): string {
    const len = this.readU16();
    if (this.remaining < len) throw new Error('Unexpected EOF reading U3D string');
    const str = textDecoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return str;
  }
}

function buildBlock(blockType: number, payload: Uint8Array, metaData?: Uint8Array): Uint8Array {
  const writer = new ByteWriter(12 + align4(payload.length) + align4(metaData?.length ?? 0));
  writer.writeU32(blockType);
  writer.writeU32(payload.length);
  writer.writeU32(metaData?.length ?? 0);
  writer.writeBytes(payload);
  writer.padTo4();
  if (metaData && metaData.length > 0) {
    writer.writeBytes(metaData);
    writer.padTo4();
  }
  return writer.toUint8Array();
}

function buildModelNodePayload(meshName: string): Uint8Array {
  const w = new ByteWriter(128);
  w.writeU3DString(meshName); // node name
  w.writeU32(1); // parent count = 1
  w.writeU3DString(''); // root parent ('')
  // 4x4 identity transform matrix (16 f32)
  const identity = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
  for (const v of identity) w.writeF32(v);
  w.writeU3DString(meshName); // resource name
  w.writeU32(0); // visibility: front & back default (0x00000000 / visible)
  return w.toUint8Array();
}

function buildClodMeshDeclarationPayload(meshName: string, mesh: CadExtrudedMesh3D): Uint8Array {
  const w = new ByteWriter(160);
  w.writeU3DString(meshName);
  w.writeU32(0); // chain index
  w.writeU32(0); // maxMeshDesc.meshAttributes
  w.writeU32(mesh.triangleCount);
  w.writeU32(mesh.vertexCount);
  w.writeU32(mesh.vertexCount);
  w.writeU32(0); // diffuse color count
  w.writeU32(0); // specular color count
  w.writeU32(0); // texCoord count
  w.writeU32(1); // shading count
  // 1 default shading description
  w.writeU32(0); // shading attributes
  w.writeU32(0); // texture layer count
  w.writeU32(0); // original shading id
  // CLOD resolution + quality parameters (ECMA-363 §9.6.1.1)
  w.writeU32(mesh.vertexCount); // min resolution
  w.writeU32(mesh.vertexCount); // final max resolution
  w.writeU32(300); // position quality factor
  w.writeU32(300); // normal quality factor
  w.writeU32(300); // texCoord quality factor
  w.writeF32(1e-5); // position inverse quant
  w.writeF32(1e-5); // normal inverse quant
  w.writeF32(1e-5); // texCoord inverse quant
  w.writeF32(1e-5); // diffuse inverse quant
  w.writeF32(1e-5); // specular inverse quant
  w.writeF32(1.0); // normal crease param
  w.writeF32(0.0); // normal update param
  w.writeF32(0.0); // normal tolerance param
  w.writeU32(0); // bone count (0 = static mesh)
  return w.toUint8Array();
}

function buildClodBaseMeshContinuationPayload(meshName: string, mesh: CadExtrudedMesh3D): Uint8Array {
  const hasValidNormals = mesh.normals.length === mesh.vertexCount * 3;
  const normals = hasValidNormals
    ? mesh.normals
    : computeSmoothVertexNormals(mesh.vertices, mesh.indices);

  const estimatedBytes = 64 + meshName.length + mesh.vertexCount * 24 + mesh.triangleCount * 28;
  const w = new ByteWriter(estimatedBytes);
  w.writeU3DString(meshName);
  w.writeU32(0); // chain index
  w.writeU32(U3D_UNCOMPRESSED_TAG); // uncompressed context-0 marker for deterministic exact round-trip
  w.writeU32(mesh.triangleCount); // baseFaceCount
  w.writeU32(mesh.vertexCount); // basePositionCount
  w.writeU32(mesh.vertexCount); // baseNormalCount
  w.writeU32(0); // baseDiffuseColorCount
  w.writeU32(0); // baseSpecularColorCount
  w.writeU32(0); // baseTexCoordCount

  for (let i = 0; i < mesh.vertexCount; i++) {
    w.writeF32(mesh.vertices[i * 3]);
    w.writeF32(mesh.vertices[i * 3 + 1]);
    w.writeF32(mesh.vertices[i * 3 + 2]);
  }
  for (let i = 0; i < mesh.vertexCount; i++) {
    w.writeF32(normals[i * 3]);
    w.writeF32(normals[i * 3 + 1]);
    w.writeF32(normals[i * 3 + 2]);
  }
  for (let t = 0; t < mesh.triangleCount; t++) {
    w.writeU32(0); // shading ID 0
    w.writeU32(mesh.indices[t * 3]);
    w.writeU32(mesh.indices[t * 3 + 1]);
    w.writeU32(mesh.indices[t * 3 + 2]);
  }
  return w.toUint8Array();
}

function buildModifierChainBlock(
  chainName: string,
  chainType: number,
  childBlocks: Uint8Array[],
): Uint8Array {
  let childTotal = 0;
  for (const cb of childBlocks) childTotal += cb.length;

  const headerWriter = new ByteWriter(chainName.length + 32 + childTotal);
  headerWriter.writeU3DString(chainName);
  headerWriter.writeU32(chainType);
  headerWriter.writeU32(0); // attributes (no bounding sphere override)
  headerWriter.padTo4();
  headerWriter.writeU32(childBlocks.length);
  for (const cb of childBlocks) {
    headerWriter.writeBytes(cb);
  }
  return buildBlock(U3D_BLOCK_MODIFIER_CHAIN, headerWriter.toUint8Array());
}

/**
 * Serializes one or more 3D meshes into an ECMA-363 Universal 3D (U3D) binary stream.
 */
export function serializeMeshesToU3DBinary(
  meshes: CadExtrudedMesh3D[],
  options: { baseName?: string } = {},
): Uint8Array {
  const declarationBlocks: Uint8Array[] = [];
  const continuationBlocks: Uint8Array[] = [];
  const prefix = options.baseName?.trim() || 'DocCraftPart';

  meshes.forEach((mesh, idx) => {
    const meshName = mesh.id || `${prefix}_${idx + 1}`;
    const nodeBlock = buildBlock(U3D_BLOCK_MODEL_NODE, buildModelNodePayload(meshName));
    const nodeChain = buildModifierChainBlock(`${meshName}_Node`, 0, [nodeBlock]);

    const declBlock = buildBlock(
      U3D_BLOCK_CLOD_MESH_DECLARATION,
      buildClodMeshDeclarationPayload(meshName, mesh),
    );
    const resourceChain = buildModifierChainBlock(meshName, 1, [declBlock]);

    declarationBlocks.push(nodeChain, resourceChain);

    const baseContBlock = buildBlock(
      U3D_BLOCK_CLOD_BASE_MESH_CONT,
      buildClodBaseMeshContinuationPayload(meshName, mesh),
    );
    continuationBlocks.push(baseContBlock);
  });

  let declByteLength = 0;
  for (const b of declarationBlocks) declByteLength += b.length;
  let contByteLength = 0;
  for (const b of continuationBlocks) contByteLength += b.length;

  // File header block is 12-byte header + 24-byte payload = 36 bytes
  const fileHeaderBlockSize = 36;
  const declarationSize = fileHeaderBlockSize + declByteLength;
  const totalFileSize = declarationSize + contByteLength;

  const headerPayload = new ByteWriter(24);
  headerPayload.writeU32(0x00000100); // ECMA-363 Edition 1/4 base version
  headerPayload.writeU32(0); // profile identifier (base profile)
  headerPayload.writeU32(declarationSize);
  headerPayload.writeU64FromNumber(totalFileSize);
  headerPayload.writeU32(106); // UTF-8 MIBenum

  const headerBlock = buildBlock(U3D_MAGIC_FILE_HEADER, headerPayload.toUint8Array());

  const out = new Uint8Array(totalFileSize);
  let cursor = 0;
  out.set(headerBlock, cursor);
  cursor += headerBlock.length;
  for (const b of declarationBlocks) {
    out.set(b, cursor);
    cursor += b.length;
  }
  for (const b of continuationBlocks) {
    out.set(b, cursor);
    cursor += b.length;
  }
  return out;
}

function parseSingleBlockIntoState(
  blockType: number,
  bytes: Uint8Array,
  payloadStart: number,
  dataSize: number,
  state: {
    blocks: U3DBlockSummary[];
    nodes: U3DNodeSummary[];
    meshes: CadExtrudedMesh3D[];
    warnings: string[];
  },
  depth = 0,
): void {
  if (depth > 4) return;

  if (blockType === U3D_BLOCK_MODIFIER_CHAIN) {
    try {
      const r = new ByteReader(bytes, payloadStart, payloadStart + dataSize);
      r.readU3DString(); // chainName
      r.readU32(); // chainType
      const attrs = r.readU32();
      if ((attrs & 0x1) !== 0 && r.remaining >= 16) {
        r.seek(r.offset + 16); // optional bounding sphere (center + radius)
      }
      r.alignTo4();
      const modifierCount = r.remaining >= 4 ? r.readU32() : 0;
      for (let i = 0; i < modifierCount && r.remaining >= 12; i++) {
        const subType = r.readU32();
        const subDataSize = r.readU32();
        const subMetaSize = r.readU32();
        const subPayloadStart = r.offset;
        if (subPayloadStart + subDataSize > payloadStart + dataSize) break;
        state.blocks.push({
          blockType: subType,
          blockTypeHex: toHexU32(subType),
          blockName: BLOCK_NAMES[subType] ?? 'UNKNOWN_BLOCK',
          dataSize: subDataSize,
          metaDataSize: subMetaSize,
          offset: subPayloadStart - 12,
        });
        parseSingleBlockIntoState(subType, bytes, subPayloadStart, subDataSize, state, depth + 1);
        const nextOffset = subPayloadStart + align4(subDataSize) + align4(subMetaSize);
        r.seek(nextOffset);
      }
    } catch (err) {
      state.warnings.push(
        `Partial modifier chain parse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  if (blockType === U3D_BLOCK_MODEL_NODE || blockType === U3D_BLOCK_GROUP_NODE) {
    try {
      const r = new ByteReader(bytes, payloadStart, payloadStart + dataSize);
      const name = r.readU3DString();
      const parentCount = r.remaining >= 4 ? r.readU32() : 0;
      let parentName: string | undefined;
      const transform: number[] = [];
      for (let p = 0; p < parentCount; p++) {
        const pName = r.readU3DString();
        if (p === 0) parentName = pName || undefined;
        for (let m = 0; m < 16 && r.remaining >= 4; m++) {
          transform.push(r.readF32());
        }
      }
      const resourceName =
        blockType === U3D_BLOCK_MODEL_NODE && r.remaining >= 2 ? r.readU3DString() : undefined;
      state.nodes.push({
        name,
        parentName,
        transform: transform.length === 16 ? transform : undefined,
        resourceName,
      });
    } catch (err) {
      state.warnings.push(
        `Partial U3D node parse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  if (blockType === U3D_BLOCK_CLOD_BASE_MESH_CONT) {
    try {
      const r = new ByteReader(bytes, payloadStart, payloadStart + dataSize);
      const meshName = r.readU3DString();
      r.readU32(); // chain index
      if (r.remaining < 4) return;
      const tagOrCount = r.readU32();
      if (tagOrCount !== U3D_UNCOMPRESSED_TAG) {
        state.warnings.push(
          `U3D CLOD mesh "${meshName}" uses bit-packed/entropy-coded ECMA-363 continuation stream (${dataSize} bytes); geometric summary extracted without full Huffman bit-decode.`,
        );
        return;
      }

      const faceCount = r.readU32();
      const posCount = r.readU32();
      const normalCount = r.readU32();
      const diffCount = r.readU32();
      const specCount = r.readU32();
      const texCount = r.readU32();

      const vertices = new Float32Array(posCount * 3);
      for (let i = 0; i < posCount * 3; i++) {
        vertices[i] = r.readF32();
      }

      const rawNormals = new Float32Array(normalCount * 3);
      for (let i = 0; i < normalCount * 3; i++) {
        rawNormals[i] = r.readF32();
      }

      // Skip unused optional attributes if present
      const skipCount = (diffCount + specCount) * 4 + texCount * 4;
      if (skipCount > 0 && r.remaining >= skipCount * 4) {
        r.seek(r.offset + skipCount * 4);
      }

      const indices = new Uint32Array(faceCount * 3);
      for (let f = 0; f < faceCount; f++) {
        r.readU32(); // shadingId
        indices[f * 3] = r.readU32();
        indices[f * 3 + 1] = r.readU32();
        indices[f * 3 + 2] = r.readU32();
      }

      const normals =
        normalCount === posCount
          ? rawNormals
          : computeSmoothVertexNormals(vertices, indices);
      const metrics = computeMeshMetrics(vertices, indices);

      state.meshes.push({
        id: meshName || `u3d_mesh_${state.meshes.length + 1}`,
        vertices,
        normals,
        indices,
        triangleCount: faceCount,
        vertexCount: posCount,
        bounds: metrics.bounds,
        centroid: metrics.centroid,
        volume: metrics.volume,
        surfaceArea: metrics.surfaceArea,
      });
    } catch (err) {
      state.warnings.push(
        `Failed parsing U3D base mesh continuation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Parses an ECMA-363 Universal 3D (U3D) binary stream into block metadata, nodes, and meshes.
 */
export function parseU3DBinary(bytes: Uint8Array): U3DParseResult {
  const empty: U3DParseResult = {
    isValidU3D: false,
    majorVersion: 0,
    minorVersion: 0,
    profileIdentifier: 0,
    declarationSize: 0,
    fileSize: bytes.length,
    characterEncoding: 0,
    blocks: [],
    nodes: [],
    meshes: [],
    warnings: [],
  };

  if (bytes.length < 36) {
    empty.warnings.push('U3D stream is smaller than the minimum 36-byte ECMA-363 header block.');
    return empty;
  }

  const reader = new ByteReader(bytes, 0, bytes.length);
  const magic = reader.readU32();
  if (magic !== U3D_MAGIC_FILE_HEADER) {
    empty.warnings.push(`Invalid U3D file header magic: ${toHexU32(magic)} (expected 0x00443355).`);
    return empty;
  }

  const headerDataSize = reader.readU32();
  const headerMetaSize = reader.readU32();
  const versionRaw = reader.readU32();
  const profileIdentifier = reader.readU32();
  const declarationSize = reader.readU32();
  const fileSize = reader.readU64AsNumber();
  const characterEncoding = reader.readU32();

  const blocks: U3DBlockSummary[] = [
    {
      blockType: magic,
      blockTypeHex: toHexU32(magic),
      blockName: 'FILE_HEADER',
      dataSize: headerDataSize,
      metaDataSize: headerMetaSize,
      offset: 0,
    },
  ];
  const nodes: U3DNodeSummary[] = [];
  const meshes: CadExtrudedMesh3D[] = [];
  const warnings: string[] = [];

  let cursor = 12 + align4(headerDataSize) + align4(headerMetaSize);
  const scanLimit = Math.min(bytes.length, fileSize > 0 ? fileSize : bytes.length);

  while (cursor + 12 <= scanLimit) {
    const r = new ByteReader(bytes, cursor, scanLimit);
    const blockType = r.readU32();
    const dataSize = r.readU32();
    const metaDataSize = r.readU32();
    const payloadStart = cursor + 12;

    if (payloadStart + dataSize > scanLimit) {
      warnings.push(`Truncated U3D block ${toHexU32(blockType)} at offset ${cursor}.`);
      break;
    }

    blocks.push({
      blockType,
      blockTypeHex: toHexU32(blockType),
      blockName: BLOCK_NAMES[blockType] ?? 'UNKNOWN_BLOCK',
      dataSize,
      metaDataSize,
      offset: cursor,
    });

    parseSingleBlockIntoState(blockType, bytes, payloadStart, dataSize, {
      blocks,
      nodes,
      meshes,
      warnings,
    });

    cursor = payloadStart + align4(dataSize) + align4(metaDataSize);
  }

  return {
    isValidU3D: true,
    majorVersion: (versionRaw >>> 16) & 0xffff,
    minorVersion: versionRaw & 0xffff,
    profileIdentifier,
    declarationSize,
    fileSize,
    characterEncoding,
    blocks,
    nodes,
    meshes,
    warnings,
  };
}
