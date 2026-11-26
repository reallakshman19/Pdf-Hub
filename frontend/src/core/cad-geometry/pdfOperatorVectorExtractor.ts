import type {
  AffineMatrix2D,
  CadCubicBezier,
  CadHarvestedPageGeometry,
  CadHarvestedPath,
  CadLineSegment,
  CadOperatorListInput,
  CadPathPaintingOp,
  CadPathSubpath,
  CadRectPrimitive,
  CadVectorExtractOptions,
  Point2D,
} from './types';
import { IDENTITY_MATRIX, multiplyAffineMatrices, transformPoint } from './matrix';

const DRAW_OP_MOVE_TO = 0;
const DRAW_OP_LINE_TO = 1;
const DRAW_OP_CURVE_TO = 2;
const DRAW_OP_QUADRATIC_TO = 3;
const DRAW_OP_CLOSE_PATH = 4;

interface InterpreterGState {
  ctm: AffineMatrix2D;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  dashArray: number[];
  dashPhase: number;
  layerStackLenAtSave: number;
}

interface SubpathDraft {
  startPoint: Point2D;
  currentPoint: Point2D;
  points: Point2D[];
  operations: CadPathSubpath['operations'];
  isClosed: boolean;
}

export interface OperatorListExtractSummary {
  geometry: CadHarvestedPageGeometry;
  layersDetected: string[];
  imageXObjectCount: number;
  skippedOutOfRegionCount: number;
}

function clampByteHex(v: number): string {
  return Math.min(255, Math.max(0, Math.round(v * 255)))
    .toString(16)
    .padStart(2, '0');
}

function parseColorArg(args: unknown, kind: 'rgb' | 'gray' | 'cmyk'): string | undefined {
  if (!Array.isArray(args) || args.length === 0) return undefined;
  if (typeof args[0] === 'string' && args[0].startsWith('#')) {
    return args[0];
  }
  const nums = args.filter((v): v is number => typeof v === 'number');
  if (kind === 'rgb' && nums.length >= 3) {
    const scale = nums[0] <= 1 && nums[1] <= 1 && nums[2] <= 1 ? 1 : 1 / 255;
    return `#${clampByteHex(nums[0] * scale)}${clampByteHex(nums[1] * scale)}${clampByteHex(nums[2] * scale)}`;
  }
  if (kind === 'gray' && nums.length >= 1) {
    const scale = nums[0] <= 1 ? 1 : 1 / 255;
    const h = clampByteHex(nums[0] * scale);
    return `#${h}${h}${h}`;
  }
  if (kind === 'cmyk' && nums.length >= 4) {
    const [c, m, y, k] = nums;
    const r = (1 - c) * (1 - k);
    const g = (1 - m) * (1 - k);
    const b = (1 - y) * (1 - k);
    return `#${clampByteHex(r)}${clampByteHex(g)}${clampByteHex(b)}`;
  }
  return undefined;
}

function resolveMarkedLayerName(
  args: unknown,
  ocgLayerNames?: Record<string, string>,
): string | undefined {
  if (!Array.isArray(args) || args.length === 0) return undefined;
  const tag = typeof args[0] === 'string' ? args[0] : '';
  const props = args[1];

  if (typeof props === 'string') {
    return ocgLayerNames?.[props] ?? props;
  }
  if (props && typeof props === 'object') {
    const rec = props as Record<string, unknown>;
    const rawId =
      (typeof rec.mcid === 'string' ? rec.mcid : undefined) ??
      (typeof rec.ocgId === 'string' ? rec.ocgId : undefined) ??
      (typeof rec.id === 'string' ? rec.id : undefined) ??
      (typeof rec.name === 'string' ? rec.name : undefined) ??
      (typeof rec.Name === 'string' ? rec.Name : undefined);
    if (rawId) {
      return ocgLayerNames?.[rawId] ?? rawId;
    }
    if (tag === 'OC' && typeof rec.type === 'string' && rec.type === 'OCG' && typeof rec.id === 'string') {
      return ocgLayerNames?.[rec.id] ?? rec.id;
    }
  }
  return undefined;
}

