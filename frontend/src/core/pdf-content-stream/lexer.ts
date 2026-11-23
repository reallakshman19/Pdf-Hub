/**
 * PDF Content Stream Lexer (ISO 32000-1 §7.2).
 * Converts raw PDF content stream bytes into a token stream.
 */

export type ContentTokenKind =
  | 'number'
  | 'name'
  | 'literal-string'
  | 'hex-string'
  | 'boolean'
  | 'word'
  | 'structural'
  | 'inline-image-data';

export interface ContentToken {
  kind: ContentTokenKind;
  rawStart: number;
  rawEnd: number;
  raw: string;
  numberValue?: number;
  nameValue?: string;
  booleanValue?: boolean;
  stringBytes?: Uint8Array;
  decodedText?: string;
  arrayItems?: unknown[];
  dictEntries?: Record<string, unknown>;
}

export interface LexResult {
  complete: boolean;
  tokens: ContentToken[];
  diagnostics: string[];
}

export function lexContentStream(source: string): LexResult {
  const tokens: ContentToken[] = [];
  const diagnostics: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const code = source.charCodeAt(cursor);

    if (isWhitespace(code)) {
      cursor += 1;
      continue;
    }

    if (source[cursor] === '%') {
      cursor += 1;
      while (
        cursor < source.length &&
        source[cursor] !== '\n' &&
        source[cursor] !== '\r'
      ) {
        cursor += 1;
      }
      continue;
    }

    if (source[cursor] === '(') {
      const parsed = readLiteralString(source, cursor);
      if (!parsed) {
        diagnostics.push(`Malformed literal string at byte ${cursor}.`);
        break;
      }
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    if (source[cursor] === '<' && source[cursor + 1] !== '<') {
      const parsed = readHexString(source, cursor);
      if (!parsed) {
        diagnostics.push(`Malformed hex string at byte ${cursor}.`);
        break;
      }
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    if (source[cursor] === '<' && source[cursor + 1] === '<') {
      tokens.push({
        kind: 'structural',
        rawStart: cursor,
        rawEnd: cursor + 2,
        raw: '<<',
      });
      cursor += 2;
      continue;
    }

    if (source[cursor] === '>' && source[cursor + 1] === '>') {
      tokens.push({
        kind: 'structural',
        rawStart: cursor,
        rawEnd: cursor + 2,
        raw: '>>',
      });
      cursor += 2;
      continue;
    }

    if (
      source[cursor] === '[' ||
      source[cursor] === ']' ||
      source[cursor] === '{' ||
      source[cursor] === '}'
    ) {
      tokens.push({
        kind: 'structural',
        rawStart: cursor,
        rawEnd: cursor + 1,
        raw: source[cursor],
      });
      cursor += 1;
      continue;
    }

    if (source[cursor] === '/') {
      const parsed = readName(source, cursor);
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    const parsed = readBareToken(source, cursor);
    if (!parsed) {
      diagnostics.push(`Unable to tokenize content stream at byte ${cursor}.`);
      break;
    }
    tokens.push(parsed.token);
    cursor = parsed.next;

    // Special handling for inline image data between ID and EI (ISO 32000-1 §8.9.5)
    if (parsed.token.raw === 'ID') {
      let dataStart = cursor;
      if (dataStart < source.length && isWhitespace(source.charCodeAt(dataStart))) {
        if (source[dataStart] === '\r' && source[dataStart + 1] === '\n') {
          dataStart += 2;
        } else {
          dataStart += 1;
        }
      }

      let dataEnd = -1;
      let eiCursor = dataStart;

      while (eiCursor < source.length) {
        if (
          source[eiCursor] === 'E' &&
          source[eiCursor + 1] === 'I' &&
          (eiCursor === dataStart || isWhitespace(source.charCodeAt(eiCursor - 1))) &&
          (eiCursor + 2 >= source.length ||
            isWhitespace(source.charCodeAt(eiCursor + 2)) ||
            isDelimiter(source.charCodeAt(eiCursor + 2)))
        ) {
          dataEnd = eiCursor;
          if (dataEnd > dataStart && isWhitespace(source.charCodeAt(dataEnd - 1))) {
            dataEnd -= 1;
          }
          break;
        }
        eiCursor += 1;
      }

      if (dataEnd === -1) {
        diagnostics.push(`Unterminated inline image data starting at byte ${dataStart}.`);
        break;
      }

      const binarySlice = source.slice(dataStart, dataEnd);
      const stringBytes = new Uint8Array(binarySlice.length);
      for (let i = 0; i < binarySlice.length; i++) {
        stringBytes[i] = binarySlice.charCodeAt(i) & 0xff;
      }

      tokens.push({
        kind: 'inline-image-data',
        rawStart: dataStart,
        rawEnd: dataEnd,
        raw: binarySlice,
        stringBytes,
      });

      tokens.push({
        kind: 'word',
        rawStart: eiCursor,
        rawEnd: eiCursor + 2,
        raw: 'EI',
      });

      cursor = eiCursor + 2;
    }
  }

  return {
    complete: diagnostics.length === 0,
    tokens,
    diagnostics,
  };
}

function readLiteralString(
  source: string,
  start: number,
): { token: ContentToken; next: number } | null {
  const bytes: number[] = [];
  let depth = 1;
  let cursor = start + 1;

  while (cursor < source.length) {
    const character = source[cursor];

    if (character === '\\') {
      cursor += 1;
      if (cursor >= source.length) {
        return null;
      }

      const escaped = source[cursor];

      // Line continuation
      if (escaped === '\n' || escaped === '\r') {
        if (escaped === '\r' && source[cursor + 1] === '\n') {
          cursor += 1;
        }
        cursor += 1;
        continue;
      }

      const escapeMap: Record<string, number> = {
        n: 0x0a,
        r: 0x0d,
        t: 0x09,
        b: 0x08,
        f: 0x0c,
        '(': 0x28,
        ')': 0x29,
        '\\': 0x5c,
      };

      if (escaped in escapeMap) {
        bytes.push(escapeMap[escaped]);
        cursor += 1;
        continue;
      }

      // Octal escape \ddd (1 to 3 octal digits)
      if (/[0-7]/.test(escaped)) {
        let octalStr = escaped;
        cursor += 1;
        for (let i = 0; i < 2 && cursor < source.length; i++) {
          if (/[0-7]/.test(source[cursor])) {
            octalStr += source[cursor];
            cursor += 1;
          } else {
            break;
          }
        }
        const octalValue = parseInt(octalStr, 8);
        bytes.push(octalValue & 0xff);
        continue;
      }

      // Any other character is escaped literally
      bytes.push(escaped.charCodeAt(0) & 0xff);
      cursor += 1;
      continue;
    }

    if (character === '(') {
      depth += 1;
      bytes.push(0x28);
      cursor += 1;
      continue;
    }

    if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        const raw = source.slice(start, cursor + 1);
        const stringBytes = Uint8Array.from(bytes);
        const decodedText = tryDecodeAsciiText(bytes);
        return {
          token: {
            kind: 'literal-string',
            rawStart: start,
            rawEnd: cursor + 1,
            raw,
            stringBytes,
            ...(decodedText !== null ? { decodedText } : {}),
          },
          next: cursor + 1,
        };
      }
      bytes.push(0x29);
      cursor += 1;
      continue;
    }

    bytes.push(character.charCodeAt(0) & 0xff);
    cursor += 1;
  }

  return null;
}

