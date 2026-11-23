/**
 * PDF Font Inspector (ISO 32000-1 §9.5 - §9.7).
 * Inspects font dictionaries, cleans subset prefixes, and extracts advance width tables and CMaps.
 */

import { parseToUnicodeCMap } from './cMapParser';
import type {
  PdfFontDescriptor,
  PdfFontEncodingType,
  PdfFontMetadata,
  PdfFontMetrics,
  PdfFontSubtype,
  PdfToUnicodeCMap,
} from './types';

export interface RawFontDictInput {
  resourceName: string;
  subtype: string;
  baseFont?: string;
  encoding?: string | null;
  firstChar?: number;
  lastChar?: number;
  widths?: readonly number[];
  defaultWidth?: number;
  cidW?: readonly unknown[];
  toUnicodeBytes?: Uint8Array | null;
  descriptor?: {
    fontName?: string;
    flags?: number;
    fontBBox?: [number, number, number, number];
    italicAngle?: number;
    ascent?: number;
    descent?: number;
    capHeight?: number;
    missingWidth?: number;
  } | null;
  descendantFont?: {
    subtype?: string;
    baseFont?: string;
    defaultWidth?: number;
    cidW?: readonly unknown[];
    descriptor?: {
      fontName?: string;
      flags?: number;
      fontBBox?: [number, number, number, number];
      italicAngle?: number;
      ascent?: number;
      descent?: number;
      capHeight?: number;
      missingWidth?: number;
    } | null;
  } | null;
}

