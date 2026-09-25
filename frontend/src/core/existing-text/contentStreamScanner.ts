import type {
  ExistingTextContentScanResult,
  ExistingTextDecodedContentStream,
  ExistingTextSimpleStringEncoding,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';
import type {
  ExistingTextTransform,
} from './types';

export type ExistingTextContentTokenKind =
  | 'number'
  | 'name'
  | 'literal-string'
  | 'hex-string'
  | 'word'
  | 'structural';

export interface ExistingTextContentToken {
  kind: ExistingTextContentTokenKind;
  rawStart: number;
  rawEnd: number;
  raw: string;
  numberValue?: number;
  nameValue?: string;
  decodedText?: string;
  encoding?:
    ExistingTextSimpleStringEncoding;
}

interface GraphicsState {
  transformSafe: boolean;
}

interface TextState {
  inTextObject: boolean;
  fontResourceName: string | null;
  fontSizePt: number | null;
  textMatrix:
    ExistingTextTransform | null;
  placementSafe: boolean;
  styleSafe: boolean;
}

const SIMPLE_MATRIX_TOLERANCE = 1e-6;

export function scanExistingTextContentStream(
  stream:
    ExistingTextDecodedContentStream,
): ExistingTextContentScanResult {
  const source =
    existingTextBytesToLatin1(
      stream.decodedBytes,
    );
  const lexed =
    lexExistingTextContentStream(source);

  if (!lexed.complete) {
    return {
      complete: false,
      candidates: [],
      diagnostics:
        lexed.diagnostics,
    };
  }

  const candidates:
    ExistingTextSimpleTextOperator[] = [];
  const diagnostics: string[] = [];
  const operands: ExistingTextContentToken[] = [];
  const graphicsStack:
    GraphicsState[] = [];
  let graphics: GraphicsState = {
    transformSafe: true,
  };
  let text: TextState =
    initialTextState();
  let operatorIndex = 0;

  for (const token of lexed.tokens) {
    if (token.kind !== 'word') {
      operands.push(token);
      continue;
    }

    const operator = token.raw;
    operatorIndex += 1;

    switch (operator) {
      case 'q':
        graphicsStack.push({
          ...graphics,
        });
        break;

      case 'Q':
        graphics =
          graphicsStack.pop()
          ?? {
            transformSafe: false,
          };
        break;

      case 'cm': {
        const matrix =
          readNumericMatrix(
            operands,
          );
        if (
          !matrix
          || !isIdentityMatrix(
            matrix,
          )
        ) {
          graphics = {
            transformSafe: false,
          };
        }
        break;
      }

      case 'BT':
        text =
          initialTextState();
        text.inTextObject = true;
        break;

      case 'ET':
        text =
          initialTextState();
        break;

      case 'Tf': {
        if (
          !text.inTextObject
        ) {
          break;
        }
        const font =
          operands.at(-2);
        const size =
          operands.at(-1);
        if (
          font?.kind === 'name'
          && size?.kind === 'number'
          && Number.isFinite(
            size.numberValue,
          )
          && (
            size.numberValue
            ?? 0
          ) > 0
        ) {
          text.fontResourceName =
            font.nameValue
            ?? null;
          text.fontSizePt =
            size.numberValue
            ?? null;
        } else {
          text.styleSafe = false;
        }
        break;
      }

      case 'Tm': {
        if (
          !text.inTextObject
        ) {
          break;
        }
        const matrix =
          readNumericMatrix(
            operands,
          );
        if (matrix) {
          text.textMatrix =
            matrix;
          text.placementSafe =
            true;
        } else {
          text.textMatrix = null;
          text.placementSafe =
            false;
        }
        break;
      }

      case 'Tj': {
        if (
          text.inTextObject
        ) {
          const operand =
            operands.at(-1);
          const candidate =
            buildSimpleTextCandidate(
              stream,
              token,
              operatorIndex,
              operand,
              graphics,
              text,
            );
          if (candidate) {
            candidates.push(
              candidate,
            );
          }
          // A text-show operator advances the
          // current text matrix. We do not
          // interpret glyph advances in this
          // bounded scanner, so require a new
          // explicit Tm before another match.
          text.placementSafe =
            false;
        }
        break;
      }

      case 'Td':
      case 'TD':
      case 'T*':
      case "'":
      case '"':
      case 'TJ':
        if (text.inTextObject) {
          text.placementSafe =
            false;
        }
        break;

      case 'Tz':
      case 'Ts':
      case 'Tc':
      case 'Tw':
        if (text.inTextObject) {
          text.styleSafe =
            false;
        }
        break;

      default:
        break;
    }

    operands.length = 0;
  }

  if (
    graphicsStack.length > 0
  ) {
    diagnostics.push(
      'Unbalanced q/Q graphics-state operators.',
    );
  }
  if (text.inTextObject) {
    diagnostics.push(
      'Unterminated BT/ET text object.',
    );
  }

  return {
    complete:
      diagnostics.length === 0,
    candidates:
      diagnostics.length === 0
        ? candidates
        : [],
    diagnostics,
  };
}

function buildSimpleTextCandidate(
  stream:
    ExistingTextDecodedContentStream,
  operatorToken: ExistingTextContentToken,
  operatorIndex: number,
  operand: ExistingTextContentToken | undefined,
  graphics: GraphicsState,
  text: TextState,
): ExistingTextSimpleTextOperator | null {
  if (
    !graphics.transformSafe
    || !text.placementSafe
    || !text.styleSafe
    || !text.fontResourceName
    || !text.fontSizePt
    || !text.textMatrix
    || !operand
  ) {
    return null;
  }

  if (
    operand.kind
      !== 'literal-string'
    && operand.kind
      !== 'hex-string'
  ) {
    return null;
  }

  if (
    operand.decodedText
      === undefined
    || !operand.encoding
  ) {
    return null;
  }

  if (
    !isSimpleTextMatrix(
      text.textMatrix,
    )
  ) {
    return null;
  }

  return {
    streamIndex:
      stream.streamIndex,
    streamRef: stream.streamRef,
    operatorIndex,
    operator: 'Tj',
    operatorRange: {
      start:
        operatorToken.rawStart,
      end: operatorToken.rawEnd,
    },
    operandRange: {
      start: operand.rawStart,
      end: operand.rawEnd,
    },
    decodedText:
      operand.decodedText,
    encoding:
      operand.encoding,
    fontResourceName:
      text.fontResourceName,
    fontSizePt:
      text.fontSizePt,
    textMatrix: [
      ...text.textMatrix,
    ],
  };
}

function initialTextState():
  TextState {
  return {
    inTextObject: false,
    fontResourceName: null,
    fontSizePt: null,
    textMatrix: null,
    placementSafe: true,
    styleSafe: true,
  };
}

function readNumericMatrix(
  operands: readonly ExistingTextContentToken[],
): ExistingTextTransform | null {
  if (operands.length < 6) {
    return null;
  }
  const tail =
    operands.slice(-6);
  if (
    tail.some(
      (token) =>
        token.kind !== 'number'
        || !Number.isFinite(
          token.numberValue,
        ),
    )
  ) {
    return null;
  }

  return tail.map(
    (token) =>
      token.numberValue
      ?? Number.NaN,
  ) as unknown as ExistingTextTransform;
}

function isIdentityMatrix(
  matrix:
    ExistingTextTransform,
): boolean {
  return (
    nearlyEqual(matrix[0], 1)
    && nearlyEqual(matrix[1], 0)
    && nearlyEqual(matrix[2], 0)
    && nearlyEqual(matrix[3], 1)
    && nearlyEqual(matrix[4], 0)
    && nearlyEqual(matrix[5], 0)
  );
}

function isSimpleTextMatrix(
  matrix:
    ExistingTextTransform,
): boolean {
  return (
    nearlyEqual(matrix[0], 1)
    && nearlyEqual(matrix[1], 0)
    && nearlyEqual(matrix[2], 0)
    && nearlyEqual(matrix[3], 1)
    && Number.isFinite(
      matrix[4],
    )
    && Number.isFinite(
      matrix[5],
    )
  );
}

function nearlyEqual(
  left: number,
  right: number,
): boolean {
  return Math.abs(
    left - right,
  ) <= SIMPLE_MATRIX_TOLERANCE;
}

export function lexExistingTextContentStream(
  source: string,
): {
  complete: boolean;
  tokens: ExistingTextContentToken[];
  diagnostics: string[];
} {
  const tokens: ExistingTextContentToken[] = [];
  const diagnostics: string[] = [];
  let cursor = 0;

  while (
    cursor < source.length
  ) {
    const code =
      source.charCodeAt(cursor);
    if (isWhitespace(code)) {
      cursor += 1;
      continue;
    }

    if (source[cursor] === '%') {
      cursor += 1;
      while (
        cursor < source.length
        && source[cursor] !== '\n'
        && source[cursor] !== '\r'
      ) {
        cursor += 1;
      }
      continue;
    }

    if (source[cursor] === '(') {
      const parsed =
        readLiteralString(
          source,
          cursor,
        );
      if (!parsed) {
        diagnostics.push(
          `Malformed literal string at byte ${cursor}.`,
        );
        break;
      }
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    if (
      source[cursor] === '<'
      && source[cursor + 1]
        !== '<'
    ) {
      const parsed =
        readHexString(
          source,
          cursor,
        );
      if (!parsed) {
        diagnostics.push(
          `Malformed hex string at byte ${cursor}.`,
        );
        break;
      }
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    if (
      source[cursor] === '<'
      && source[cursor + 1]
        === '<'
    ) {
      tokens.push({
        kind: 'structural',
        rawStart: cursor,
        rawEnd: cursor + 2,
        raw: '<<',
      });
      cursor += 2;
      continue;
    }

    if (
      source[cursor] === '>'
      && source[cursor + 1]
        === '>'
    ) {
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
      source[cursor] === '['
      || source[cursor] === ']'
      || source[cursor] === '{'
      || source[cursor] === '}'
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
      const parsed =
        readName(
          source,
          cursor,
        );
      tokens.push(parsed.token);
      cursor = parsed.next;
      continue;
    }

    const parsed =
      readBareToken(
        source,
        cursor,
      );
    if (!parsed) {
      diagnostics.push(
        `Unable to tokenize content stream at byte ${cursor}.`,
      );
      break;
    }
    tokens.push(parsed.token);
    cursor = parsed.next;
  }

  return {
    complete:
      diagnostics.length === 0,
    tokens,
    diagnostics,
  };
}

function readLiteralString(
  source: string,
  start: number,
): {
  token: ExistingTextContentToken;
  next: number;
} | null {
  const bytes: number[] = [];
  let depth = 1;
  let cursor = start + 1;

  while (
    cursor < source.length
  ) {
    const character =
      source[cursor];

    if (character === '\\') {
      cursor += 1;
      if (
        cursor >= source.length
      ) {
        return null;
      }

      const escaped =
        source[cursor];
      if (
        escaped === '\n'
        || escaped === '\r'
      ) {
        if (
          escaped === '\r'
          && source[cursor + 1]
            === '\n'
        ) {
          cursor += 1;
        }
        cursor += 1;
        continue;
      }

      const escapeMap:
        Record<string, number> = {
          n: 0x0a,
          r: 0x0d,
          t: 0x09,
          b: 0x08,
          f: 0x0c,
          '(': 0x28,
          ')': 0x29,
          '\\': 0x5c,
        };
      if (
        escaped in escapeMap
      ) {
        bytes.push(
          escapeMap[escaped],
        );
        cursor += 1;
        continue;
      }

      if (
        /[0-7]/.test(
          escaped,
        )
      ) {
        let octal = escaped;
        let count = 1;
        while (
          count < 3
          && /[0-7]/.test(
            source[
              cursor + count
            ] ?? '',
          )
        ) {
          octal +=
            source[
              cursor + count
            ];
          count += 1;
        }
        bytes.push(
          parseInt(octal, 8)
          & 0xff,
        );
        cursor += count;
        continue;
      }

      bytes.push(
        escaped.charCodeAt(0)
        & 0xff,
      );
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
        const decodedText =
          asciiTextOrNull(
            bytes,
          );
        return {
          token: {
            kind:
              'literal-string',
            rawStart: start,
            rawEnd: cursor + 1,
            raw: source.slice(
              start,
              cursor + 1,
            ),
            ...(decodedText
              !== null
              ? {
                  decodedText,
                  encoding: 'ascii-literal' as const,
                }
              : {}),
          },
          next: cursor + 1,
        };
      }
      bytes.push(0x29);
      cursor += 1;
      continue;
    }

    bytes.push(
      character.charCodeAt(0)
      & 0xff,
    );
    cursor += 1;
  }

  return null;
}

function readHexString(
  source: string,
  start: number,
): {
  token: ExistingTextContentToken;
  next: number;
} | null {
  let cursor = start + 1;
  let hex = '';

  while (
    cursor < source.length
    && source[cursor] !== '>'
  ) {
    const character =
      source[cursor];
    if (
      !isWhitespace(
        character.charCodeAt(0),
      )
    ) {
      if (
        !/[0-9a-fA-F]/.test(
          character,
        )
      ) {
        return null;
      }
      hex += character;
    }
    cursor += 1;
  }

  if (
    cursor >= source.length
  ) {
    return null;
  }

  if (hex.length % 2 === 1) {
    hex += '0';
  }

  const bytes: number[] = [];
  for (
    let index = 0;
    index < hex.length;
    index += 2
  ) {
    bytes.push(
      parseInt(
        hex.slice(
          index,
          index + 2,
        ),
        16,
      ),
    );
  }

  const decodedText =
    asciiTextOrNull(bytes);

  return {
    token: {
      kind: 'hex-string',
      rawStart: start,
      rawEnd: cursor + 1,
      raw: source.slice(
        start,
        cursor + 1,
      ),
      ...(decodedText !== null
        ? {
            decodedText,
            encoding: 'ascii-hex' as const,
          }
        : {}),
    },
    next: cursor + 1,
  };
}

function readName(
  source: string,
  start: number,
): {
  token: ExistingTextContentToken;
  next: number;
} {
  let cursor = start + 1;
  while (
    cursor < source.length
    && !isDelimiter(
      source.charCodeAt(
        cursor,
      ),
    )
  ) {
    cursor += 1;
  }

  const raw =
    source.slice(
      start,
      cursor,
    );
  return {
    token: {
      kind: 'name',
      rawStart: start,
      rawEnd: cursor,
      raw,
      nameValue:
        decodePdfName(
          raw.slice(1),
        ),
    },
    next: cursor,
  };
}

function readBareToken(
  source: string,
  start: number,
): {
  token: ExistingTextContentToken;
  next: number;
} | null {
  let cursor = start;
  while (
    cursor < source.length
    && !isDelimiter(
      source.charCodeAt(
        cursor,
      ),
    )
  ) {
    cursor += 1;
  }
  if (cursor === start) {
    return null;
  }

  const raw =
    source.slice(
      start,
      cursor,
    );
  const numberValue =
    parsePdfNumber(raw);

  return {
    token:
      numberValue !== null
        ? {
            kind: 'number',
            rawStart: start,
            rawEnd: cursor,
            raw,
            numberValue,
          }
        : {
            kind: 'word',
            rawStart: start,
            rawEnd: cursor,
            raw,
          },
    next: cursor,
  };
}

function parsePdfNumber(
  raw: string,
): number | null {
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(
      raw,
    )
  ) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value)
    ? value
    : null;
}

