/**
 * PDF Content Stream AST Parser (ISO 32000-1 §7.2, §7.8, §8.4).
 * Parses tokens from single or multi-stream page contents into a semantic AST.
 */

import {
  bytesToLatin1,
  lexContentStream,
  type ContentToken,
} from './lexer';
import type {
  ContentStreamScanDiagnostic,
  DecodedPageContentStreamInput,
  PdfContentNode,
  PdfContentOperand,
  PdfContentOperation,
  PdfContentStreamAST,
  PdfContentTransform,
  PdfGraphicsBlockNode,
  PdfTextObjectNode,
} from './types';

interface GraphicsState {
  ctm: PdfContentTransform;
  transformSafe: boolean;
}

interface InternalTextState {
  inTextObject: boolean;
  fontResourceName: string | null;
  fontSizePt: number | null;
  textMatrix: PdfContentTransform;
  textLineMatrix: PdfContentTransform;
  textLeadingPt: number | null;
  placementSafe: boolean;
  styleSafe: boolean;
  currentTextNode: PdfTextObjectNode | null;
}

const IDENTITY_TRANSFORM: PdfContentTransform = [1, 0, 0, 1, 0, 0];
const TOLERANCE = 1e-6;

export function parsePageContentStreams(
  streams: readonly DecodedPageContentStreamInput[],
): PdfContentStreamAST {
  const operations: PdfContentOperation[] = [];
  const structuredNodes: PdfContentNode[] = [];
  const textObjects: PdfTextObjectNode[] = [];
  const diagnostics: ContentStreamScanDiagnostic[] = [];

  const graphicsStack: GraphicsState[] = [];
  let currentGraphics: GraphicsState = {
    ctm: [...IDENTITY_TRANSFORM],
    transformSafe: true,
  };

  const graphicsBlockStack: PdfGraphicsBlockNode[] = [];

  let textState: InternalTextState = initialTextState();

  let globalOpIndex = 0;
  const operandTokens: ContentToken[] = [];

  for (let streamIdx = 0; streamIdx < streams.length; streamIdx++) {
    const stream = streams[streamIdx];
    const source = bytesToLatin1(stream.decodedBytes);
    const lex = lexContentStream(source);

    if (!lex.complete) {
      diagnostics.push(
        ...lex.diagnostics.map((msg) => ({
          code: 'LEX_ERROR',
          message: `Stream ${stream.streamIndex}: ${msg}`,
          streamIndex: stream.streamIndex,
          streamRef: stream.streamRef,
        })),
      );
      continue;
    }

    let tokenIndex = 0;

    while (tokenIndex < lex.tokens.length) {
      const token = lex.tokens[tokenIndex];

      // Handle Array operand [...]
      if (token.kind === 'structural' && token.raw === '[') {
        const parsedArray = parseArrayOperand(lex.tokens, tokenIndex);
        if (parsedArray) {
          operandTokens.push(parsedArray.token);
          tokenIndex = parsedArray.next;
          continue;
        }
      }

      // Handle Dict operand << ... >>
      if (token.kind === 'structural' && token.raw === '<<') {
        const parsedDict = parseDictOperand(lex.tokens, tokenIndex);
        if (parsedDict) {
          operandTokens.push(parsedDict.token);
          tokenIndex = parsedDict.next;
          continue;
        }
      }

      // If token is not an operator word, queue as operand
      if (token.kind !== 'word') {
        operandTokens.push(token);
        tokenIndex += 1;
        continue;
      }

      // It is an operator word!
      const operator = token.raw;
      globalOpIndex += 1;

      const operands: PdfContentOperand[] = operandTokens.map(toPdfContentOperand);
      operandTokens.length = 0;

      const opStart = operands.length > 0 ? (operands[0] as unknown as { rawStart?: number }).rawStart ?? token.rawStart : token.rawStart;
      const opEnd = token.rawEnd;

      const operation: PdfContentOperation = {
        type: 'operation',
        id: `op_s${stream.streamIndex}_${globalOpIndex}`,
        operator,
        operands,
        streamIndex: stream.streamIndex,
        streamRef: stream.streamRef,
        rawStart: opStart,
        rawEnd: opEnd,
      };

      operations.push(operation);

      // Process operator state
      switch (operator) {
        case 'q': {
          graphicsStack.push({
            ctm: [...currentGraphics.ctm],
            transformSafe: currentGraphics.transformSafe,
          });
          const blockNode: PdfGraphicsBlockNode = {
            type: 'graphics-block',
            id: `gb_${operation.id}`,
            streamIndex: stream.streamIndex,
            streamRef: stream.streamRef,
            ctm: [...currentGraphics.ctm],
            children: [],
          };
          if (graphicsBlockStack.length > 0) {
            graphicsBlockStack[graphicsBlockStack.length - 1].children.push(blockNode);
          } else if (textState.currentTextNode) {
            textState.currentTextNode.operations.push(operation);
          } else {
            structuredNodes.push(blockNode);
          }
          graphicsBlockStack.push(blockNode);
          break;
        }

        case 'Q': {
          const restored = graphicsStack.pop();
          if (!restored) {
            diagnostics.push({
              code: 'Q_UNDERFLOW',
              message: `Stream ${stream.streamIndex}: Graphics-state restore Q has no matching q.`,
              streamIndex: stream.streamIndex,
              streamRef: stream.streamRef,
              byteOffset: token.rawStart,
            });
            currentGraphics = {
              ctm: [...IDENTITY_TRANSFORM],
              transformSafe: false,
            };
          } else {
            currentGraphics = restored;
          }
          if (graphicsBlockStack.length > 0) {
            graphicsBlockStack.pop();
          } else if (textState.currentTextNode) {
            textState.currentTextNode.operations.push(operation);
          } else {
            structuredNodes.push(operation);
          }
          break;
        }

        case 'cm': {
          const matrix = readNumericMatrix(operands);
          if (matrix) {
            currentGraphics.ctm = multiplyTransforms(currentGraphics.ctm, matrix);
            if (!isIdentityTransform(matrix)) {
              currentGraphics.transformSafe = false;
            }
          } else {
            currentGraphics.transformSafe = false;
          }
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
        }

        case 'BT': {
          textState = initialTextState();
          textState.inTextObject = true;
          const textNode: PdfTextObjectNode = {
            type: 'text-object',
            id: `to_${operation.id}`,
            streamIndex: stream.streamIndex,
            streamRef: stream.streamRef,
            fontResourceName: null,
            fontSizePt: null,
            textMatrix: [...IDENTITY_TRANSFORM],
            textLineMatrix: [...IDENTITY_TRANSFORM],
            operations: [operation],
          };
          textState.currentTextNode = textNode;
          textObjects.push(textNode);
          if (graphicsBlockStack.length > 0) {
            graphicsBlockStack[graphicsBlockStack.length - 1].children.push(textNode);
          } else {
            structuredNodes.push(textNode);
          }
          break;
        }

        case 'ET': {
          if (textState.currentTextNode) {
            textState.currentTextNode.operations.push(operation);
          } else {
            routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          }
          textState.inTextObject = false;
          textState.currentTextNode = null;
          break;
        }

        case 'Tf': {
          if (textState.inTextObject && operands.length >= 2) {
            const fontOp = operands[operands.length - 2];
            const sizeOp = operands[operands.length - 1];
            if (
              fontOp.kind === 'name' &&
              sizeOp.kind === 'number' &&
              sizeOp.value > 0
            ) {
              textState.fontResourceName = fontOp.name;
              textState.fontSizePt = sizeOp.value;
              if (textState.currentTextNode) {
                textState.currentTextNode.fontResourceName = fontOp.name;
                textState.currentTextNode.fontSizePt = sizeOp.value;
                textState.currentTextNode.fontResource = fontOp.name;
                textState.currentTextNode.fontSize = sizeOp.value;
              }
            } else {
              textState.styleSafe = false;
            }
          }
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
        }

        case 'Tm': {
          const matrix = readNumericMatrix(operands);
          if (matrix && textState.inTextObject) {
            textState.textMatrix = matrix;
            textState.textLineMatrix = matrix;
            textState.placementSafe = isSimpleTextMatrix(matrix);
            if (textState.currentTextNode) {
              textState.currentTextNode.textMatrix = matrix;
              textState.currentTextNode.textLineMatrix = matrix;
            }
          } else if (textState.inTextObject) {
            textState.placementSafe = false;
          }
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
        }

        case 'Td':
        case 'TD': {
          if (textState.inTextObject && operands.length >= 2) {
            const txOp = operands[operands.length - 2];
            const tyOp = operands[operands.length - 1];
            if (txOp.kind === 'number' && tyOp.kind === 'number') {
              applyLineTranslation(txOp.value, tyOp.value, textState);
              if (operator === 'TD') {
                textState.textLeadingPt = -tyOp.value;
              }
            }
          }
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
        }

        case 'T*': {
          if (textState.inTextObject && textState.textLeadingPt !== null) {
            applyLineTranslation(0, -textState.textLeadingPt, textState);
          }
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
        }

        default:
          routeOperationToTree(operation, graphicsBlockStack, textState, structuredNodes);
          break;
      }

      tokenIndex += 1;
    }
  }

  // Multi-stream & Page-boundary checks (ISO 32000-1 §8.4.1)
  const fatalDiagnostics = diagnostics.filter((d) => d.code === 'Q_UNDERFLOW' || d.code === 'LEX_ERROR');

  if (graphicsStack.length > 0) {
    // Page boundary teardown per §8.4.1: discard remaining q frames at page end
    diagnostics.push({
      code: 'PAGE_BOUNDARY_UNCLOSED_Q',
      message: `Page content stream sequence ended with ${graphicsStack.length} unclosed q state(s); discarded per ISO 32000-1 §8.4.1.`,
      streamIndex: streams.length > 0 ? streams[streams.length - 1].streamIndex : 0,
    });
  }

  if (textState.inTextObject) {
    diagnostics.push({
      code: 'UNTERMINATED_TEXT_OBJECT',
      message: 'Unterminated BT/ET text object at page boundary.',
      streamIndex: streams.length > 0 ? streams[streams.length - 1].streamIndex : 0,
    });
  }

  return {
    complete: fatalDiagnostics.length === 0 && !textState.inTextObject,
    operations,
    structuredNodes,
    textObjects,
    diagnostics,
    streamCount: streams.length,
  };
}

