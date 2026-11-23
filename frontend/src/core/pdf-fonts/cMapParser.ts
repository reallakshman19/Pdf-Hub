/**
 * PDF /ToUnicode CMap Parser (ISO 32000-1 §9.10.3).
 * Parses CMap streams to build bidirectional CID <-> Unicode mapping tables.
 */

import type { PdfToUnicodeCMap } from './types';

export function parseToUnicodeCMap(cmapSource: string): PdfToUnicodeCMap {
  const cidToUnicode = new Map<number, string>();
  const unicodeToCid = new Map<string, number>();
  let hasLigatures = false;
  let codeSpaceBytes = 2; // Default to 2-byte CIDs for composite fonts

  // ISO 32000-1 §7.2.3: Strip PostScript comments (% to end-of-line)
  const cleanSource = cmapSource.replace(/%[^\r\n]*/g, '');

  // 1. Detect codespace range byte width
  const codeSpaceMatch = cleanSource.match(
    /begincodespacerange\s+([\s\S]*?)\s+endcodespacerange/i,
  );
  if (codeSpaceMatch) {
    const rangeContent = codeSpaceMatch[1];
    const hexBlocks = extractHexTokens(rangeContent);
    if (hexBlocks.length >= 2) {
      // e.g. <00> is 1 byte, <0000> is 2 bytes
      codeSpaceBytes = Math.max(1, Math.floor(hexBlocks[0].length / 2));
    }
  }

  // 2. Parse bfchar blocks: <srcCode> <dstUnicode>
  const bfCharRegex = /beginbfchar\s+([\s\S]*?)\s+endbfchar/gi;
  let bfCharMatch: RegExpExecArray | null;

  while ((bfCharMatch = bfCharRegex.exec(cleanSource)) !== null) {
    const tokens = extractHexTokens(bfCharMatch[1]);
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const cidHex = tokens[i];
      const unicodeHex = tokens[i + 1];

      const cid = parseInt(cidHex, 16);
      const unicodeStr = decodeUtf16Hex(unicodeHex);

      if (Number.isFinite(cid) && unicodeStr.length > 0) {
        cidToUnicode.set(cid, unicodeStr);
        if (!unicodeToCid.has(unicodeStr)) {
          unicodeToCid.set(unicodeStr, cid);
        }
        if (unicodeStr.length > 1) {
          hasLigatures = true;
        }
      }
    }
  }

  // 3. Parse bfrange blocks:
  // Format A: <srcLo> <srcHi> <dstLo>
  // Format B: <srcLo> <srcHi> [ <dst1> <dst2> ... ]
  const bfRangeRegex = /beginbfrange\s+([\s\S]*?)\s+endbfrange/gi;
  let bfRangeMatch: RegExpExecArray | null;

  while ((bfRangeMatch = bfRangeRegex.exec(cleanSource)) !== null) {
    parseBfRangeBlock(bfRangeMatch[1], cidToUnicode, unicodeToCid, () => {
      hasLigatures = true;
    });
  }

  return {
    cidToUnicode,
    unicodeToCid,
    hasLigatures,
    codeSpaceBytes,
  };
}

function parseBfRangeBlock(
  content: string,
  cidToUnicode: Map<number, string>,
  unicodeToCid: Map<string, number>,
  onLigature: () => void,
): void {
  // Tokenize content into hex strings <...>, brackets [ ], and bare text
  const tokens = tokenizeBfRange(content);
  let idx = 0;

  while (idx < tokens.length) {
    const loToken = tokens[idx];
    const hiToken = tokens[idx + 1];

    if (!loToken || !hiToken || !loToken.startsWith('<') || !hiToken.startsWith('<')) {
      idx += 1;
      continue;
    }

    const loCid = parseInt(loToken.replace(/[<>]/g, ''), 16);
    const hiCid = parseInt(hiToken.replace(/[<>]/g, ''), 16);

    idx += 2;
    if (idx >= tokens.length) {
      break;
    }

    const destToken = tokens[idx];

    // Format B: <srcLo> <srcHi> [ <dst1> <dst2> ... ]
    if (destToken === '[') {
      idx += 1;
      let currentCid = loCid;
      while (idx < tokens.length && tokens[idx] !== ']' && currentCid <= hiCid) {
        const hex = tokens[idx].replace(/[^0-9a-fA-F]/g, '');
        const unicodeStr = decodeUtf16Hex(hex);
        if (unicodeStr.length > 0) {
          cidToUnicode.set(currentCid, unicodeStr);
          if (!unicodeToCid.has(unicodeStr)) {
            unicodeToCid.set(unicodeStr, currentCid);
          }
          if (unicodeStr.length > 1) {
            onLigature();
          }
        }
        currentCid += 1;
        idx += 1;
      }
      if (idx < tokens.length && tokens[idx] === ']') {
        idx += 1;
      }
      continue;
    }

    // Format A: <srcLo> <srcHi> <dstLo>
    if (destToken.startsWith('<')) {
      const dstHex = destToken.replace(/[^0-9a-fA-F]/g, '');
      const dstBase = parseInt(dstHex, 16);

      for (let offset = 0; loCid + offset <= hiCid; offset++) {
        const cid = loCid + offset;
        const targetCode = dstBase + offset;
        const unicodeStr = String.fromCharCode(targetCode);

        cidToUnicode.set(cid, unicodeStr);
        if (!unicodeToCid.has(unicodeStr)) {
          unicodeToCid.set(unicodeStr, cid);
        }
      }
      idx += 1;
      continue;
    }

    idx += 1;
  }
}

function tokenizeBfRange(content: string): string[] {
  const result: string[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const char = content[cursor];

    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }

    if (char === '<') {
      const end = content.indexOf('>', cursor);
      if (end !== -1) {
        result.push(content.slice(cursor, end + 1));
        cursor = end + 1;
      } else {
        cursor += 1;
      }
      continue;
    }

    if (char === '[' || char === ']') {
      result.push(char);
      cursor += 1;
      continue;
    }

    // Bare word
    let wordEnd = cursor;
    while (wordEnd < content.length && !/[\s<>[\]]/.test(content[wordEnd])) {
      wordEnd += 1;
    }
    result.push(content.slice(cursor, wordEnd));
    cursor = wordEnd;
  }

  return result;
}

function extractHexTokens(content: string): string[] {
  // ISO 32000-1 §7.2.3: Strip PostScript comments before extracting tokens
  const clean = content.replace(/%[^\r\n]*/g, '');
  const matches = clean.match(/<([0-9a-fA-F\s]+)>/g);
  if (!matches) {
    return [];
  }
  return matches.map((m) => m.replace(/[^0-9a-fA-F]/g, ''));
}

export function decodeUtf16Hex(hex: string): string {
  // Hex contains 4 hex digits per UTF-16 code unit
  // Pad if needed
  let clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 4 !== 0 && clean.length % 2 === 0) {
    // 2-byte code unit e.g. <41> -> <0041>
    if (clean.length === 2) {
      clean = '00' + clean;
    }
  }

  const codeUnits: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    if (chunk.length === 4) {
      codeUnits.push(parseInt(chunk, 16));
    }
  }

  return String.fromCharCode(...codeUnits);
}