export function cleanFontFamilyName(baseFont: string): {
  cleanFamily: string;
  isSubset: boolean;
} {
  let name = baseFont.replace(/^\//, '');
  let isSubset = false;

  // Check for 6-uppercase-letters + '+' subset tag e.g. "ABCDEE+Calibri"
  const subsetMatch = name.match(/^([A-Z]{6})\+(.+)$/);
  if (subsetMatch) {
    isSubset = true;
    name = subsetMatch[2];
  }

  // ISO 32000-1 §7.3.5: Unescape #xx hex representations in PDF names (e.g. #20 -> space)
  name = name.replace(/#([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  // Strip font style suffixes e.g. "Calibri,Bold" or "Arial-Italic"
  const familyClean = name.split(/[,-]/)[0].trim();

  return {
    cleanFamily: familyClean.length > 0 ? familyClean : name,
    isSubset,
  };
}

export function parseCidWidthsArray(
  cidW: readonly unknown[],
): Map<number, number> {
  const result = new Map<number, number>();
  let i = 0;

  while (i < cidW.length) {
    const firstCid = cidW[i];
    if (typeof firstCid !== 'number') {
      i += 1;
      continue;
    }

    const next = cidW[i + 1];

    // Format 1: c [ w1 w2 w3 ... ]
    if (Array.isArray(next)) {
      for (let offset = 0; offset < next.length; offset++) {
        const widthVal = next[offset];
        if (typeof widthVal === 'number') {
          result.set(firstCid + offset, widthVal);
        }
      }
      i += 2;
      continue;
    }

    // Format 2: c_first c_last w
    const lastCid = next;
    const constWidth = cidW[i + 2];
    if (typeof lastCid === 'number' && typeof constWidth === 'number') {
      if (firstCid >= 0 && lastCid >= firstCid && lastCid <= 65535) {
        for (let cid = firstCid; cid <= lastCid; cid++) {
          result.set(cid, constWidth);
        }
      }
      i += 3;
      continue;
    }

    i += 1;
  }

  return result;
}

export function parseSimpleWidthsArray(
  firstChar = 0,
  lastChar = 255,
  widths: readonly number[] = [],
): Map<number, number> {
  const result = new Map<number, number>();

  for (let code = firstChar; code <= lastChar && code - firstChar < widths.length; code++) {
    result.set(code, widths[code - firstChar]);
  }

  return result;
}

export function inspectPdfFont(input: RawFontDictInput): PdfFontMetadata {
  const baseFont = input.baseFont ?? input.descendantFont?.baseFont ?? 'UnknownFont';
  const { cleanFamily, isSubset } = cleanFontFamilyName(baseFont);

  const rawSubtype = input.subtype.replace(/^\//, '');
  const subtype: PdfFontSubtype = normalizeSubtype(rawSubtype);

  const rawEncoding = input.encoding ? input.encoding.replace(/^\//, '') : null;
  const encodingType: PdfFontEncodingType = normalizeEncoding(rawEncoding, subtype);

  // Parse CMap if /ToUnicode is present
  let cMap: PdfToUnicodeCMap | null = null;
  if (input.toUnicodeBytes && input.toUnicodeBytes.length > 0) {
    const cmapSource = latin1ToString(input.toUnicodeBytes);
    cMap = parseToUnicodeCMap(cmapSource);
  }

  // Parse Width metrics
  const unitsPerEm = 1000;
  let widthsMap = new Map<number, number>();
  const defaultWidth = input.defaultWidth ?? input.descendantFont?.defaultWidth ?? 1000;

  if (subtype === 'Type0' && input.descendantFont?.cidW) {
    widthsMap = parseCidWidthsArray(input.descendantFont.cidW);
  } else if (input.widths && input.widths.length > 0) {
    widthsMap = parseSimpleWidthsArray(
      input.firstChar ?? 0,
      input.lastChar ?? 255,
      input.widths,
    );
  }

  const activeDescriptor = input.descriptor ?? input.descendantFont?.descriptor;
  let descriptor: PdfFontDescriptor | undefined;

  if (activeDescriptor) {
    descriptor = {
      fontName: activeDescriptor.fontName ?? baseFont,
      flags: activeDescriptor.flags ?? 0,
      fontBBox: activeDescriptor.fontBBox,
      italicAngle: activeDescriptor.italicAngle,
      ascent: activeDescriptor.ascent,
      descent: activeDescriptor.descent,
      capHeight: activeDescriptor.capHeight,
      missingWidth: activeDescriptor.missingWidth ?? defaultWidth,
    };
  }

  const metrics: PdfFontMetrics = {
    defaultWidthPt: defaultWidth / unitsPerEm,
    widths: new Map(
      Array.from(widthsMap.entries()).map(([code, w]) => [code, w / unitsPerEm]),
    ),
    ascentPt: descriptor?.ascent ? descriptor.ascent / unitsPerEm : undefined,
    descentPt: descriptor?.descent ? descriptor.descent / unitsPerEm : undefined,
    capHeightPt: descriptor?.capHeight ? descriptor.capHeight / unitsPerEm : undefined,
    unitsPerEm,
  };

  return {
    resourceName: input.resourceName,
    baseFont,
    cleanFontFamily: cleanFamily,
    isSubset,
    subtype,
    encodingType,
    cMap,
    metrics,
    descriptor,
  };
}

function normalizeSubtype(raw: string): PdfFontSubtype {
  switch (raw) {
    case 'Type0':
      return 'Type0';
    case 'TrueType':
      return 'TrueType';
    case 'Type1':
      return 'Type1';
    case 'MMType1':
      return 'MMType1';
    case 'Type3':
      return 'Type3';
    case 'CIDFontType0':
      return 'CIDFontType0';
    case 'CIDFontType2':
      return 'CIDFontType2';
    default:
      return 'TrueType';
  }
}

function normalizeEncoding(
  raw: string | null,
  subtype: PdfFontSubtype,
): PdfFontEncodingType {
  if (subtype === 'Type0') {
    if (raw === 'Identity-V') {
      return 'Identity-V';
    }
    return 'Identity-H';
  }

  if (!raw) {
    return 'Standard';
  }

  switch (raw) {
    case 'WinAnsiEncoding':
      return 'WinAnsi';
    case 'MacRomanEncoding':
      return 'MacRoman';
    case 'Identity-H':
      return 'Identity-H';
    case 'Identity-V':
      return 'Identity-V';
    default:
      return 'Custom';
  }
}

function latin1ToString(bytes: Uint8Array): string {
  let str = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return str;
}