function segmentIntersectsRect(
  a: Point2D,
  b: Point2D,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const minX = rect.x;
  const maxX = rect.x + rect.width;
  const minY = rect.y;
  const maxY = rect.y + rect.height;

  const segMinX = Math.min(a.x, b.x);
  const segMaxX = Math.max(a.x, b.x);
  const segMinY = Math.min(a.y, b.y);
  const segMaxY = Math.max(a.y, b.y);

  return segMaxX >= minX && segMinX <= maxX && segMaxY >= minY && segMinY <= maxY;
}

function boxIntersectsRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    maxX >= rect.x &&
    minX <= rect.x + rect.width &&
    maxY >= rect.y &&
    minY <= rect.y + rect.height
  );
}

function classifyPaintingOp(
  opCode: number,
  ops: Record<string, number>,
): CadPathPaintingOp | null {
  if (opCode === ops.stroke || opCode === ops.closeStroke) return 'stroke';
  if (opCode === ops.fill) return 'fill';
  if (opCode === ops.eoFill) return 'fill-even-odd';
  if (opCode === ops.fillStroke || opCode === ops.closeFillStroke) return 'fill-and-stroke';
  if (opCode === ops.eoFillStroke || opCode === ops.closeEOFillStroke) {
    return 'fill-and-stroke-even-odd';
  }
  if (opCode === ops.endPath) return 'clip-only';
  return null;
}

function cloneSubpathDraftsFromPackedOps(
  dataArr: ReadonlyArray<ArrayLike<number>>,
  ctm: AffineMatrix2D,
): SubpathDraft[] {
  const out: SubpathDraft[] = [];
  let current: SubpathDraft | null = null;

  const flushSub = () => {
    if (current && current.operations.length > 0) {
      out.push(current);
    }
    current = null;
  };

  for (const data of dataArr) {
    if (!data || typeof data.length !== 'number') continue;
    let i = 0;
    const len = data.length;

    while (i < len) {
      const cmd = data[i++];
      if (cmd === DRAW_OP_MOVE_TO && i + 1 < len) {
        flushSub();
        const pt = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        current = {
          startPoint: pt,
          currentPoint: pt,
          points: [pt],
          operations: [{ type: 'move', point: pt }],
          isClosed: false,
        };
      } else if (cmd === DRAW_OP_LINE_TO && i + 1 < len) {
        const pt = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        if (!current) {
          current = {
            startPoint: pt,
            currentPoint: pt,
            points: [pt],
            operations: [{ type: 'move', point: pt }],
            isClosed: false,
          };
        } else {
          current.currentPoint = pt;
          current.points.push(pt);
          current.operations.push({ type: 'line', point: pt });
        }
      } else if (cmd === DRAW_OP_CURVE_TO && i + 5 < len) {
        const p1 = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        const p2 = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        const p3 = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        if (!current) {
          current = {
            startPoint: p3,
            currentPoint: p3,
            points: [p3],
            operations: [{ type: 'move', point: p3 }],
            isClosed: false,
          };
        } else {
          current.currentPoint = p3;
          current.points.push(p1, p2, p3);
          current.operations.push({ type: 'curve', p1, p2, p3 });
        }
      } else if (cmd === DRAW_OP_QUADRATIC_TO && i + 3 < len) {
        const qc = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        const qEnd = transformPoint({ x: data[i++], y: data[i++] }, ctm);
        if (!current) {
          current = {
            startPoint: qEnd,
            currentPoint: qEnd,
            points: [qEnd],
            operations: [{ type: 'move', point: qEnd }],
            isClosed: false,
          };
        } else {
          const p0 = current.currentPoint;
          // Exact degree elevation from quadratic Bezier (p0, qc, qEnd) to cubic Bezier
          const p1: Point2D = {
            x: p0.x + (2 / 3) * (qc.x - p0.x),
            y: p0.y + (2 / 3) * (qc.y - p0.y),
          };
          const p2: Point2D = {
            x: qEnd.x + (2 / 3) * (qc.x - qEnd.x),
            y: qEnd.y + (2 / 3) * (qc.y - qEnd.y),
          };
          current.currentPoint = qEnd;
          current.points.push(p1, p2, qEnd);
          current.operations.push({ type: 'curve', p1, p2, p3: qEnd });
        }
      } else if (cmd === DRAW_OP_CLOSE_PATH) {
        if (current) {
          current.isClosed = true;
          current.operations.push({ type: 'close' });
          current.currentPoint = { ...current.startPoint };
        }
      } else {
        // Unknown DrawOPS entry: abort inner decode safely to avoid misaligned floats
        break;
      }
    }
  }

  flushSub();
  return out;
}

