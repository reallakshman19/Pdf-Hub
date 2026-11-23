/**
 * PDF Glyph & Text Encoder.
 * Encodes replacement UTF-16 text strings into font-specific byte representations (WinAnsi or 2-byte CIDs).
 * Detects missing glyphs in font subsets before mutation.
 */

import type { GlyphEncodingResult, PdfFontMetadata } from './types';

export function encodeTextForFont(
  text: string,
  font: PdfFontMetadata,
  fontSizePt = 12,
): GlyphEncodingResult {
  if (text.length === 0) {
    return {
      status: 'encodable',
      encodedBytes: new Uint8Array(),
      hexString: '',
      isTwoByteCid: font.subtype === 'Type0',
      advanceWidthPt: 0,
    };
  }

  // Path A: Font has a /ToUnicode CMap (Composite Type 0 or mapped TrueType)
  if (font.cMap) {
    return encodeWithCMap(text, font, fontSizePt);
  }

  // Path B: Simple Font without CMap (Standard-14 or WinAnsi TrueType)
  return encodeWithWinAnsi(text, font, fontSizePt);
}

function encodeWithCMap(
  text: string,
  font: PdfFontMetadata,
  fontSizePt: number,
): GlyphEncodingResult {
  const cMap = font.cMap;
  if (!cMap) {
    return {
      status: 'missing-glyphs',
      missingCharacters: Array.from(text),
      availableCharacters: [],
    };
  }

  const missing: string[] = [];
  const cids: number[] = [];

  // ISO 32000-1 §9.10.3: Collect multi-character ligature keys (sorted longest first)
  const ligatureKeys = cMap.hasLigatures
    ? Array.from(cMap.unicodeToCid.keys())
        .filter((k) => k.length > 1)
        .sort((a, b) => b.length - a.length)
    : [];

  let i = 0;
  while (i < text.length) {
    let matched = false;

    // Check multi-character ligatures first
    if (ligatureKeys.length > 0) {
      for (const key of ligatureKeys) {
        if (text.startsWith(key, i)) {
          const cid = cMap.unicodeToCid.get(key);
          if (cid !== undefined) {
            cids.push(cid);
            i += key.length;
            matched = true;
            break;
          }
        }
      }
    }

    if (matched) {
      continue;
    }

    // Code point extraction preserves surrogate pairs (> U+FFFF)
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) {
      break;
    }
    const charStr = String.fromCodePoint(codePoint);
    const cid = cMap.unicodeToCid.get(charStr);

    if (cid === undefined) {
      if (!missing.includes(charStr)) {
        missing.push(charStr);
      }
    } else {
      cids.push(cid);
    }

    i += charStr.length;
  }

  if (missing.length > 0) {
    return {
      status: 'missing-glyphs',
      missingCharacters: missing,
      availableCharacters: Array.from(cMap.unicodeToCid.keys()),
    };
  }

  const isTwoByte = cMap.codeSpaceBytes === 2 || font.subtype === 'Type0';
  const byteLength = isTwoByte ? cids.length * 2 : cids.length;
  const bytes = new Uint8Array(byteLength);
  let hexString = '';
  let totalAdvancePt = 0;

  for (let i = 0; i < cids.length; i++) {
    const cid = cids[i];
    const widthRatio = font.metrics.widths.get(cid) ?? font.metrics.defaultWidthPt;
    totalAdvancePt += widthRatio * fontSizePt;

    if (isTwoByte) {
      const high = (cid >> 8) & 0xff;
      const low = cid & 0xff;
      bytes[i * 2] = high;
      bytes[i * 2 + 1] = low;
      hexString += high.toString(16).padStart(2, '0').toUpperCase();
      hexString += low.toString(16).padStart(2, '0').toUpperCase();
    } else {
      bytes[i] = cid & 0xff;
      hexString += (cid & 0xff).toString(16).padStart(2, '0').toUpperCase();
    }
  }

  return {
    status: 'encodable',
    encodedBytes: bytes,
    hexString,
    isTwoByteCid: isTwoByte,
    advanceWidthPt: totalAdvancePt,
  };
}

function encodeWithWinAnsi(
  text: string,
  font: PdfFontMetadata,
  fontSizePt: number,
): GlyphEncodingResult {
  const missing: string[] = [];
  const codes: number[] = [];
  let totalAdvancePt = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Printable ASCII check
    if (code < 0x20 || code > 0x7e) {
      if (!missing.includes(char)) {
        missing.push(char);
      }
    } else {
      codes.push(code);
      const widthRatio = font.metrics.widths.get(code) ?? font.metrics.defaultWidthPt;
      totalAdvancePt += widthRatio * fontSizePt;
    }
  }

  if (missing.length > 0) {
    return {
      status: 'missing-glyphs',
      missingCharacters: missing,
      availableCharacters: Array.from({ length: 95 }, (_, idx) =>
        String.fromCharCode(0x20 + idx),
      ),
    };
  }

  const bytes = new Uint8Array(codes);
  const hexString = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  return {
    status: 'encodable',
    encodedBytes: bytes,
    hexString,
    isTwoByteCid: false,
    advanceWidthPt: totalAdvancePt,
  };
}
