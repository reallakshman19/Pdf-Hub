/**
 * Embedded Font Program Classifier & ToUnicode CMap Builder.
 *
 * Inspects Type 1 PFB (`0x80` segment format -> `/FontFile`), CFF / Type 1C
 * (`0x01 0x00 0x04 ...` -> `/FontFile3 /Subtype /Type1C`), and TrueType SFNT
 * programs, and builds ISO 32000 / PDF/A `/ToUnicode` CMaps.
 */

export interface ParsedPfbFont {
  /** Merged raw Type1 payload (ASCII cleartext + eexec binary + cleartext trailer). */
  readonly streamBytes: Uint8Array;
  readonly length1: number;
  readonly length2: number;
  readonly length3: number;
  readonly fontName: string;
}

export type EmbeddedFontStreamSpec =
  | {
      kind: 'pfb';
      parsed: ParsedPfbFont;
    }
  | {
      kind: 'type1c';
      streamBytes: Uint8Array;
      fontName: string;
    };

const ASCII_DECODER = new TextDecoder('latin1');
const UTF8_ENCODER = new TextEncoder();

export function encodeSameRealmUtf8(text: string): Uint8Array {
  const encoded = UTF8_ENCODER.encode(text);
  const out = new Uint8Array(encoded.length);
  out.set(encoded);
  return out;
}

/**
 * Checks whether a font binary starts with a Compact Font Format (CFF / Type 1C) header.
 */
export function isCffType1CFont(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  // CFF header: major=1, minor=0, hdrSize >= 4, offSize in 1..4
  return bytes[0] === 0x01 && bytes[1] === 0x00 && bytes[2] >= 0x04 && bytes[3] >= 1 && bytes[3] <= 4;
}

/**
 * Reads the first name from the CFF Name INDEX if present.
 */
export function readCffFontName(bytes: Uint8Array): string {
  if (!isCffType1CFont(bytes)) return 'EmbeddedType1C';
  const hdrSize = bytes[2];
  if (hdrSize + 3 >= bytes.length) return 'EmbeddedType1C';
  const count = (bytes[hdrSize] << 8) | bytes[hdrSize + 1];
  if (count < 1) return 'EmbeddedType1C';
  const offSize = bytes[hdrSize + 2];
  if (offSize < 1 || offSize > 4) return 'EmbeddedType1C';
  const offsetsStart = hdrSize + 3;
  const readOffset = (idx: number): number => {
    let val = 0;
    const base = offsetsStart + idx * offSize;
    for (let i = 0; i < offSize; i += 1) {
      val = (val << 8) | (bytes[base + i] ?? 0);
    }
    return val;
  };
  if (offsetsStart + 2 * offSize > bytes.length) return 'EmbeddedType1C';
  const off1 = readOffset(0);
  const off2 = readOffset(1);
  const dataStart = offsetsStart + (count + 1) * offSize - 1;
  const start = dataStart + off1;
  const end = dataStart + off2;
  if (start >= 0 && end > start && end <= bytes.length) {
    return ASCII_DECODER.decode(bytes.subarray(start, end)).replace(/\0+$/, '').trim() || 'EmbeddedType1C';
  }
  return 'EmbeddedType1C';
}

/**
 * Inspects a Type 1 font resource payload, supporting both CFF Type1C (`0x01 0x00 ...`)
 * and Adobe PFB binary segments (`0x80 0x01 / 0x02 / 0x03`).
 */
export function inspectType1FontProgram(bytes: Uint8Array): EmbeddedFontStreamSpec {
  if (isCffType1CFont(bytes)) {
    return {
      kind: 'type1c',
      streamBytes: new Uint8Array(bytes),
      fontName: readCffFontName(bytes),
    };
  }
  return {
    kind: 'pfb',
    parsed: parsePfbBinary(bytes),
  };
}

/**
 * Parses an Adobe Type 1 `.pfb` binary into the uncompressed Type 1 `/FontFile`
 * byte payload with exact segment lengths (`Length1`, `Length2`, `Length3`).
 */
export function parsePfbBinary(pfbBytes: Uint8Array): ParsedPfbFont {
  const asciiHeaderChunks: Uint8Array[] = [];
  const binaryChunks: Uint8Array[] = [];
  const trailerChunks: Uint8Array[] = [];

  let offset = 0;
  let seenBinary = false;

  while (offset < pfbBytes.length) {
    if (pfbBytes[offset] !== 0x80) {
      throw new Error(`Invalid PFB segment marker at offset ${offset}.`);
    }
    const segType = pfbBytes[offset + 1];
    if (segType === 3) {
      break;
    }
    if (offset + 6 > pfbBytes.length) {
      throw new Error(`Truncated PFB segment header at offset ${offset}.`);
    }
    const segLen =
      (pfbBytes[offset + 2] |
        (pfbBytes[offset + 3] << 8) |
        (pfbBytes[offset + 4] << 16) |
        (pfbBytes[offset + 5] << 24)) >>>
      0;
    const dataStart = offset + 6;
    const dataEnd = dataStart + segLen;
    if (dataEnd > pfbBytes.length) {
      throw new Error(`Truncated PFB segment data at offset ${offset}.`);
    }
    const chunk = pfbBytes.subarray(dataStart, dataEnd);
    if (segType === 1) {
      if (!seenBinary) {
        asciiHeaderChunks.push(chunk);
      } else {
        trailerChunks.push(chunk);
      }
    } else if (segType === 2) {
      seenBinary = true;
      binaryChunks.push(chunk);
    } else {
      throw new Error(`Unsupported PFB segment type ${segType} at offset ${offset}.`);
    }
    offset = dataEnd;
  }

  const length1 = asciiHeaderChunks.reduce((sum, c) => sum + c.length, 0);
  const length2 = binaryChunks.reduce((sum, c) => sum + c.length, 0);
  const length3 = trailerChunks.reduce((sum, c) => sum + c.length, 0);

  if (length1 === 0 || length2 === 0) {
    throw new Error('PFB binary does not contain required ASCII and eexec segments.');
  }

  const streamBytes = new Uint8Array(length1 + length2 + length3);
  let writeAt = 0;
  for (const chunk of asciiHeaderChunks) {
    streamBytes.set(chunk, writeAt);
    writeAt += chunk.length;
  }
  for (const chunk of binaryChunks) {
    streamBytes.set(chunk, writeAt);
    writeAt += chunk.length;
  }
  for (const chunk of trailerChunks) {
    streamBytes.set(chunk, writeAt);
    writeAt += chunk.length;
  }

  const headerText = ASCII_DECODER.decode(streamBytes.subarray(0, Math.min(length1, 4096)));
  const nameMatch = /\/FontName\s+\/([^\s/]+)/.exec(headerText);
  const fontName = nameMatch ? nameMatch[1] : 'EmbeddedType1';

  return {
    streamBytes,
    length1,
    length2,
    length3,
    fontName,
  };
}

