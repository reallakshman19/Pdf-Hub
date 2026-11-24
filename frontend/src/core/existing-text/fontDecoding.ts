/**
 * Font-aware decoding of content-stream string bytes for existing-text
 * provenance matching (ISO 32000-1 §9.4.3, §9.6.6, §9.10).
 *
 * The decoder is plain data so the matcher stays a pure core function: the
 * pdf-lib adapter builds one per page font resource. A code without a known
 * Unicode mapping makes the whole string undecodable, so the matcher fails
 * closed instead of comparing against guessed text.
 */

export interface ExistingTextFontDecoder {
  /** Bytes per character code: 1 for simple fonts, 2 for Identity-H Type0. */
  codeBytes: 1 | 2;
  /** Character code -> Unicode text (may be several code points for ligatures). */
  toUnicode: ReadonlyMap<number, string>;
  /** Character code -> horizontal advance per 1 pt of font size (glyph width / 1000). */
  widths: ReadonlyMap<number, number>;
  /** Advance for codes absent from `widths`; null when unknown (advance then cannot be tracked). */
  defaultWidth: number | null;
}

export type ExistingTextFontDecoders =
  Readonly<Record<string, ExistingTextFontDecoder>>;

export interface ExistingTextDecodedString {
  text: string;
  codes: number[];
}

/** Splits string bytes into character codes and maps each through the decoder. */
export function decodeExistingTextString(
  bytes: Uint8Array,
  decoder: ExistingTextFontDecoder,
): ExistingTextDecodedString | null {
  if (bytes.length % decoder.codeBytes !== 0) return null;
  const codes: number[] = [];
  let text = '';
  for (let index = 0; index < bytes.length; index += decoder.codeBytes) {
    const code = decoder.codeBytes === 2
      ? (bytes[index] << 8) | bytes[index + 1]
      : bytes[index];
    const unicode = decoder.toUnicode.get(code);
    if (unicode === undefined) return null;
    codes.push(code);
    text += unicode;
  }
  return { text, codes };
}

/** Advance of one code per 1 pt font size, or null when the font metrics do not say. */
export function existingTextCodeWidth(
  decoder: ExistingTextFontDecoder,
  code: number,
): number | null {
  const width = decoder.widths.get(code);
  if (width !== undefined && Number.isFinite(width)) return width;
  return decoder.defaultWidth;
}

/**
 * Comparison form shared by span text and decoded operator text: Unicode
 * compatibility normalisation (PDF.js normalises ligatures such as "ﬁ") and
 * no whitespace, because PDF.js inserts or drops spaces from glyph gaps.
 */
export function normalizeExistingTextForMatch(text: string): string {
  return text.normalize('NFKC').replace(/[\s\p{Cf}]+/gu, '');
}

const WIN_ANSI_HIGH: Readonly<Record<number, string>> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

/**
 * Code -> Unicode for a simple font without /ToUnicode. Only WinAnsi (and the
 * printable-ASCII range shared by Standard/MacRoman) is modelled; anything
 * else stays unmapped so the matcher fails closed.
 */
export function simpleEncodingToUnicode(
  encoding: 'WinAnsi' | 'Standard' | 'MacRoman',
): Map<number, string> {
  const map = new Map<number, string>();
  for (let code = 0x20; code <= 0x7e; code += 1) {
    map.set(code, String.fromCharCode(code));
  }
  if (encoding === 'Standard') {
    // StandardEncoding uses typographic quotes at these two positions.
    map.set(0x27, '’');
    map.set(0x60, '‘');
    return map;
  }
  if (encoding === 'WinAnsi') {
    for (const [code, unicode] of Object.entries(WIN_ANSI_HIGH)) {
      map.set(Number(code), unicode);
    }
    for (let code = 0xa0; code <= 0xff; code += 1) {
      map.set(code, String.fromCharCode(code));
    }
  }
  return map;
}