function routeOperationToTree(
  operation: PdfContentOperation,
  graphicsBlockStack: PdfGraphicsBlockNode[],
  textState: InternalTextState,
  structuredNodes: PdfContentNode[],
): void {
  if (textState.currentTextNode) {
    textState.currentTextNode.operations.push(operation);
  } else if (graphicsBlockStack.length > 0) {
    graphicsBlockStack[graphicsBlockStack.length - 1].children.push(operation);
  } else {
    structuredNodes.push(operation);
  }
}

function initialTextState(): InternalTextState {
  return {
    inTextObject: false,
    fontResourceName: null,
    fontSizePt: null,
    textMatrix: [...IDENTITY_TRANSFORM],
    textLineMatrix: [...IDENTITY_TRANSFORM],
    textLeadingPt: null,
    placementSafe: true,
    styleSafe: true,
    currentTextNode: null,
  };
}

function applyLineTranslation(
  tx: number,
  ty: number,
  text: InternalTextState,
): void {
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
    text.placementSafe = false;
    return;
  }
  const [a, b, c, d, e, f] = text.textLineMatrix;
  const newLineMatrix: PdfContentTransform = [a, b, c, d, e + tx, f + ty];
  text.textLineMatrix = newLineMatrix;
  text.textMatrix = newLineMatrix;
  text.placementSafe = isSimpleTextMatrix(newLineMatrix);
  if (text.currentTextNode) {
    text.currentTextNode.textMatrix = newLineMatrix;
    text.currentTextNode.textLineMatrix = newLineMatrix;
  }
}

