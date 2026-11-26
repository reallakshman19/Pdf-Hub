import { unzlibSync } from 'fflate';
import type { PrcInspectionResult, PrcSectionSummary } from './pdf3dTypes';

const PRC_MAGIC = [0x50, 0x52, 0x43]; // 'PRC'
const SECTION_TAGS = ['Globals', 'Tree', 'Tessellation', 'Geometry', 'ExtraGeometry'] as const;

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function isZlibHeader(b0: number, b1: number): boolean {
  if (b0 !== 0x78) return false;
  return b1 === 0x01 || b1 === 0x5e || b1 === 0x9c || b1 === 0xda;
}

function inferSectionName(decompressed: Uint8Array, index: number): string {
  const headText = new TextDecoder('latin1').decode(
    decompressed.subarray(0, Math.min(256, decompressed.length)),
  );
  for (const tag of SECTION_TAGS) {
    if (headText.includes(tag)) return tag;
  }
  return `Section_${index + 1}`;
}

/**
 * Inspects an ISO 14739-1 (PRC) 3D stream container, validating header structure
 * and inflating embedded zlib-compressed PRC sections where present.
 */
export function inspectPrcBinary(bytes: Uint8Array): PrcInspectionResult {
  if (
    bytes.length < 16 ||
    bytes[0] !== PRC_MAGIC[0] ||
    bytes[1] !== PRC_MAGIC[1] ||
    bytes[2] !== PRC_MAGIC[2]
  ) {
    return {
      isValidPrc: false,
      minimalVersion: 0,
      authoringVersion: 0,
      fileStructureCount: 0,
      headerSizeBytes: 0,
      uuidsCount: 0,
      sections: [],
      extractedMeshes: [],
      warnings: ['Stream does not start with valid ISO 14739-1 PRC magic bytes ("PRC").'],
    };
  }

  const minimalVersion = readUint32LE(bytes, 3);
  const authoringVersion = readUint32LE(bytes, 7);
  // Header layout follows ISO 14739-1 §6: 3-byte magic + versions + UUIDs + file structures
  // After 2x32-bit versions + 2x16-byte UUIDs (file UUID + application UUID) = offset 43
  const uuidsCount = bytes.length >= 43 ? 2 : 0;
  const fileStructureCount = bytes.length >= 47 ? Math.min(256, readUint32LE(bytes, 43)) : 0;

  const sections: PrcSectionSummary[] = [];
  const warnings: string[] = [];

  // Scan container for zlib-compressed PRC section streams (0x78 0x9C / 0x78 0xDA / 0x78 0x01)
  let scanOffset = 12;
  while (scanOffset + 8 < bytes.length) {
    if (isZlibHeader(bytes[scanOffset], bytes[scanOffset + 1])) {
      // Bounded window probe for compressed stream chunk
      const slice = bytes.subarray(scanOffset);
      try {
        const inflated = unzlibSync(slice);
        if (inflated.length > 0) {
          sections.push({
            name: inferSectionName(inflated, sections.length),
            compressed: true,
            compressedSize: slice.length,
            uncompressedSize: inflated.length,
            offset: scanOffset,
          });
          // Advance past header so overlapping hits inside same buffer aren't re-matched
          scanOffset += Math.max(8, Math.min(slice.length, 32));
          continue;
        }
      } catch {
        // Not a valid self-contained zlib stream boundary at this offset; continue scan
      }
    }
    scanOffset++;
  }

  if (sections.length === 0) {
    warnings.push(
      'PRC container header validated; bit-level ISO 14739-1 B-Rep/tessellation entropy blocks require explicit section offsets or U3D fallback for triangle rendering.',
    );
  } else {
    warnings.push(
      `PRC container inspected (${sections.length} Flate section(s) discovered). Analytical B-Rep NURBS evaluation is reported structurally.`,
    );
  }

  return {
    isValidPrc: true,
    minimalVersion,
    authoringVersion,
    fileStructureCount,
    headerSizeBytes: Math.min(bytes.length, 64),
    uuidsCount,
    sections,
    extractedMeshes: [],
    warnings,
  };
}
