/**
 * Deterministic IEC 61966-2-1 (sRGB v2.1.0) ICC Output Profile builder & inspector.
 *
 * Produces a compact, specification-exact ICC.1:2001-04 Display ('mntr') profile
 * in RGB -> XYZ PCS with D50 illuminant, Bradford chromatic adaptation matrix ('chad'),
 * and a 1024-entry piecewise IEC 61966-2-1 TRC gamma LUT for PDF/A OutputIntents.
 *
 * Pure TypeScript with zero network or binary asset dependencies.
 */

export interface IccProfileHeaderSummary {
  valid: boolean;
  byteLength: number;
  declaredSize: number;
  versionMajor: number;
  versionMinor: number;
  deviceClass: string;
  colorSpace: string;
  pcs: string;
  magic: string;
  renderingIntent: number;
  tagCount: number;
  componentCount: number | null;
  tags: string[];
}

interface BuiltTag {
  signature: string;
  data: Uint8Array;
}

const ICC_HEADER_SIZE = 128;

// Exact ICC D50 PCS Illuminant Constants (X=0.9642, Y=1.0000, Z=0.8249)
const D50_X = 0.96420288;
const D50_Y = 1.0;
const D50_Z = 0.8249054;

// D65 Media White Point (X=0.950455, Y=1.000000, Z=1.089058)
const D65_XYZ: readonly [number, number, number] = [0.950455, 1.0, 1.089058];

// D50-adapted sRGB Primaries (IEC 61966-2-1 + Bradford adaptation)
const SRGB_RED_XYZ: readonly [number, number, number] = [0.4360657, 0.2224884, 0.0139160];
const SRGB_GREEN_XYZ: readonly [number, number, number] = [0.3851471, 0.7168732, 0.0970764];
const SRGB_BLUE_XYZ: readonly [number, number, number] = [0.1430664, 0.0606079, 0.7140961];

// Bradford chromatic adaptation matrix (D65 -> D50)
const BRADFORD_D65_TO_D50: readonly number[] = [
  1.0478112, 0.0228866, -0.050127,
  0.0295424, 0.9904844, -0.0170491,
  -0.0092345, 0.0150436, 0.7521316,
];

let cachedSrgbProfile: Uint8Array | null = null;

function writeAscii4(view: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < 4; i += 1) {
    view[offset + i] = (i < text.length ? text.charCodeAt(i) : 0x20) & 0xff;
  }
}

function readAscii4(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return '';
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function writeUint16BE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = (value >>> 8) & 0xff;
  view[offset + 1] = value & 0xff;
}