export function readNumericMatrix(
  operands: readonly PdfContentOperand[],
): PdfContentTransform | null {
  if (operands.length < 6) {
    return null;
  }
  const slice = operands.slice(-6);
  if (slice.some((op) => op.kind !== 'number')) {
    return null;
  }
  return [
    (slice[0] as { value: number }).value,
    (slice[1] as { value: number }).value,
    (slice[2] as { value: number }).value,
    (slice[3] as { value: number }).value,
    (slice[4] as { value: number }).value,
    (slice[5] as { value: number }).value,
  ];
}

export function multiplyTransforms(
  left: PdfContentTransform,
  right: PdfContentTransform,
): PdfContentTransform {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export function isIdentityTransform(transform: PdfContentTransform): boolean {
  return (
    Math.abs(transform[0] - 1) <= TOLERANCE &&
    Math.abs(transform[1]) <= TOLERANCE &&
    Math.abs(transform[2]) <= TOLERANCE &&
    Math.abs(transform[3] - 1) <= TOLERANCE &&
    Math.abs(transform[4]) <= TOLERANCE &&
    Math.abs(transform[5]) <= TOLERANCE
  );
}

export function isSimpleTextMatrix(matrix: PdfContentTransform): boolean {
  const [a, b, c, d, tx, ty] = matrix;
  // Admits uniform positive scaling (a === d > 0) with zero rotation/shear (b === 0, c === 0)
  return (
    a > 0 &&
    Math.abs(a - d) <= TOLERANCE &&
    Math.abs(b) <= TOLERANCE &&
    Math.abs(c) <= TOLERANCE &&
    Number.isFinite(tx) &&
    Number.isFinite(ty)
  );
}

function parseArrayOperand(
  tokens: readonly ContentToken[],
  start: number,
): { token: ContentToken; next: number } | null {
  let cursor = start + 1;
  const items: PdfContentOperand[] = [];

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token.kind === 'structural' && token.raw === ']') {
      return {
        token: {
          kind: 'structural',
          rawStart: tokens[start].rawStart,
          rawEnd: token.rawEnd,
          raw: '',
          arrayItems: items,
        },
        next: cursor + 1,
      };
    }
    if (token.kind === 'structural' && token.raw === '[') {
      const nested = parseArrayOperand(tokens, cursor);
      if (!nested) {
        return null;
      }
      items.push({
        kind: 'array',
        items: (nested.token.arrayItems as PdfContentOperand[]) ?? [],
      });
      cursor = nested.next;
      continue;
    }
    items.push(toPdfContentOperand(token));
    cursor += 1;
  }
  return null;
}