function tryDetectAxisAlignedRect(sub: SubpathDraft): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!sub.isClosed || sub.points.length < 4 || sub.points.length > 5) return null;
  // Require all segments after initial move to be linear (no curves)
  if (sub.operations.some((op) => op.type === 'curve')) return null;

  const xs = sub.points.map((p) => p.x);
  const ys = sub.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1e-3 || height <= 1e-3) return null;

  const EPS = 0.05;
  const allOnBoundaryCorners = sub.points.every(
    (p) =>
      (Math.abs(p.x - minX) <= EPS || Math.abs(p.x - maxX) <= EPS) &&
      (Math.abs(p.y - minY) <= EPS || Math.abs(p.y - maxY) <= EPS),
  );
  if (!allOnBoundaryCorners) return null;

  return { x: minX, y: minY, width, height };
}

/**
 * Interprets a `pdfjs-dist` OperatorList into view-space CAD geometry primitives,
 * resolving Form XObjects, nested CTM matrices, stroke/dash styles, and OCG layers.
 */
export function extractVectorsFromOperatorList(
  input: CadOperatorListInput,
  options: {
    pageNumber?: number;
    pageWidth?: number;
    pageHeight?: number;
    viewportTransform?: AffineMatrix2D;
    extractOptions?: CadVectorExtractOptions;
  } = {},
): OperatorListExtractSummary {
  const pageNumber = options.pageNumber ?? 1;
  const pageWidth = options.pageWidth ?? 612;
  const pageHeight = options.pageHeight ?? 792;
  const extractOpts = options.extractOptions ?? {};
  const minLen = extractOpts.minSegmentLength ?? 0.5;
  const includeFillOnly = extractOpts.includeFillOnlyPaths ?? true;
  const layerFilter =
    extractOpts.includeLayers && extractOpts.includeLayers.length > 0
      ? new Set(extractOpts.includeLayers)
      : null;

  const lines: CadLineSegment[] = [];
  const beziers: CadCubicBezier[] = [];
  const rectangles: CadRectPrimitive[] = [];
  const paths: CadHarvestedPath[] = [];
  const layersDetected = new Set<string>();

  const ops = input.ops;
  const stack: InterpreterGState[] = [];
  const layerStack: string[] = [];

  let gState: InterpreterGState = {
    ctm: [...(options.viewportTransform ?? IDENTITY_MATRIX)] as AffineMatrix2D,
    strokeColor: '#000000',
    fillColor: '#000000',
    lineWidth: 1,
    dashArray: [],
    dashPhase: 0,
    layerStackLenAtSave: 0,
  };

  let pendingSubpaths: SubpathDraft[] = [];
  let activeSubpath: SubpathDraft | null = null;
  let segmentCounter = 0;
  let pathCounter = 0;
  let imageXObjectCount = 0;
  let skippedOutOfRegionCount = 0;

  const activeLayerName = (): string | undefined =>
    layerStack.length > 0 ? layerStack[layerStack.length - 1] : undefined;

  const saveState = () => {
    stack.push({
      ctm: [...gState.ctm] as AffineMatrix2D,
      strokeColor: gState.strokeColor,
      fillColor: gState.fillColor,
      lineWidth: gState.lineWidth,
      dashArray: [...gState.dashArray],
      dashPhase: gState.dashPhase,
      layerStackLenAtSave: layerStack.length,
    });
  };

  const restoreState = () => {
    const prev = stack.pop();
    if (prev) {
      gState = prev;
    }
  };

  const commitPathSubpaths = (subpathsToEmit: SubpathDraft[], paintingOp: CadPathPaintingOp) => {
    if (subpathsToEmit.length === 0) return;

    if (
      paintingOp === 'clip-only' ||
      (!includeFillOnly && (paintingOp === 'fill' || paintingOp === 'fill-even-odd'))
    ) {
      return;
    }

    const layerName = activeLayerName();
    if (layerFilter && (!layerName || !layerFilter.has(layerName))) {
      return;
    }

    // Approximate stroke width scaled into view space
    const ctmScale =
      (Math.hypot(gState.ctm[0], gState.ctm[1]) + Math.hypot(gState.ctm[2], gState.ctm[3])) / 2;
    const effStrokeWidth = Math.round(gState.lineWidth * Math.max(0.01, ctmScale) * 1000) / 1000;
    const dashArray = gState.dashArray.length > 0 ? [...gState.dashArray] : undefined;

    const keptSubpaths: CadPathSubpath[] = [];

    for (const sub of subpathsToEmit) {
      if (sub.operations.length === 0) continue;

      const maybeRect = tryDetectAxisAlignedRect(sub);
      if (maybeRect) {
        if (
          !extractOpts.regionRect ||
          boxIntersectsRect(
            maybeRect.x,
            maybeRect.y,
            maybeRect.x + maybeRect.width,
            maybeRect.y + maybeRect.height,
            extractOpts.regionRect,
          )
        ) {
          pathCounter++;
          rectangles.push({
            id: `cad-rect-${pageNumber}-${pathCounter}`,
            x: maybeRect.x,
            y: maybeRect.y,
            width: maybeRect.width,
            height: maybeRect.height,
            strokeColor: gState.strokeColor,
            fillColor: gState.fillColor,
            strokeWidth: effStrokeWidth,
            ...(layerName ? { layerName } : {}),
          });
        }
      }

      keptSubpaths.push({
        points: [...sub.points],
        isClosed: sub.isClosed,
        operations: [...sub.operations],
      });

      let lastPt = sub.startPoint;
      for (const op of sub.operations) {
        if (op.type === 'move') {
          lastPt = op.point;
        } else if (op.type === 'line') {
          const len = Math.hypot(op.point.x - lastPt.x, op.point.y - lastPt.y);
          if (len >= minLen) {
            if (!extractOpts.regionRect || segmentIntersectsRect(lastPt, op.point, extractOpts.regionRect)) {
              segmentCounter++;
              lines.push({
                id: `cad-op-line-${pageNumber}-${segmentCounter}`,
                start: { ...lastPt },
                end: { ...op.point },
                length: len,
                strokeColor: gState.strokeColor,
                strokeWidth: effStrokeWidth,
                ...(dashArray ? { dashArray, dashPhase: gState.dashPhase } : {}),
                ...(layerName ? { layerName } : {}),
              });
            } else {
              skippedOutOfRegionCount++;
            }
          }
          lastPt = op.point;
        } else if (op.type === 'curve') {
          const minBx = Math.min(lastPt.x, op.p1.x, op.p2.x, op.p3.x);
          const maxBx = Math.max(lastPt.x, op.p1.x, op.p2.x, op.p3.x);
          const minBy = Math.min(lastPt.y, op.p1.y, op.p2.y, op.p3.y);
          const maxBy = Math.max(lastPt.y, op.p1.y, op.p2.y, op.p3.y);
          if (!extractOpts.regionRect || boxIntersectsRect(minBx, minBy, maxBx, maxBy, extractOpts.regionRect)) {
            segmentCounter++;
            beziers.push({
              id: `cad-op-bezier-${pageNumber}-${segmentCounter}`,
              p0: { ...lastPt },
              p1: { ...op.p1 },
              p2: { ...op.p2 },
              p3: { ...op.p3 },
              strokeColor: gState.strokeColor,
              strokeWidth: effStrokeWidth,
              ...(dashArray ? { dashArray } : {}),
              ...(layerName ? { layerName } : {}),
            });
          } else {
            skippedOutOfRegionCount++;
          }
          lastPt = op.p3;
        } else if (op.type === 'close') {
          const len = Math.hypot(sub.startPoint.x - lastPt.x, sub.startPoint.y - lastPt.y);
          if (len >= minLen) {
            if (!extractOpts.regionRect || segmentIntersectsRect(lastPt, sub.startPoint, extractOpts.regionRect)) {
              segmentCounter++;
              lines.push({
                id: `cad-op-line-${pageNumber}-${segmentCounter}`,
                start: { ...lastPt },
                end: { ...sub.startPoint },
                length: len,
                strokeColor: gState.strokeColor,
                strokeWidth: effStrokeWidth,
                ...(dashArray ? { dashArray, dashPhase: gState.dashPhase } : {}),
                ...(layerName ? { layerName } : {}),
              });
            } else {
              skippedOutOfRegionCount++;
            }
          }
          lastPt = sub.startPoint;
        }
      }
    }

    if (keptSubpaths.length > 0) {
      pathCounter++;
      paths.push({
        id: `cad-op-path-${pageNumber}-${pathCounter}`,
        subpaths: keptSubpaths,
        paintingOp,
        strokeColor: gState.strokeColor,
        fillColor: gState.fillColor,
        strokeWidth: effStrokeWidth,
        ...(dashArray ? { dashArray, dashPhase: gState.dashPhase } : {}),
      });
    }
  };

  for (let i = 0; i < input.fnArray.length; i++) {
    const fn = input.fnArray[i];
    const args = input.argsArray[i];

    if (fn === ops.save) {
      saveState();
      continue;
    }
    if (fn === ops.restore) {
      restoreState();
      continue;
    }
    if (fn === ops.transform && Array.isArray(args) && args.length >= 6) {
      const m: AffineMatrix2D = [
        Number(args[0]) || 0,
        Number(args[1]) || 0,
        Number(args[2]) || 0,
        Number(args[3]) || 0,
        Number(args[4]) || 0,
        Number(args[5]) || 0,
      ];
      gState.ctm = multiplyAffineMatrices(m, gState.ctm);
      continue;
    }
    if (fn === ops.paintFormXObjectBegin) {
      saveState();
      if (Array.isArray(args) && Array.isArray(args[0]) && args[0].length >= 6) {
        const mRaw = args[0] as number[];
        const m: AffineMatrix2D = [
          Number(mRaw[0]) || 0,
          Number(mRaw[1]) || 0,
          Number(mRaw[2]) || 0,
          Number(mRaw[3]) || 0,
          Number(mRaw[4]) || 0,
          Number(mRaw[5]) || 0,
        ];
        gState.ctm = multiplyAffineMatrices(m, gState.ctm);
      }
      continue;
    }
    if (fn === ops.paintFormXObjectEnd) {
      restoreState();
      continue;
    }
    if (fn === ops.beginMarkedContentProps) {
      const resolved = resolveMarkedLayerName(args, input.ocgLayerNames);
      if (resolved) layersDetected.add(resolved);
      layerStack.push(resolved ?? (activeLayerName() || ''));
      continue;
    }
    if (fn === ops.beginMarkedContent) {
      layerStack.push(activeLayerName() || '');
      continue;
    }
    if (fn === ops.endMarkedContent) {
      if (layerStack.length > 0) layerStack.pop();
      continue;
    }
    if (fn === ops.setLineWidth && Array.isArray(args) && typeof args[0] === 'number') {
      gState.lineWidth = args[0];
      continue;
    }
    if (fn === ops.setDash && Array.isArray(args)) {
      gState.dashArray = Array.isArray(args[0])
        ? args[0].filter((n): n is number => typeof n === 'number')
        : [];
      gState.dashPhase = typeof args[1] === 'number' ? args[1] : 0;
      continue;
    }
    if (fn === ops.setStrokeRGBColor) {
      const c = parseColorArg(args, 'rgb');
      if (c) gState.strokeColor = c;
      continue;
    }
    if (fn === ops.setFillRGBColor) {
      const c = parseColorArg(args, 'rgb');
      if (c) gState.fillColor = c;
      continue;
    }
    if (fn === ops.setStrokeGray) {
      const c = parseColorArg(args, 'gray');
      if (c) gState.strokeColor = c;
      continue;
    }
    if (fn === ops.setFillGray) {
      const c = parseColorArg(args, 'gray');
      if (c) gState.fillColor = c;
      continue;
    }
    if (fn === ops.setStrokeCMYKColor) {
      const c = parseColorArg(args, 'cmyk');
      if (c) gState.strokeColor = c;
      continue;
    }
    if (fn === ops.setFillCMYKColor) {
      const c = parseColorArg(args, 'cmyk');
      if (c) gState.fillColor = c;
      continue;
    }
    if (
      fn === ops.paintImageXObject ||
      fn === ops.paintInlineImageXObject ||
      fn === ops.paintImageMaskXObject ||
      fn === ops.paintImageXObjectRepeat ||
      fn === ops.paintImageMaskXObjectGroup
    ) {
      imageXObjectCount++;
      continue;
    }

    // pdf.js v5 unified path operation: [paintOpCode, Float32Array[], minMaxBox]
    if (fn === ops.constructPath && Array.isArray(args) && args.length >= 2) {
      const paintCode = typeof args[0] === 'number' ? args[0] : ops.stroke;
      const paintOp = classifyPaintingOp(paintCode, ops);
      const dataArr = Array.isArray(args[1]) ? (args[1] as ArrayLike<number>[]) : [];
      const parsed = cloneSubpathDraftsFromPackedOps(dataArr, gState.ctm);
      if (paintOp) {
        commitPathSubpaths(parsed, paintOp);
      }
      continue;
    }

    // Legacy / direct single-path ops (fallback for test mocks or older streams)
    if (fn === ops.moveTo && Array.isArray(args) && args.length >= 2) {
      if (activeSubpath) pendingSubpaths.push(activeSubpath);
      const pt = transformPoint({ x: Number(args[0]), y: Number(args[1]) }, gState.ctm);
      activeSubpath = {
        startPoint: pt,
        currentPoint: pt,
        points: [pt],
        operations: [{ type: 'move', point: pt }],
        isClosed: false,
      };
      continue;
    }
    if (fn === ops.lineTo && Array.isArray(args) && args.length >= 2 && activeSubpath) {
      const pt = transformPoint({ x: Number(args[0]), y: Number(args[1]) }, gState.ctm);
      activeSubpath.currentPoint = pt;
      activeSubpath.points.push(pt);
      activeSubpath.operations.push({ type: 'line', point: pt });
      continue;
    }
    if (fn === ops.curveTo && Array.isArray(args) && args.length >= 6 && activeSubpath) {
      const p1 = transformPoint({ x: Number(args[0]), y: Number(args[1]) }, gState.ctm);
      const p2 = transformPoint({ x: Number(args[2]), y: Number(args[3]) }, gState.ctm);
      const p3 = transformPoint({ x: Number(args[4]), y: Number(args[5]) }, gState.ctm);
      activeSubpath.currentPoint = p3;
      activeSubpath.points.push(p1, p2, p3);
      activeSubpath.operations.push({ type: 'curve', p1, p2, p3 });
      continue;
    }
    if (fn === ops.closePath && activeSubpath) {
      activeSubpath.isClosed = true;
      activeSubpath.operations.push({ type: 'close' });
      activeSubpath.currentPoint = { ...activeSubpath.startPoint };
      continue;
    }
    if (fn === ops.rectangle && Array.isArray(args) && args.length >= 4) {
      if (activeSubpath) pendingSubpaths.push(activeSubpath);
      const rx = Number(args[0]);
      const ry = Number(args[1]);
      const rw = Number(args[2]);
      const rh = Number(args[3]);
      const c0 = transformPoint({ x: rx, y: ry }, gState.ctm);
      const c1 = transformPoint({ x: rx + rw, y: ry }, gState.ctm);
      const c2 = transformPoint({ x: rx + rw, y: ry + rh }, gState.ctm);
      const c3 = transformPoint({ x: rx, y: ry + rh }, gState.ctm);
      activeSubpath = {
        startPoint: c0,
        currentPoint: c0,
        points: [c0, c1, c2, c3],
        operations: [
          { type: 'move', point: c0 },
          { type: 'line', point: c1 },
          { type: 'line', point: c2 },
          { type: 'line', point: c3 },
          { type: 'close' },
        ],
        isClosed: true,
      };
      continue;
    }

    const directPaint = classifyPaintingOp(fn, ops);
    if (directPaint) {
      if (activeSubpath) {
        pendingSubpaths.push(activeSubpath);
        activeSubpath = null;
      }
      commitPathSubpaths(pendingSubpaths, directPaint);
      pendingSubpaths = [];
    }
  }

  return {
    geometry: {
      pageNumber,
      pageWidth,
      pageHeight,
      lines,
      beziers,
      rectangles,
      paths,
      totalExtractedSegments: lines.length + beziers.length + rectangles.length,
    },
    layersDetected: Array.from(layersDetected).filter((l) => l.length > 0),
    imageXObjectCount,
    skippedOutOfRegionCount,
  };
}