function writeUint32BE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = (value >>> 24) & 0xff;
  view[offset + 1] = (value >>> 16) & 0xff;
  view[offset + 2] = (value >>> 8) & 0xff;
  view[offset + 3] = value & 0xff;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function writeS15Fixed16BE(view: Uint8Array, offset: number, value: number): void {
  const fixed = Math.round(value * 65536);
  writeUint32BE(view, offset, fixed >>> 0);
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

function encodeXyzTag(coords: readonly [number, number, number]): Uint8Array {
  const out = new Uint8Array(20);
  writeAscii4(out, 0, 'XYZ ');
  // bytes 4..7 reserved (0)
  writeS15Fixed16BE(out, 8, coords[0]);
  writeS15Fixed16BE(out, 12, coords[1]);
  writeS15Fixed16BE(out, 16, coords[2]);
  return out;
}

function encodeSf32Tag(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(8 + values.length * 4);
  writeAscii4(out, 0, 'sf32');
  for (let i = 0; i < values.length; i += 1) {
    writeS15Fixed16BE(out, 8 + i * 4, values[i]);
  }
  return out;
}

function encodeTextTag(text: string): Uint8Array {
  const ascii = Array.from(text, (ch) => ch.charCodeAt(0) & 0x7f);
  const out = new Uint8Array(8 + ascii.length + 1);
  writeAscii4(out, 0, 'text');
  for (let i = 0; i < ascii.length; i += 1) {
    out[8 + i] = ascii[i];
  }
  out[8 + ascii.length] = 0;
  return out;
}

function encodeDescTag(text: string): Uint8Array {
  const ascii = Array.from(text, (ch) => ch.charCodeAt(0) & 0x7f);
  const asciiCount = ascii.length + 1;
  // textDescriptionType: 'desc'(4) + reserved(4) + asciiCount(4) + ascii+nul +
  // unicodeLang(4) + unicodeCount(4) + scriptCode(2) + macCount(1) + macBody(67)
  const out = new Uint8Array(12 + asciiCount + 78);
  writeAscii4(out, 0, 'desc');
  writeUint32BE(out, 8, asciiCount);
  for (let i = 0; i < ascii.length; i += 1) {
    out[12 + i] = ascii[i];
  }
  out[12 + ascii.length] = 0;
  return out;
}

function encodeSrgbCurvTag(sampleCount = 1024): Uint8Array {
  const out = new Uint8Array(12 + sampleCount * 2);
  writeAscii4(out, 0, 'curv');
  writeUint32BE(out, 8, sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const normalized = i / (sampleCount - 1);
    const linear =
      normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    const sample = Math.max(0, Math.min(65535, Math.round(linear * 65535)));
    writeUint16BE(out, 12 + i * 2, sample);
  }
  return out;
}

/**
 * Generates an ICC v2.1.0 sRGB IEC61966-2.1 output profile suitable for
 * PDF/A `/OutputIntents` (`/S /GTS_PDFA1`, `/N 3`).
 */
export function buildSrgbIccProfile(): Uint8Array {
  if (cachedSrgbProfile) {
    return new Uint8Array(cachedSrgbProfile);
  }

  const trcData = encodeSrgbCurvTag(1024);
  const rawTags: Array<{ sig: string; data: Uint8Array; sharedWith?: string }> = [
    { sig: 'desc', data: encodeDescTag('sRGB IEC61966-2.1') },
    { sig: 'cprt', data: encodeTextTag('CC0 Public Domain sRGB IEC61966-2.1') },
    { sig: 'wtpt', data: encodeXyzTag(D65_XYZ) },
    { sig: 'bkpt', data: encodeXyzTag([0, 0, 0]) },
    { sig: 'rXYZ', data: encodeXyzTag(SRGB_RED_XYZ) },
    { sig: 'gXYZ', data: encodeXyzTag(SRGB_GREEN_XYZ) },
    { sig: 'bXYZ', data: encodeXyzTag(SRGB_BLUE_XYZ) },
    { sig: 'rTRC', data: trcData },
    { sig: 'gTRC', data: trcData, sharedWith: 'rTRC' },
    { sig: 'bTRC', data: trcData, sharedWith: 'rTRC' },
    { sig: 'chad', data: encodeSf32Tag(BRADFORD_D65_TO_D50) },
  ];

  const tagCount = rawTags.length;
  const tagTableStart = ICC_HEADER_SIZE + 4;
  let cursor = pad4(tagTableStart + tagCount * 12);

  const offsets = new Map<string, { offset: number; size: number }>();
  const uniqueBlocks: Array<{ offset: number; data: Uint8Array }> = [];

  for (const tag of rawTags) {
    if (tag.sharedWith) {
      const target = offsets.get(tag.sharedWith);
      if (target) {
        offsets.set(tag.sig, { offset: target.offset, size: target.size });
        continue;
      }
    }
    const blockOffset = cursor;
    offsets.set(tag.sig, { offset: blockOffset, size: tag.data.length });
    uniqueBlocks.push({ offset: blockOffset, data: tag.data });
    cursor += pad4(tag.data.length);
  }

  const totalSize = cursor;
  const profile = new Uint8Array(totalSize);

  // Header (128 bytes)
  writeUint32BE(profile, 0, totalSize);
  writeAscii4(profile, 4, 'lcms'); // Preferred CMM
  profile[8] = 2; // Major version 2
  profile[9] = 0x10; // Minor/Bugfix 1.0 -> 2.1.0
  writeAscii4(profile, 12, 'mntr'); // Display device
  writeAscii4(profile, 16, 'RGB '); // Data colour space
  writeAscii4(profile, 20, 'XYZ '); // PCS
  // Date: 2024-01-01 00:00:00 UTC
  writeUint16BE(profile, 24, 2024);
  writeUint16BE(profile, 26, 1);
  writeUint16BE(profile, 28, 1);
  writeAscii4(profile, 36, 'acsp'); // File signature
  writeAscii4(profile, 40, 'MSFT'); // Primary platform
  writeUint32BE(profile, 64, 0); // Rendering intent: Perceptual
  // PCS Illuminant (D50)
  writeS15Fixed16BE(profile, 68, D50_X);
  writeS15Fixed16BE(profile, 72, D50_Y);
  writeS15Fixed16BE(profile, 76, D50_Z);
  writeAscii4(profile, 80, 'PDFH'); // Creator signature

  // Tag count & Tag table
  writeUint32BE(profile, ICC_HEADER_SIZE, tagCount);
  rawTags.forEach((tag, index) => {
    const entryOffset = tagTableStart + index * 12;
    const loc = offsets.get(tag.sig)!;
    writeAscii4(profile, entryOffset, tag.sig);
    writeUint32BE(profile, entryOffset + 4, loc.offset);
    writeUint32BE(profile, entryOffset + 8, loc.size);
  });

  // Tag payloads
  for (const block of uniqueBlocks) {
    profile.set(block.data, block.offset);
  }

  cachedSrgbProfile = profile;
  return new Uint8Array(profile);
}

/**
 * Inspects an ICC binary stream header & tag table for PDF/A OutputIntent validation.
 */
export function inspectIccProfileHeader(bytes: Uint8Array): IccProfileHeaderSummary {
  if (bytes.length < ICC_HEADER_SIZE + 4) {
    return {
      valid: false,
      byteLength: bytes.length,
      declaredSize: 0,
      versionMajor: 0,
      versionMinor: 0,
      deviceClass: '',
      colorSpace: '',
      pcs: '',
      magic: '',
      renderingIntent: -1,
      tagCount: 0,
      componentCount: null,
      tags: [],
    };
  }

  const declaredSize = readUint32BE(bytes, 0);
  const versionMajor = bytes[8];
  const versionMinor = (bytes[9] >>> 4) & 0x0f;
  const deviceClass = readAscii4(bytes, 12);
  const colorSpace = readAscii4(bytes, 16);
  const pcs = readAscii4(bytes, 20);
  const magic = readAscii4(bytes, 36);
  const renderingIntent = readUint32BE(bytes, 64);
  const tagCount = readUint32BE(bytes, ICC_HEADER_SIZE);

  const componentMap: Record<string, number> = {
    'GRAY': 1,
    'RGB ': 3,
    'XYZ ': 3,
    'Lab ': 3,
    'CMYK': 4,
  };
  const componentCount = componentMap[colorSpace] ?? null;

  const tags: string[] = [];
  let tagTableValid = tagCount <= 256 && ICC_HEADER_SIZE + 4 + tagCount * 12 <= bytes.length;
  if (tagTableValid) {
    for (let i = 0; i < tagCount; i += 1) {
      const entryOffset = ICC_HEADER_SIZE + 4 + i * 12;
      const sig = readAscii4(bytes, entryOffset);
      const offset = readUint32BE(bytes, entryOffset + 4);
      const size = readUint32BE(bytes, entryOffset + 8);
      if (offset < ICC_HEADER_SIZE + 4 || offset + size > bytes.length) {
        tagTableValid = false;
        break;
      }
      tags.push(sig);
    }
  }

  const valid =
    magic === 'acsp' &&
    declaredSize > 0 &&
    declaredSize <= bytes.length &&
    tagTableValid &&
    componentCount !== null;

  return {
    valid,
    byteLength: bytes.length,
    declaredSize,
    versionMajor,
    versionMinor,
    deviceClass,
    colorSpace,
    pcs,
    magic,
    renderingIntent,
    tagCount,
    componentCount,
    tags,
  };
}

export type { BuiltTag };