function asciiTextOrNull(
  bytes: readonly number[],
): string | null {
  if (
    bytes.some(
      (byte) =>
        byte < 0x20
        || byte > 0x7e,
    )
  ) {
    return null;
  }
  return String.fromCharCode(
    ...bytes,
  );
}

function decodePdfName(
  raw: string,
): string {
  return raw.replace(
    /#([0-9a-fA-F]{2})/g,
    (_match, hex: string) =>
      String.fromCharCode(
        parseInt(hex, 16),
      ),
  );
}

function isWhitespace(
  code: number,
): boolean {
  return (
    code === 0x00
    || code === 0x09
    || code === 0x0a
    || code === 0x0c
    || code === 0x0d
    || code === 0x20
  );
}

function isDelimiter(
  code: number,
): boolean {
  return (
    isWhitespace(code)
    || code === 0x28
    || code === 0x29
    || code === 0x3c
    || code === 0x3e
    || code === 0x5b
    || code === 0x5d
    || code === 0x7b
    || code === 0x7d
    || code === 0x2f
    || code === 0x25
  );
}

export function existingTextBytesToLatin1(
  bytes: Uint8Array,
): string {
  let output = '';
  const chunkSize = 0x8000;
  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    output += String.fromCharCode(
      ...bytes.subarray(
        offset,
        Math.min(
          bytes.length,
          offset + chunkSize,
        ),
      ),
    );
  }
  return output;
}