function parseDictOperand(
  tokens: readonly ContentToken[],
  start: number,
): { token: ContentToken; next: number } | null {
  let cursor = start + 1;
  const entries: Record<string, PdfContentOperand> = {};

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token.kind === 'structural' && token.raw === '>>') {
      return {
        token: {
          kind: 'structural',
          rawStart: tokens[start].rawStart,
          rawEnd: token.rawEnd,
          raw: '',
          dictEntries: entries,
        },
        next: cursor + 1,
      };
    }
    if (token.kind === 'name' && token.nameValue) {
      const key = token.nameValue;
      cursor += 1;
      if (cursor < tokens.length) {
        const valToken = tokens[cursor];
        if (valToken.kind === 'structural' && valToken.raw === '[') {
          const parsedArray = parseArrayOperand(tokens, cursor);
          if (parsedArray) {
            entries[key] = {
              kind: 'array',
              items: (parsedArray.token.arrayItems as PdfContentOperand[]) ?? [],
            };
            cursor = parsedArray.next;
            continue;
          }
        }
        entries[key] = toPdfContentOperand(valToken);
      }
    }
    cursor += 1;
  }
  return null;
}

function toPdfContentOperand(token: ContentToken): PdfContentOperand {
  switch (token.kind) {
    case 'number':
      return {
        kind: 'number',
        value: token.numberValue ?? 0,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'name':
      return {
        kind: 'name',
        name: token.nameValue ?? token.raw.slice(1),
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'literal-string':
      return {
        kind: 'literal-string',
        bytes: token.stringBytes ?? new Uint8Array(),
        decodedText: token.decodedText,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'hex-string':
      return {
        kind: 'hex-string',
        bytes: token.stringBytes ?? new Uint8Array(),
        hex: token.raw.replace(/[^0-9a-fA-F]/g, ''),
        decodedText: token.decodedText,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'boolean':
      return {
        kind: 'boolean',
        value: token.booleanValue ?? false,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'inline-image-data':
      return {
        kind: 'inline-image-data',
        bytes: token.stringBytes ?? new Uint8Array(),
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    case 'structural':
      if (token.arrayItems) {
        return {
          kind: 'array',
          items: token.arrayItems as PdfContentOperand[],
          rawStart: token.rawStart,
          rawEnd: token.rawEnd,
        };
      }
      if (token.dictEntries) {
        return {
          kind: 'dict',
          entries: token.dictEntries as Record<string, PdfContentOperand>,
          rawStart: token.rawStart,
          rawEnd: token.rawEnd,
        };
      }
      return {
        kind: 'name',
        name: token.raw,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
    default:
      return {
        kind: 'name',
        name: token.raw,
        raw: token.raw,
        rawStart: token.rawStart,
        rawEnd: token.rawEnd,
      };
  }
}

export function parsePdfContentStreams(
  streams: readonly DecodedPageContentStreamInput[],
): PdfContentStreamAST {
  return parsePageContentStreams(streams);
}