function readHexString(
  source: string,
  start: number,
): { token: ContentToken; next: number } | null {
  let cursor = start + 1;
  let hex = '';

  while (cursor < source.length && source[cursor] !== '>') {
    const character = source[cursor];
    if (!isWhitespace(character.charCodeAt(0))) {
      if (!/[0-9a-fA-F]/.test(character)) {
        return null;
      }
      hex += character;
    }
    cursor += 1;
  }

  if (cursor >= source.length) {
    return null;
  }

  // ISO 32000-1 §7.3.4.3: If odd number of digits, final 0 is appended
  if (hex.length % 2 === 1) {
    hex += '0';
  }

  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2), 16));
  }

  const stringBytes = Uint8Array.from(bytes);
  const decodedText = tryDecodeAsciiText(bytes);

  return {
    token: {
      kind: 'hex-string',
      rawStart: start,
      rawEnd: cursor + 1,
      raw: source.slice(start, cursor + 1),
      stringBytes,
      ...(decodedText !== null ? { decodedText } : {}),
    },
    next: cursor + 1,
  };
}

function readName(
  source: string,
  start: number,
): { token: ContentToken; next: number } {
  let cursor = start + 1;
  while (cursor < source.length && !isDelimiter(source.charCodeAt(cursor))) {
    cursor += 1;
  }

  const raw = source.slice(start, cursor);
  const nameValue = decodePdfName(raw.slice(1));

  return {
    token: {
      kind: 'name',
      rawStart: start,
      rawEnd: cursor,
      raw,
      nameValue,
    },
    next: cursor,
  };
}

