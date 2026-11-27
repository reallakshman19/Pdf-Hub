import type {
  AffineMatrix2D,
  CadCubicBezier,
  CadHarvestedPageGeometry,
  CadHarvestedPath,
  CadLineSegment,
  CadPathPaintingOp,
  CadPathSubpath,
  CadRectPrimitive,
  Point2D,
} from './types';
import { IDENTITY_MATRIX, multiplyAffineMatrices, transformPoint } from './matrix';

interface VectorGraphicsState {
  ctm: AffineMatrix2D;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  dashArray: number[];
  dashPhase: number;
}

interface BuildingSubpath {
  startPoint: Point2D;
  currentPoint: Point2D;
  points: Point2D[];
  operations: CadPathSubpath['operations'];
  isClosed: boolean;
}

function initialGraphicsState(): VectorGraphicsState {
  return {
    ctm: [...IDENTITY_MATRIX] as AffineMatrix2D,
    strokeColor: '#000000',
    fillColor: '#000000',
    lineWidth: 1.0,
    dashArray: [],
    dashPhase: 0,
  };
}

function toRgbHex(r: number, g: number, b: number): string {
  const clampByte = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${clampByte(r)}${clampByte(g)}${clampByte(b)}`;
}

function cmykToRgbHex(c: number, m: number, y: number, k: number): string {
  const r = (1 - c) * (1 - k);
  const g = (1 - m) * (1 - k);
  const b = (1 - y) * (1 - k);
  return toRgbHex(r, g, b);
}

function grayToRgbHex(g: number): string {
  return toRgbHex(g, g, g);
}

function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Tokenizes a raw PDF content stream into operands (numbers/names/strings) and operators.
 */
function tokenizeContentStream(source: string): Array<{ type: 'op' | 'num' | 'other'; val: string; num?: number }> {
  const tokens: Array<{ type: 'op' | 'num' | 'other'; val: string; num?: number }> = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];

    // Skip whitespace and comments
    if (ch === '%' || ch <= ' ') {
      if (ch === '%') {
        while (i < len && source[i] !== '\r' && source[i] !== '\n') i++;
      } else {
        i++;
      }
      continue;
    }

    // Dict brackets << or >>
    if ((ch === '<' && source[i + 1] === '<') || (ch === '>' && source[i + 1] === '>')) {
      tokens.push({ type: 'other', val: source.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // PDF Names /Name
    if (ch === '/') {
      const start = i;
      i++;
      while (i < len && source[i] > ' ' && !'/%()<>[]{}'.includes(source[i])) {
        i++;
      }
      tokens.push({ type: 'other', val: source.slice(start, i) });
      continue;
    }

    // String literals (...)
    if (ch === '(') {
      let depth = 1;
      const start = i;
      i++;
      while (i < len && depth > 0) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '(') depth++;
        else if (source[i] === ')') depth--;
        i++;
      }
      tokens.push({ type: 'other', val: source.slice(start, i) });
      continue;
    }

    // Hex strings <...>
    if (ch === '<') {
      const start = i;
      while (i < len && source[i] !== '>') i++;
      if (i < len) i++;
      tokens.push({ type: 'other', val: source.slice(start, i) });
      continue;
    }

    // Array brackets [...] and single delimiters
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      tokens.push({ type: 'other', val: ch });
      i++;
      continue;
    }

    // Numbers or operators/names
    const start = i;
    while (i < len && source[i] > ' ' && !'/%()<>[]{}'.includes(source[i])) {
      i++;
    }
    if (start === i) {
      // Unrecognized delimiter or single byte - advance to guarantee termination
      tokens.push({ type: 'other', val: source[i] });
      i++;
      continue;
    }
    const word = source.slice(start, i);
    const parsedNum = Number(word);
    if (!Number.isNaN(parsedNum) && word.trim() !== '') {
      tokens.push({ type: 'num', val: word, num: parsedNum });
    } else {
      tokens.push({ type: 'op', val: word });
    }
  }

  return tokens;
}

export interface ParseVectorStreamOptions {
  pageNumber?: number;
  pageWidth?: number;
  pageHeight?: number;
}

/**
 * Parses raw PDF content streams into CAD vector geometry primitives (lines, curves, rectangles, and paths)
 * with complete Current Transformation Matrix (CTM) scope flattening and graphics state stack isolation.
 */
export function parseContentStreamVectors(
  contentStreamSource: string,
  options: ParseVectorStreamOptions = {},
): CadHarvestedPageGeometry {
  const pageNumber = options.pageNumber ?? 1;
  const pageWidth = options.pageWidth ?? 612;
  const pageHeight = options.pageHeight ?? 792;

  const lines: CadLineSegment[] = [];
  const beziers: CadCubicBezier[] = [];
  const rectangles: CadRectPrimitive[] = [];
  const paths: CadHarvestedPath[] = [];

  const stateStack: VectorGraphicsState[] = [];
  let gState = initialGraphicsState();

  let subpaths: BuildingSubpath[] = [];
  let currentSubpath: BuildingSubpath | null = null;

  const tokens = tokenizeContentStream(contentStreamSource);
  const numStack: number[] = [];

  let segmentCounter = 0;
  let pathCounter = 0;

  const flushPath = (paintingOp: CadPathPaintingOp) => {
    if (subpaths.length === 0 && !currentSubpath) {
      numStack.length = 0;
      return;
    }

    const allSubpaths: CadPathSubpath[] = [];
    if (currentSubpath) {
      subpaths.push(currentSubpath);
      currentSubpath = null;
    }

    for (const sub of subpaths) {
      if (sub.operations.length > 0) {
        allSubpaths.push({
          points: [...sub.points],
          isClosed: sub.isClosed,
          operations: [...sub.operations],
        });

        // Decompose subpath into distinct CadLineSegment and CadCubicBezier primitives
        let lastPt = sub.startPoint;
        for (const op of sub.operations) {
          if (op.type === 'move') {
            lastPt = op.point;
          } else if (op.type === 'line') {
            segmentCounter++;
            lines.push({
              id: `cad-line-${pageNumber}-${segmentCounter}`,
              start: { ...lastPt },
              end: { ...op.point },
              length: distance(lastPt, op.point),
              strokeColor: gState.strokeColor,
              strokeWidth: gState.lineWidth,
            });
            lastPt = op.point;
          } else if (op.type === 'curve') {
            segmentCounter++;
            beziers.push({
              id: `cad-bezier-${pageNumber}-${segmentCounter}`,
              p0: { ...lastPt },
              p1: { ...op.p1 },
              p2: { ...op.p2 },
              p3: { ...op.p3 },
              strokeColor: gState.strokeColor,
              strokeWidth: gState.lineWidth,
            });
            lastPt = op.p3;
          } else if (op.type === 'close') {
            if (distance(lastPt, sub.startPoint) > 1e-5) {
              segmentCounter++;
              lines.push({
                id: `cad-line-${pageNumber}-${segmentCounter}`,
                start: { ...lastPt },
                end: { ...sub.startPoint },
                length: distance(lastPt, sub.startPoint),
                strokeColor: gState.strokeColor,
                strokeWidth: gState.lineWidth,
              });
            }
            lastPt = sub.startPoint;
          }
        }
      }
    }

    if (allSubpaths.length > 0) {
      pathCounter++;
      paths.push({
        id: `cad-path-${pageNumber}-${pathCounter}`,
        subpaths: allSubpaths,
        paintingOp,
        strokeColor: gState.strokeColor,
        fillColor: gState.fillColor,
        strokeWidth: gState.lineWidth,
        dashArray: gState.dashArray.length > 0 ? [...gState.dashArray] : undefined,
        dashPhase: gState.dashPhase !== 0 ? gState.dashPhase : undefined,
      });
    }

    subpaths = [];
    currentSubpath = null;
    numStack.length = 0;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'num' && token.num !== undefined) {
      numStack.push(token.num);
      continue;
    }

    if (token.type !== 'op') {
      continue;
    }

    const op = token.val;

    switch (op) {
      // Graphics State Stack
      case 'q':
        stateStack.push({
          ctm: [...gState.ctm] as AffineMatrix2D,
          strokeColor: gState.strokeColor,
          fillColor: gState.fillColor,
          lineWidth: gState.lineWidth,
          dashArray: [...gState.dashArray],
          dashPhase: gState.dashPhase,
        });
        numStack.length = 0;
        break;

      case 'Q':
        if (stateStack.length > 0) {
          gState = stateStack.pop()!;
        }
        numStack.length = 0;
        break;

      // Concatenate Matrix cm
      case 'cm':
        if (numStack.length >= 6) {
          const [a, b, c, d, e, f] = numStack.slice(-6);
          const matrix: AffineMatrix2D = [a, b, c, d, e, f];
          gState.ctm = multiplyAffineMatrices(matrix, gState.ctm);
        }
        numStack.length = 0;
        break;

      // Line Width w
      case 'w':
        if (numStack.length >= 1) {
          gState.lineWidth = Math.abs(numStack[numStack.length - 1]);
        }
        numStack.length = 0;
        break;

      // Color Operators
      case 'RG': // Stroke RGB
        if (numStack.length >= 3) {
          const [r, g, b] = numStack.slice(-3);
          gState.strokeColor = toRgbHex(r, g, b);
        }
        numStack.length = 0;
        break;

      case 'rg': // Fill RGB
        if (numStack.length >= 3) {
          const [r, g, b] = numStack.slice(-3);
          gState.fillColor = toRgbHex(r, g, b);
        }
        numStack.length = 0;
        break;

      case 'K': // Stroke CMYK
        if (numStack.length >= 4) {
          const [c, m, y, k] = numStack.slice(-4);
          gState.strokeColor = cmykToRgbHex(c, m, y, k);
        }
        numStack.length = 0;
        break;

      case 'k': // Fill CMYK
        if (numStack.length >= 4) {
          const [c, m, y, k] = numStack.slice(-4);
          gState.fillColor = cmykToRgbHex(c, m, y, k);
        }
        numStack.length = 0;
        break;

      case 'G': // Stroke Gray
        if (numStack.length >= 1) {
          gState.strokeColor = grayToRgbHex(numStack[numStack.length - 1]);
        }
        numStack.length = 0;
        break;

      case 'g': // Fill Gray
        if (numStack.length >= 1) {
          gState.fillColor = grayToRgbHex(numStack[numStack.length - 1]);
        }
        numStack.length = 0;
        break;

      // Path Construction
      case 'm': // moveto
        if (numStack.length >= 2) {
          const [rawX, rawY] = numStack.slice(-2);
          const pt = transformPoint({ x: rawX, y: rawY }, gState.ctm);
          if (currentSubpath) {
            subpaths.push(currentSubpath);
          }
          currentSubpath = {
            startPoint: pt,
            currentPoint: pt,
            points: [pt],
            operations: [{ type: 'move', point: pt }],
            isClosed: false,
          };
        }
        numStack.length = 0;
        break;

      case 'l': // lineto
        if (numStack.length >= 2) {
          const [rawX, rawY] = numStack.slice(-2);
          const pt = transformPoint({ x: rawX, y: rawY }, gState.ctm);
          if (!currentSubpath) {
            currentSubpath = {
              startPoint: pt,
              currentPoint: pt,
              points: [pt],
              operations: [{ type: 'move', point: pt }],
              isClosed: false,
            };
          } else {
            currentSubpath.points.push(pt);
            currentSubpath.operations.push({ type: 'line', point: pt });
            currentSubpath.currentPoint = pt;
          }
        }
        numStack.length = 0;
        break;

      case 'c': // curveto
        if (numStack.length >= 6) {
          const [x1, y1, x2, y2, x3, y3] = numStack.slice(-6);
          const p1 = transformPoint({ x: x1, y: y1 }, gState.ctm);
          const p2 = transformPoint({ x: x2, y: y2 }, gState.ctm);
          const p3 = transformPoint({ x: x3, y: y3 }, gState.ctm);

          if (!currentSubpath) {
            currentSubpath = {
              startPoint: p1,
              currentPoint: p1,
              points: [p1],
              operations: [{ type: 'move', point: p1 }],
              isClosed: false,
            };
          }

          currentSubpath.points.push(p3);
          currentSubpath.operations.push({ type: 'curve', p1, p2, p3 });
          currentSubpath.currentPoint = p3;
        }
        numStack.length = 0;
        break;

      case 'v': // curve with p1 == currentPoint
        if (numStack.length >= 4 && currentSubpath) {
          const [x2, y2, x3, y3] = numStack.slice(-4);
          const p1 = currentSubpath.currentPoint;
          const p2 = transformPoint({ x: x2, y: y2 }, gState.ctm);
          const p3 = transformPoint({ x: x3, y: y3 }, gState.ctm);

          currentSubpath.points.push(p3);
          currentSubpath.operations.push({ type: 'curve', p1, p2, p3 });
          currentSubpath.currentPoint = p3;
        }
        numStack.length = 0;
        break;

      case 'y': // curve with p2 == p3
        if (numStack.length >= 4 && currentSubpath) {
          const [x1, y1, x3, y3] = numStack.slice(-4);
          const p1 = transformPoint({ x: x1, y: y1 }, gState.ctm);
          const p3 = transformPoint({ x: x3, y: y3 }, gState.ctm);
          const p2 = p3;

          currentSubpath.points.push(p3);
          currentSubpath.operations.push({ type: 'curve', p1, p2, p3 });
          currentSubpath.currentPoint = p3;
        }
        numStack.length = 0;
        break;

      case 're': // append rectangle
        if (numStack.length >= 4) {
          const [rx, ry, rw, rh] = numStack.slice(-4);
          const p0 = transformPoint({ x: rx, y: ry }, gState.ctm);
          const p1 = transformPoint({ x: rx + rw, y: ry }, gState.ctm);
          const p2 = transformPoint({ x: rx + rw, y: ry + rh }, gState.ctm);
          const p3 = transformPoint({ x: rx, y: ry + rh }, gState.ctm);

          if (currentSubpath) {
            subpaths.push(currentSubpath);
          }

          currentSubpath = {
            startPoint: p0,
            currentPoint: p0,
            points: [p0, p1, p2, p3],
            operations: [
              { type: 'move', point: p0 },
              { type: 'line', point: p1 },
              { type: 'line', point: p2 },
              { type: 'line', point: p3 },
              { type: 'close' },
            ],
            isClosed: true,
          };
          subpaths.push(currentSubpath);
          currentSubpath = null;

          // Also record primitive if aligned
          rectangles.push({
            id: `cad-rect-${pageNumber}-${rectangles.length + 1}`,
            x: Math.min(p0.x, p1.x, p2.x, p3.x),
            y: Math.min(p0.y, p1.y, p2.y, p3.y),
            width: Math.abs(rw),
            height: Math.abs(rh),
            strokeColor: gState.strokeColor,
            fillColor: gState.fillColor,
            strokeWidth: gState.lineWidth,
          });
        }
        numStack.length = 0;
        break;

      case 'h': // closepath
        if (currentSubpath) {
          currentSubpath.isClosed = true;
          currentSubpath.operations.push({ type: 'close' });
          currentSubpath.currentPoint = currentSubpath.startPoint;
        }
        numStack.length = 0;
        break;

      // Path Painting Operators
      case 'S': // Stroke
        flushPath('stroke');
        break;

      case 's': // Close and stroke
        if (currentSubpath) {
          currentSubpath.isClosed = true;
          currentSubpath.operations.push({ type: 'close' });
        }
        flushPath('stroke');
        break;

      case 'f':
      case 'F': // Fill
        flushPath('fill');
        break;

      case 'f*': // Even-Odd Fill
        flushPath('fill-even-odd');
        break;

      case 'B': // Fill and stroke
        flushPath('fill-and-stroke');
        break;

      case 'B*': // Even-odd fill and stroke
        flushPath('fill-and-stroke-even-odd');
        break;

      case 'b': // Close, fill, and stroke
        if (currentSubpath) {
          currentSubpath.isClosed = true;
          currentSubpath.operations.push({ type: 'close' });
        }
        flushPath('fill-and-stroke');
        break;

      case 'b*': // Close, even-odd fill, and stroke
        if (currentSubpath) {
          currentSubpath.isClosed = true;
          currentSubpath.operations.push({ type: 'close' });
        }
        flushPath('fill-and-stroke-even-odd');
        break;

      case 'n': // End path without fill/stroke (clipping)
        flushPath('clip-only');
        break;

      default:
        // Text and image operators do not clear the numeric stack for path ops,
        // but resetting prevents numeric operand accumulation errors
        if (!['BT', 'ET', 'Tf', 'Tj', 'TJ', 'Td', 'TD', 'Tm', 'T*'].includes(op)) {
          numStack.length = 0;
        }
        break;
    }
  }

  // Flush any dangling path
  if (currentSubpath || subpaths.length > 0) {
    flushPath('stroke');
  }

  return {
    pageNumber,
    pageWidth,
    pageHeight,
    lines,
    beziers,
    rectangles,
    paths,
    totalExtractedSegments: lines.length + beziers.length,
  };
}