// WinAnsi codepoints 0x80..0x9F mapped to Unicode BMP (ISO 32000-1 Annex D.2)
const WINANSI_80_TO_9F: readonly (number | null)[] = [
  0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017d, null,
  null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x0178,
];

const STANDARD_ENCODING_EXTENDED: Readonly<Record<number, number>> = {
  0xa1: 0x00a1, 0xa2: 0x00a2, 0xa3: 0x00a3, 0xa4: 0x2044, 0xa5: 0x00a5,
  0xa6: 0x0192, 0xa7: 0x00a7, 0xa8: 0x00a4, 0xa9: 0x0027, 0xaa: 0x201c,
  0xab: 0x00ab, 0xac: 0x2039, 0xad: 0x203a, 0xae: 0xfb01, 0xaf: 0xfb02,
  0xb1: 0x2013, 0xb2: 0x2020, 0xb3: 0x2021, 0xb4: 0x00b7, 0xb6: 0x00b6,
  0xb7: 0x2022, 0xb8: 0x201a, 0xb9: 0x201e, 0xba: 0x201d, 0xbb: 0x00bb,
  0xbc: 0x2026, 0xbd: 0x2030, 0xbf: 0x00bf, 0xc1: 0x0060, 0xc2: 0x00b4,
  0xc3: 0x02c6, 0xc4: 0x02dc, 0xc5: 0x00af, 0xc6: 0x02d8, 0xc7: 0x02d9,
  0xc8: 0x00a8, 0xca: 0x02da, 0xcb: 0x00b8, 0xcd: 0x02dd, 0xce: 0x02db,
  0xcf: 0x02c7, 0xd0: 0x2014, 0xe1: 0x00c6, 0xe3: 0x00aa, 0xe8: 0x0141,
  0xe9: 0x00d8, 0xea: 0x0152, 0xeb: 0x00ba, 0xf1: 0x00e6, 0xf5: 0x0131,
  0xf8: 0x0142, 0xf9: 0x00f8, 0xfa: 0x0153, 0xfb: 0x00df,
};

/**
 * Generates an ISO 32000-1 §9.10.3 single-byte `/ToUnicode` CMap stream payload
 * as a realm-safe `Uint8Array`.
 */
export function buildSingleByteToUnicodeCMap(
  encoding: 'WinAnsiEncoding' | 'StandardEncoding' | 'MacRomanEncoding' | 'Symbol' | 'ZapfDingbats',
): Uint8Array {
  const mappings: Array<[number, number]> = [];

  if (encoding === 'Symbol') {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      mappings.push([code, code]);
    }
  } else if (encoding === 'ZapfDingbats') {
    for (let code = 0x20; code <= 0xfe; code += 1) {
      mappings.push([code, 0x2700 + (code - 0x20)]);
    }
  } else {
    for (let code = 0x20; code <= 0xff; code += 1) {
      let unicode: number | null = null;
      if (code <= 0x7e) {
        unicode = code;
      } else if (encoding === 'WinAnsiEncoding') {
        if (code >= 0x80 && code <= 0x9f) {
          unicode = WINANSI_80_TO_9F[code - 0x80];
        } else if (code >= 0xa0) {
          unicode = code;
        }
      } else if (encoding === 'StandardEncoding') {
        unicode = STANDARD_ENCODING_EXTENDED[code] ?? (code >= 0xa0 ? code : null);
      } else {
        unicode = code >= 0xa0 ? code : null;
      }

      if (unicode !== null) {
        mappings.push([code, unicode]);
      }
    }
  }

  const lines: string[] = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo <<',
    '  /Registry (Adobe)',
    '  /Ordering (UCS)',
    '  /Supplement 0',
    '>> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
  ];

  for (let i = 0; i < mappings.length; i += 100) {
    const slice = mappings.slice(i, i + 100);
    lines.push(`${slice.length} beginbfchar`);
    for (const [src, dst] of slice) {
      const sHex = src.toString(16).padStart(2, '0').toUpperCase();
      const dHex = dst.toString(16).padStart(4, '0').toUpperCase();
      lines.push(`<${sHex}> <${dHex}>`);
    }
    lines.push('endbfchar');
  }

  lines.push(
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  );

  return encodeSameRealmUtf8(lines.join('\n'));
}