function readBareToken(
  source: string,
  start: number,
): { token: ContentToken; next: number } | null {
  let cursor = start;
  while (cursor < source.length && !isDelimiter(source.charCodeAt(cursor))) {
    cursor += 1;
  }

  if (cursor === start) {
    return null;
  }

  const raw = source.slice(start, cursor);

  if (raw === 'true' || raw === 'false') {
    return {
      token: {
        kind: 'boolean',
        rawStart: start,
        rawEnd: cursor,
        raw,
        booleanValue: raw === 'true',
      },
      next: cursor,
    };
  }

  const numberValue = parsePdfNumber(raw);
  if (numberValue !== null) {
    return {
      token: {
        kind: 'number',
        rawStart: start,
        rawEnd: cursor,
        raw,
        numberValue,
      },
      next: cursor,
    };
  }

  return {
    token: {
      kind: 'word',
      rawStart: start,
      rawEnd: cursor,
      raw,
    },
    next: cursor,
  };
}

export function parsePdfNumber(raw: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function decodePdfName(raw: string): string {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export function isWhitespace(code: number): boolean {
  return (
    code === 0x00 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x20
  );
}

export function isDelimiter(code: number): boolean {
  return (
    isWhitespace(code) ||
    code === 0x28 || // (
    code === 0x29 || // )
    code === 0x3c || // <
    code === 0x3e || // >
    code === 0x5b || // [
    code === 0x5d || // ]
    code === 0x7b || // {
    code === 0x7d || // }
    code === 0x2f || // /
    code === 0x25    // %
  );
}

export function bytesToLatin1(bytes: Uint8Array): string {
  let output = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)),
    );
  }
  return output;
}

function tryDecodeAsciiText(bytes: readonly number[]): string | null {
  if (
    !bytes.some(
      (byte) =>
        (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) ||
        byte > 0x7e,
    )
  ) {
    return String.fromCharCode(...bytes);
  }

  // 2-byte big-endian ASCII / UTF-16BE (e.g. Identity-H CID text in PDF content streams)
  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    const chars: number[] = [];
    let isTwoByteAscii = true;
    for (let i = 0; i < bytes.length; i += 2) {
      const high = bytes[i];
      const low = bytes[i + 1];
      if (
        high !== 0 ||
        (low < 0x20 && low !== 0x09 && low !== 0x0a && low !== 0x0d) ||
        low > 0x7e
      ) {
        isTwoByteAscii = false;
        break;
      }
      chars.push(low);
    }
    if (isTwoByteAscii) {
      return String.fromCharCode(...chars);
    }
  }

  return null;
}
