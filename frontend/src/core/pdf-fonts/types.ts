/**
 * PDF Font & CMap Engine Types (ISO 32000-1 §9.5 - §9.10).
 * Supports standard fonts, embedded TrueType/CFF, and Type 0 / Identity-H CIDFont subsets.
 */

export type PdfFontSubtype =
  | 'Type0'
  | 'TrueType'
  | 'Type1'
  | 'MMType1'
  | 'Type3'
  | 'CIDFontType0'
  | 'CIDFontType2';

export type PdfFontEncodingType =
  | 'Standard'
  | 'WinAnsi'
  | 'MacRoman'
  | 'Identity-H'
  | 'Identity-V'
  | 'Custom';

export interface PdfToUnicodeCMap {
  name?: string;
  cidToUnicode: Map<number, string>;
  unicodeToCid: Map<string, number>;
  hasLigatures: boolean;
  codeSpaceBytes: number; // 1 for single-byte, 2 for two-byte (CID)
}

export interface PdfFontMetrics {
  defaultWidthPt: number;
  widths: Map<number, number>; // charCode/CID -> advance width in points (scaled to 1pt font size, typically /1000)
  ascentPt?: number;
  descentPt?: number;
  capHeightPt?: number;
  unitsPerEm: number;
}

export interface PdfFontDescriptor {
  fontName: string;
  flags: number;
  fontBBox?: [number, number, number, number];
  italicAngle?: number;
  ascent?: number;
  descent?: number;
  capHeight?: number;
  stemV?: number;
  missingWidth?: number;
}

export interface PdfFontMetadata {
  resourceName: string;
  baseFont: string;
  cleanFontFamily: string;
  isSubset: boolean;
  subtype: PdfFontSubtype;
  encodingType: PdfFontEncodingType;
  cMap: PdfToUnicodeCMap | null;
  metrics: PdfFontMetrics;
  descriptor?: PdfFontDescriptor;
}

export type GlyphEncodingResult =
  | {
      status: 'encodable';
      encodedBytes: Uint8Array;
      hexString: string;
      isTwoByteCid: boolean;
      advanceWidthPt: number; // Advance width scaled by fontSizePt
    }
  | {
      status: 'missing-glyphs';
      missingCharacters: string[];
      availableCharacters: string[];
    };
