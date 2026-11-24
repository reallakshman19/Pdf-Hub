/**
 * Page-space text-show walker for existing-text provenance (ISO 32000-1
 * §8.4 graphics state, §9.3 text state, §9.4 text objects/operators).
 *
 * PDF.js reports every text item in page user space: its transform is the
 * text rendering matrix Trm = [Tfs*Th 0 0 Tfs 0 Trise] × Tm × CTM. To compare
 * a span with a content-stream operator, this walker replays the graphics and
 * text state of the whole page and emits each Tj / TJ with the same page-space
 * numbers. Advances after a show are tracked from font widths; when widths are
 * unknown the text matrix becomes unknown until the next Tm / Td / TD / T*.
 */

import {
  multiplyTransforms,
  readNumericMatrix,
  type PdfContentOperand,
  type PdfContentOperation,
  type PdfContentStreamAST,
  type PdfContentTransform,
} from '@/core/pdf-content-stream';
import {
  decodeExistingTextString,
  existingTextCodeWidth,
  type ExistingTextFontDecoder,
  type ExistingTextFontDecoders,
} from './fontDecoding';
import type {
  ExistingTextSimpleStringEncoding,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';

const IDENTITY: PdfContentTransform = [1, 0, 0, 1, 0, 0];

export interface ExistingTextPageSpaceCandidate {
  provenance: ExistingTextSimpleTextOperator;
  /** Text decoded through the font (or printable ASCII when no decoder is known). */
  text: string;
  /** Text rendering matrix in page user space (comparable to the PDF.js item transform). */
  renderMatrix: PdfContentTransform;
}

interface GraphicsTextState {
  ctm: PdfContentTransform;
  ctmKnown: boolean;
  fontResourceName: string | null;
  fontSize: number | null;
  charSpacing: number;
  wordSpacing: number;
  horizontalScale: number;
  leading: number;
  rise: number;
}

interface StringPiece {
  kind: 'string';
  operand: PdfContentOperand & { bytes: Uint8Array };
}

interface AdjustPiece {
  kind: 'adjust';
  value: number;
}

type ShowPiece = StringPiece | AdjustPiece;

export function walkExistingTextPageSpaceShows(
  ast: PdfContentStreamAST,
  streamRefs: ReadonlyMap<number, string | null>,
  fontDecoders?: ExistingTextFontDecoders,
): ExistingTextPageSpaceCandidate[] {
  const candidates: ExistingTextPageSpaceCandidate[] = [];
  const stack: GraphicsTextState[] = [];
  let state: GraphicsTextState = {
    ctm: [...IDENTITY],
    ctmKnown: true,
    fontResourceName: null,
    fontSize: null,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 1,
    leading: 0,
    rise: 0,
  };
  let inText = false;
  let tm: PdfContentTransform = [...IDENTITY];
  let tlm: PdfContentTransform = [...IDENTITY];
  let tmKnown = true;
  const opIndexByStream = new Map<number, number>();

  const moveLine = (tx: number, ty: number) => {
    tlm = multiplyTransforms([1, 0, 0, 1, tx, ty], tlm);
    tm = [...tlm];
    tmKnown = true;
  };

  for (const op of ast.operations) {
    const operatorIndex = (opIndexByStream.get(op.streamIndex) ?? 0) + 1;
    opIndexByStream.set(op.streamIndex, operatorIndex);
    const nums = numericOperands(op.operands);

    switch (op.operator) {
      case 'q':
        stack.push({ ...state, ctm: [...state.ctm] });
        break;
      case 'Q': {
        const restored = stack.pop();
        state = restored ?? { ...state, ctmKnown: false };
        break;
      }
      case 'cm': {
        const matrix = readNumericMatrix(op.operands);
        if (matrix && op.operands.length === 6) {
          state.ctm = multiplyTransforms(matrix, state.ctm);
        } else {
          state.ctmKnown = false;
        }
        break;
      }
      case 'BT':
        inText = true;
        tm = [...IDENTITY];
        tlm = [...IDENTITY];
        tmKnown = true;
        break;
      case 'ET':
        inText = false;
        break;
      case 'Tf': {
        const name = op.operands[op.operands.length - 2];
        const size = op.operands[op.operands.length - 1];
        if (op.operands.length === 2 && name?.kind === 'name' && size?.kind === 'number') {
          state.fontResourceName = name.name.replace(/^\//, '');
          state.fontSize = size.value;
        } else {
          state.fontResourceName = null;
          state.fontSize = null;
        }
        break;
      }
      case 'Tc':
        if (nums?.length === 1) state.charSpacing = nums[0];
        else tmKnown = false;
        break;
      case 'Tw':
        if (nums?.length === 1) state.wordSpacing = nums[0];
        else tmKnown = false;
        break;
      case 'Tz':
        if (nums?.length === 1) state.horizontalScale = nums[0] / 100;
        else tmKnown = false;
        break;
      case 'TL':
        if (nums?.length === 1) state.leading = nums[0];
        else tmKnown = false;
        break;
      case 'Ts':
        if (nums?.length === 1) state.rise = nums[0];
        else tmKnown = false;
        break;
      case 'Tm': {
        const matrix = readNumericMatrix(op.operands);
        if (matrix && op.operands.length === 6) {
          tm = matrix;
          tlm = [...matrix];
          tmKnown = true;
        } else {
          tmKnown = false;
        }
        break;
      }
      case 'Td':
      case 'TD':
        if (nums?.length === 2) {
          if (op.operator === 'TD') state.leading = -nums[1];
          moveLine(nums[0], nums[1]);
        } else {
          tmKnown = false;
        }
        break;
      case 'T*':
        moveLine(0, -state.leading);
        break;
      case "'":
      case '"': {
        if (op.operator === '"') {
          if (nums === null && op.operands.length === 3) {
            const [aw, ac] = op.operands;
            if (aw.kind === 'number' && ac.kind === 'number') {
              state.wordSpacing = aw.value;
              state.charSpacing = ac.value;
            }
          }
        }
        moveLine(0, -state.leading);
        const operand = op.operands[op.operands.length - 1];
        const pieces = operand && isStringOperand(operand)
          ? [{ kind: 'string', operand } as StringPiece]
          : null;
        advanceAfterShow(pieces);
        break;
      }
      case 'Tj':
      case 'TJ': {
        const pieces = readShowPieces(op);
        if (inText && pieces) {
          const candidate = buildCandidate(op, operatorIndex, pieces);
          if (candidate) candidates.push(candidate);
        }
        advanceAfterShow(pieces);
        break;
      }
      default:
        break;
    }
  }

  return candidates;

  function decoderFor(fontName: string): ExistingTextFontDecoder | null {
    return fontDecoders?.[fontName] ?? null;
  }

  function decodePieces(
    pieces: readonly ShowPiece[],
  ): { text: string; advance: number | null } | null {
    const fontName = state.fontResourceName;
    const fontSize = state.fontSize;
    if (!fontName || fontSize === null) return null;
    const decoder = decoderFor(fontName);
    let text = '';
    let advance: number | null = 0;
    for (const piece of pieces) {
      if (piece.kind === 'adjust') {
        if (advance !== null) {
          advance -= (piece.value / 1000) * fontSize * state.horizontalScale;
        }
        continue;
      }
      if (decoder) {
        const decoded = decodeExistingTextString(piece.operand.bytes, decoder);
        if (!decoded) return null;
        text += decoded.text;
        for (const code of decoded.codes) {
          const width = existingTextCodeWidth(decoder, code);
          if (width === null || advance === null) {
            advance = null;
            continue;
          }
          const wordSpace = decoder.codeBytes === 1 && code === 0x20 ? state.wordSpacing : 0;
          advance += (width * fontSize + state.charSpacing + wordSpace) * state.horizontalScale;
        }
      } else {
        const bytes = piece.operand.bytes;
        if (!bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) return null;
        text += String.fromCharCode(...bytes);
        advance = null;
      }
    }
    return { text, advance };
  }

  function advanceAfterShow(pieces: readonly ShowPiece[] | null): void {
    if (!pieces) {
      tmKnown = false;
      return;
    }
    const decoded = decodePieces(pieces);
    if (!decoded || decoded.advance === null || !Number.isFinite(decoded.advance)) {
      tmKnown = false;
      return;
    }
    tm = multiplyTransforms([1, 0, 0, 1, decoded.advance, 0], tm);
  }

  function buildCandidate(
    op: PdfContentOperation,
    operatorIndex: number,
    pieces: readonly ShowPiece[],
  ): ExistingTextPageSpaceCandidate | null {
    const fontName = state.fontResourceName;
    const fontSize = state.fontSize;
    if (!tmKnown || !state.ctmKnown || !fontName || !fontSize || fontSize <= 0) return null;
    const strings = pieces.filter((piece): piece is StringPiece => piece.kind === 'string');
    if (strings.length === 0) return null;
    const decoded = decodePieces(pieces);
    if (!decoded || decoded.text.length === 0) return null;

    // Adjustments before the first string move the first glyph (as PDF.js reports it).
    let leadingAdjust = 0;
    for (const piece of pieces) {
      if (piece.kind === 'string') break;
      leadingAdjust -= (piece.value / 1000) * fontSize * state.horizontalScale;
    }
    const glyphTm = multiplyTransforms([1, 0, 0, 1, leadingAdjust, 0], tm);
    const pageMatrix = multiplyTransforms(glyphTm, state.ctm);
    const renderMatrix = multiplyTransforms(
      [fontSize * state.horizontalScale, 0, 0, fontSize, 0, state.rise],
      pageMatrix,
    );
    if (!renderMatrix.every(Number.isFinite)) return null;

    const verticalScale = Math.hypot(pageMatrix[2], pageMatrix[3]);
    const horizontalScale = Math.hypot(pageMatrix[0], pageMatrix[1]) * state.horizontalScale;
    const first = strings[0].operand;
    const last = strings[strings.length - 1].operand;
    const operandRange = {
      start: first.rawStart ?? -1,
      end: last.rawEnd ?? -1,
    };
    if (operandRange.start < 0 || operandRange.end <= operandRange.start) return null;

    const encoding: ExistingTextSimpleStringEncoding =
      first.kind === 'hex-string' ? 'ascii-hex' : 'ascii-literal';
    const decoder = decoderFor(fontName);
    const wordSpacingApplies = !decoder || decoder.codeBytes === 1;
    const base = {
      streamIndex: op.streamIndex,
      streamRef: streamRefs.get(op.streamIndex) ?? null,
      operatorIndex,
      operatorRange: {
        start: (op.rawEnd ?? 0) - op.operator.length,
        end: op.rawEnd ?? 0,
      },
      operandRange,
      decodedText: decoded.text,
      encoding,
      fontResourceName: fontName,
      fontSizePt: fontSize * verticalScale,
      textMatrix: pageMatrix,
      spacingPt: {
        char: state.charSpacing * horizontalScale,
        word: wordSpacingApplies ? state.wordSpacing * horizontalScale : 0,
      },
    };

    if (op.operator === 'Tj') {
      return {
        provenance: { ...base, operator: 'Tj' },
        text: decoded.text,
        renderMatrix,
      };
    }
    const array = op.operands[0];
    if (array?.kind !== 'array' || array.rawStart === undefined || array.rawEnd === undefined) {
      return null;
    }
    return {
      provenance: {
        ...base,
        operator: 'TJ',
        arrayRange: { start: array.rawStart, end: array.rawEnd },
      },
      text: decoded.text,
      renderMatrix,
    };
  }
}

function readShowPieces(op: PdfContentOperation): ShowPiece[] | null {
  if (op.operands.length !== 1) return null;
  const operand = op.operands[0];
  if (op.operator === 'Tj') {
    return isStringOperand(operand) ? [{ kind: 'string', operand }] : null;
  }
  if (operand.kind !== 'array') return null;
  const pieces: ShowPiece[] = [];
  for (const item of operand.items) {
    if (isStringOperand(item)) {
      pieces.push({ kind: 'string', operand: item });
    } else if (item.kind === 'number' && Number.isFinite(item.value)) {
      pieces.push({ kind: 'adjust', value: item.value });
    } else {
      return null;
    }
  }
  return pieces;
}

function isStringOperand(
  operand: PdfContentOperand,
): operand is PdfContentOperand & { bytes: Uint8Array } {
  return operand.kind === 'literal-string' || operand.kind === 'hex-string';
}

function numericOperands(operands: readonly PdfContentOperand[]): number[] | null {
  if (operands.length === 0 || operands.some((operand) => operand.kind !== 'number')) {
    return null;
  }
  return operands.map((operand) => (operand as { value: number }).value);
}
