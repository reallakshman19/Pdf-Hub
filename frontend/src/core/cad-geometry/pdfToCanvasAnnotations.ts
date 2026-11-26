import type { ScaleCalibration } from '../annotations/calibration';
import { computeRectFromPagePoints, getAnnotationPageVertices } from '../annotations/pointsSpace';
import type { AnnotationData, PdfAnnotation, Rect } from '../annotations/types';
import type { PageId } from '../pages/types';
import type {
  CadCubicBezier,
  CadHarvestedPageGeometry,
  CadLineSegment,
  CadPageVectorExtractResult,
  CadRectPrimitive,
  CadTextAnchor,
  Point2D,
} from './types';

export interface PdfVectorImportOptions {
  pageNumber?: number;
  pageId?: PageId;
  stitchPolylines?: boolean;
  promoteClosedPolygons?: boolean;
  defaultPolylineType?: 'line' | 'perimeter-takeoff';
  markPolylinesAsPipeRun?: boolean;
  snapEpsilon?: number;
  minSegmentLength?: number;
  maxAnnotations?: number;
  importRectangles?: boolean;
  importBeziers?: boolean;
  bezierChordSegments?: number;
  importTextLabels?: boolean;
  includeLayers?: string[];
  calibration?: ScaleCalibration;
  timestamp?: number;
  idFactory?: () => string;
}

export interface PdfVectorImportStats {
  linesCreated: number;
  polylinesCreated: number;
  rectsCreated: number;
  polygonsCreated: number;
  labelsCreated: number;
  skippedSegments: number;
  truncatedByLimit: boolean;
}

export interface PdfVectorImportResult {
  annotations: PdfAnnotation[];
  stats: PdfVectorImportStats;
}

interface InternalSegment {
  start: Point2D;
  end: Point2D;
  strokeColor: string;
  strokeWidth: number;
  borderStyle: 'solid' | 'dashed';
  layerName?: string;
}

function defaultIdFactory(): () => string {
  let seq = 0;
  return () => {
    seq += 1;
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `pdf-vec-${Date.now()}-${seq}`;
  };
}

function quantKey(pt: Point2D, cellSize: number): string {
  const qx = Math.round(pt.x / cellSize);
  const qy = Math.round(pt.y / cellSize);
  return `${qx},${qy}`;
}

function pointsClose(a: Point2D, b: Point2D, eps: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function flattenCubicBezier(bez: CadCubicBezier, steps: number): InternalSegment[] {
  const segs: InternalSegment[] = [];
  const style: 'solid' | 'dashed' =
    Array.isArray(bez.dashArray) && bez.dashArray.length > 0 ? 'dashed' : 'solid';
  let prev = bez.p0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const pt: Point2D = {
      x:
        mt * mt * mt * bez.p0.x +
        3 * mt * mt * t * bez.p1.x +
        3 * mt * t * t * bez.p2.x +
        t * t * t * bez.p3.x,
      y:
        mt * mt * mt * bez.p0.y +
        3 * mt * mt * t * bez.p1.y +
        3 * mt * t * t * bez.p2.y +
        t * t * t * bez.p3.y,
    };
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 0.5) {
      segs.push({
        start: prev,
        end: pt,
        strokeColor: bez.strokeColor ?? '#111827',
        strokeWidth: bez.strokeWidth ?? 1.5,
        borderStyle: style,
        layerName: bez.layerName,
      });
      prev = pt;
    }
  }
  return segs;
}

function matchesRectEdge(seg: CadLineSegment, rects: CadRectPrimitive[], eps: number): boolean {
  for (const r of rects) {
    const x1 = r.x;
    const x2 = r.x + r.width;
    const y1 = r.y;
    const y2 = r.y + r.height;
    const onH =
      (Math.abs(seg.start.y - y1) <= eps && Math.abs(seg.end.y - y1) <= eps) ||
      (Math.abs(seg.start.y - y2) <= eps && Math.abs(seg.end.y - y2) <= eps);
    const onV =
      (Math.abs(seg.start.x - x1) <= eps && Math.abs(seg.end.x - x1) <= eps) ||
      (Math.abs(seg.start.x - x2) <= eps && Math.abs(seg.end.x - x2) <= eps);
    if (onH) {
      const minX = Math.min(seg.start.x, seg.end.x);
      const maxX = Math.max(seg.start.x, seg.end.x);
      if (minX >= x1 - eps && maxX <= x2 + eps) return true;
    }
    if (onV) {
      const minY = Math.min(seg.start.y, seg.end.y);
      const maxY = Math.max(seg.start.y, seg.end.y);
      if (minY >= y1 - eps && maxY <= y2 + eps) return true;
    }
  }
  return false;
}

interface StitchedChain {
  vertices: Point2D[];
  closed: boolean;
  strokeColor: string;
  strokeWidth: number;
  borderStyle: 'solid' | 'dashed';
  layerName?: string;
}

function stitchSegmentsByStyle(
  segments: InternalSegment[],
  snapEpsilon: number,
): StitchedChain[] {
  const buckets = new Map<string, InternalSegment[]>();
  for (const seg of segments) {
    const styleKey = `${seg.layerName ?? ''}|${seg.strokeColor}|${seg.borderStyle}|${Math.round(seg.strokeWidth * 4)}`;
    const list = buckets.get(styleKey);
    if (list) list.push(seg);
    else buckets.set(styleKey, [seg]);
  }

  const chains: StitchedChain[] = [];
  const cellSize = Math.max(snapEpsilon * 2, 1);

  for (const group of buckets.values()) {
    const used = new Uint8Array(group.length);
    const endpointMap = new Map<string, number[]>();

    const registerKey = (pt: Point2D, segIdx: number) => {
      const k = quantKey(pt, cellSize);
      const arr = endpointMap.get(k);
      if (arr) arr.push(segIdx);
      else endpointMap.set(k, [segIdx]);
    };

    for (let i = 0; i < group.length; i += 1) {
      registerKey(group[i].start, i);
      registerKey(group[i].end, i);
    }

    const findConnectedUnused = (pt: Point2D): Array<{ segIdx: number; nextPt: Point2D }> => {
      const qx = Math.round(pt.x / cellSize);
      const qy = Math.round(pt.y / cellSize);
      const hits: Array<{ segIdx: number; nextPt: Point2D }> = [];
      const seen = new Set<number>();

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const candidates = endpointMap.get(`${qx + dx},${qy + dy}`);
          if (!candidates) continue;
          for (const idx of candidates) {
            if (used[idx] || seen.has(idx)) continue;
            seen.add(idx);
            const seg = group[idx];
            if (pointsClose(pt, seg.start, snapEpsilon)) {
              hits.push({ segIdx: idx, nextPt: seg.end });
            } else if (pointsClose(pt, seg.end, snapEpsilon)) {
              hits.push({ segIdx: idx, nextPt: seg.start });
            }
          }
        }
      }
      return hits;
    };

    // Prefer starting from degree-1 open endpoints before cycles
    const degreeScore = (pt: Point2D): number => findConnectedUnused(pt).length;
    const order = Array.from({ length: group.length }, (_, i) => i).sort((a, b) => {
      const degA = Math.min(degreeScore(group[a].start), degreeScore(group[a].end));
      const degB = Math.min(degreeScore(group[b].start), degreeScore(group[b].end));
      return degA - degB;
    });

    for (const startIdx of order) {
      if (used[startIdx]) continue;
      used[startIdx] = 1;
      const seed = group[startIdx];
      const verts: Point2D[] = [{ ...seed.start }, { ...seed.end }];

      // Extend forward while non-branching (single continuation)
      while (true) {
        const tail = verts[verts.length - 1];
        const nexts = findConnectedUnused(tail);
        if (nexts.length !== 1) break;
        const pick = nexts[0];
        used[pick.segIdx] = 1;
        verts.push({ ...pick.nextPt });
        if (pointsClose(pick.nextPt, verts[0], snapEpsilon)) {
          break;
        }
      }

      // Extend backward if still open and non-branching
      if (!pointsClose(verts[0], verts[verts.length - 1], snapEpsilon)) {
        while (true) {
          const head = verts[0];
          const prevs = findConnectedUnused(head);
          if (prevs.length !== 1) break;
          const pick = prevs[0];
          used[pick.segIdx] = 1;
          verts.unshift({ ...pick.nextPt });
          if (pointsClose(pick.nextPt, verts[verts.length - 1], snapEpsilon)) {
            break;
          }
        }
      }

      const closed = verts.length >= 4 && pointsClose(verts[0], verts[verts.length - 1], snapEpsilon);
      if (closed) {
        verts.pop();
      }

      chains.push({
        vertices: verts,
        closed,
        strokeColor: seed.strokeColor,
        strokeWidth: seed.strokeWidth,
        borderStyle: seed.borderStyle,
        layerName: seed.layerName,
      });
    }
  }

  return chains;
}

function buildChainAnnotation(
  chain: StitchedChain,
  opts: Required<Pick<PdfVectorImportOptions, 'pageNumber' | 'defaultPolylineType' | 'markPolylinesAsPipeRun' | 'promoteClosedPolygons'>> & {
    pageId?: PageId;
    calibration?: ScaleCalibration;
    timestamp: number;
    id: string;
  },
): { annotation: PdfAnnotation; kind: 'line' | 'polyline' | 'polygon' } {
  const flatPoints: number[] = [];
  for (const pt of chain.vertices) {
    flatPoints.push(Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000);
  }
  const rect: Rect = computeRectFromPagePoints(flatPoints, 8);

  const baseData: AnnotationData = {
    points: flatPoints,
    coordinateSpace: 'page',
    borderColor: chain.strokeColor,
    borderWidth: Math.max(0.75, Math.round(chain.strokeWidth * 100) / 100),
    borderStyle: chain.borderStyle,
    importedFromPdfVector: true,
    ...(chain.layerName ? { cadLayerName: chain.layerName } : {}),
    ...(opts.calibration
      ? {
          dimensionScale: opts.calibration.scaleRatio,
          dimensionUnit: opts.calibration.unit,
          dimensionPrecision: opts.calibration.precision,
        }
      : {}),
  };

  if (chain.closed && chain.vertices.length >= 3 && opts.promoteClosedPolygons) {
    return {
      kind: 'polygon',
      annotation: {
        id: opts.id,
        type: 'shape-polygon',
        ...(opts.pageId ? { pageId: opts.pageId } : {}),
        pageNumber: opts.pageNumber,
        rect,
        data: {
          ...baseData,
          backgroundColor: 'transparent',
        },
        createdAt: opts.timestamp,
        updatedAt: opts.timestamp,
      },
    };
  }

  const isMultiSegment = chain.vertices.length >= 3;
  const type = isMultiSegment ? opts.defaultPolylineType : 'line';

  return {
    kind: isMultiSegment ? 'polyline' : 'line',
    annotation: {
      id: opts.id,
      type,
      ...(opts.pageId ? { pageId: opts.pageId } : {}),
      pageNumber: opts.pageNumber,
      rect,
      data: {
        ...baseData,
        ...(isMultiSegment && (opts.markPolylinesAsPipeRun || type === 'perimeter-takeoff')
          ? { isPipeRun: true }
          : {}),
      },
      createdAt: opts.timestamp,
      updatedAt: opts.timestamp,
    },
  };
}

/**
 * Converts harvested Layer 1 PDF vector geometry and text anchors into editable,
 * page-space DocCraft `PdfAnnotation` objects ready for Canvas rendering and PDF export.
 */
export function convertPdfVectorsToAnnotations(
  extract: Pick<CadPageVectorExtractResult, 'geometry' | 'textAnchors'> | CadHarvestedPageGeometry,
  options: PdfVectorImportOptions = {},
): PdfVectorImportResult {
  const geometry: CadHarvestedPageGeometry =
    'geometry' in extract ? extract.geometry : extract;
  const textAnchors: CadTextAnchor[] =
    'textAnchors' in extract ? extract.textAnchors : [];

  const pageNumber = options.pageNumber ?? geometry.pageNumber ?? 1;
  const snapEpsilon = options.snapEpsilon ?? 1.5;
  const minSegmentLength = options.minSegmentLength ?? 2;
  const maxAnnotations = options.maxAnnotations ?? 2500;
  const stitchPolylines = options.stitchPolylines ?? true;
  const promoteClosedPolygons = options.promoteClosedPolygons ?? true;
  const defaultPolylineType = options.defaultPolylineType ?? 'line';
  const markPolylinesAsPipeRun = options.markPolylinesAsPipeRun ?? false;
  const importRectangles = options.importRectangles ?? true;
  const importBeziers = options.importBeziers ?? true;
  const bezierChordSegments = Math.max(2, options.bezierChordSegments ?? 4);
  const importTextLabels = options.importTextLabels ?? true;
  const layerSet =
    options.includeLayers && options.includeLayers.length > 0
      ? new Set(options.includeLayers)
      : null;
  const timestamp = options.timestamp ?? Date.now();
  const nextId = options.idFactory ?? defaultIdFactory();

  const annotations: PdfAnnotation[] = [];
  const stats: PdfVectorImportStats = {
    linesCreated: 0,
    polylinesCreated: 0,
    rectsCreated: 0,
    polygonsCreated: 0,
    labelsCreated: 0,
    skippedSegments: 0,
    truncatedByLimit: false,
  };

  const canPush = (): boolean => {
    if (annotations.length >= maxAnnotations) {
      stats.truncatedByLimit = true;
      return false;
    }
    return true;
  };

  // 1. Convert native rectangles first and track them to avoid duplicate border lines
  const keptRects: CadRectPrimitive[] = [];
  if (importRectangles) {
    for (const r of geometry.rectangles) {
      if (layerSet && (!r.layerName || !layerSet.has(r.layerName))) continue;
      if (r.width < minSegmentLength && r.height < minSegmentLength) continue;
      keptRects.push(r);
      if (!canPush()) break;

      annotations.push({
        id: nextId(),
        type: 'shape-rect',
        ...(options.pageId ? { pageId: options.pageId } : {}),
        pageNumber,
        rect: {
          x: r.x,
          y: r.y,
          width: Math.max(r.width, 4),
          height: Math.max(r.height, 4),
        },
        data: {
          borderColor: r.strokeColor ?? '#111827',
          borderWidth: Math.max(0.75, r.strokeWidth ?? 1.5),
          backgroundColor: 'transparent',
          importedFromPdfVector: true,
          ...(r.layerName ? { cadLayerName: r.layerName } : {}),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      stats.rectsCreated += 1;
    }
  }

  // 2. Collect line & flattened curve segments (filtering duplicates/rect edges)
  const segments: InternalSegment[] = [];
  const seenSegKeys = new Set<string>();

  for (const seg of geometry.lines) {
    if (layerSet && (!seg.layerName || !layerSet.has(seg.layerName))) {
      stats.skippedSegments += 1;
      continue;
    }
    if (seg.length < minSegmentLength) {
      stats.skippedSegments += 1;
      continue;
    }
    if (importRectangles && matchesRectEdge(seg, keptRects, 0.75)) {
      stats.skippedSegments += 1;
      continue;
    }

    const qStart = quantKey(seg.start, 0.5);
    const qEnd = quantKey(seg.end, 0.5);
    const dedupeKey = qStart <= qEnd ? `${qStart}->${qEnd}` : `${qEnd}->${qStart}`;
    if (seenSegKeys.has(dedupeKey)) {
      stats.skippedSegments += 1;
      continue;
    }
    seenSegKeys.add(dedupeKey);

    const style: 'solid' | 'dashed' =
      Array.isArray(seg.dashArray) && seg.dashArray.length > 0 ? 'dashed' : 'solid';
    segments.push({
      start: seg.start,
      end: seg.end,
      strokeColor: seg.strokeColor ?? '#111827',
      strokeWidth: seg.strokeWidth ?? 1.5,
      borderStyle: style,
      layerName: seg.layerName,
    });
  }

  if (importBeziers) {
    for (const bez of geometry.beziers) {
      if (layerSet && (!bez.layerName || !layerSet.has(bez.layerName))) continue;
      segments.push(...flattenCubicBezier(bez, bezierChordSegments));
    }
  }

  // 3. Stitch contiguous segments into editable polylines / polygons / lines
  const chains: StitchedChain[] = stitchPolylines
    ? stitchSegmentsByStyle(segments, snapEpsilon)
    : segments.map((s) => ({
        vertices: [s.start, s.end],
        closed: false,
        strokeColor: s.strokeColor,
        strokeWidth: s.strokeWidth,
        borderStyle: s.borderStyle,
        layerName: s.layerName,
      }));

  for (const chain of chains) {
    if (!canPush()) break;
    const built = buildChainAnnotation(chain, {
      pageNumber,
      pageId: options.pageId,
      defaultPolylineType,
      markPolylinesAsPipeRun,
      promoteClosedPolygons,
      calibration: options.calibration,
      timestamp,
      id: nextId(),
    });
    annotations.push(built.annotation);
    if (built.kind === 'polygon') stats.polygonsCreated += 1;
    else if (built.kind === 'polyline') stats.polylinesCreated += 1;
    else stats.linesCreated += 1;
  }

  // 4. Optional text anchor labels -> editable textbox annotations
  if (importTextLabels) {
    for (const anchor of textAnchors) {
      if (!anchor.text.trim()) continue;
      if (!canPush()) break;
      const fontSize = Math.max(7, Math.min(36, Math.round(anchor.fontSize * 10) / 10));
      annotations.push({
        id: nextId(),
        type: 'textbox',
        ...(options.pageId ? { pageId: options.pageId } : {}),
        pageNumber,
        rect: {
          x: anchor.x,
          y: anchor.y,
          width: Math.max(24, anchor.width + 8),
          height: Math.max(16, anchor.height + 4),
        },
        data: {
          text: anchor.text.trim(),
          fontSize,
          textColor: '#111827',
          backgroundColor: 'transparent',
          borderStyle: 'none',
          autoSize: true,
          importedFromPdfVector: true,
          ...(Math.abs(anchor.angleRad) > 0.05
            ? { rotation: Math.round((anchor.angleRad * 180) / Math.PI) }
            : {}),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      stats.labelsCreated += 1;
    }
  }

  return { annotations, stats };
}

function distPointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;
  return Math.hypot(p.x - projX, p.y - projY);
}

const PIPING_TAG_PATTERN = /(?:^\s*\/|\b\d{1,3}\s*["']\s*[-_/]|\bDN\s*\d+|\b(?:LINE|PIPE|BR|RUN)[-_ ]?\d+)/i;

/**
 * Associates nearby PDF text labels (e.g. `4"-P-101-CS`, `/LINE-1001/B1`) with the closest
 * imported linear / polyline pipe run so 3D Piping and CAESAR II XML carry branch identifiers.
 */
export function attachNearbyBranchLabels(
  annotations: PdfAnnotation[],
  textAnchors: readonly CadTextAnchor[],
  maxDistancePt = 36,
): { annotations: PdfAnnotation[]; attachedCount: number } {
  if (annotations.length === 0 || textAnchors.length === 0) {
    return { annotations, attachedCount: 0 };
  }

  const candidateIndexes: number[] = [];
  const verticesByIndex = new Map<number, Point2D[]>();
  for (let i = 0; i < annotations.length; i += 1) {
    const ann = annotations[i];
    if (ann.type === 'perimeter-takeoff' || ann.type === 'line') {
      const verts = getAnnotationPageVertices(ann);
      if (verts.length >= 2) {
        candidateIndexes.push(i);
        verticesByIndex.set(i, verts);
      }
    }
  }

  if (candidateIndexes.length === 0) {
    return { annotations, attachedCount: 0 };
  }

  // Score (annIndex, anchorIndex) pairs and greedily match best tag -> segment pairs
  interface MatchCandidate {
    annIdx: number;
    anchorText: string;
    score: number;
  }

  const matches: MatchCandidate[] = [];
  for (const anchor of textAnchors) {
    const text = anchor.text.trim();
    if (text.length < 2 || text.length > 64) continue;
    const center: Point2D = {
      x: anchor.x + anchor.width / 2,
      y: anchor.y + anchor.height / 2,
    };
    const isTagLike = PIPING_TAG_PATTERN.test(text);

    for (const annIdx of candidateIndexes) {
      const verts = verticesByIndex.get(annIdx)!;
      let minDist = Infinity;
      for (let s = 0; s < verts.length - 1; s += 1) {
        const d = distPointToSegment(center, verts[s], verts[s + 1]);
        if (d < minDist) minDist = d;
      }
      if (minDist <= maxDistancePt) {
        // Piping-tag-looking strings get a 12pt scoring bonus over generic callout text
        const score = minDist - (isTagLike ? 12 : 0);
        matches.push({ annIdx, anchorText: text, score });
      }
    }
  }

  matches.sort((a, b) => a.score - b.score);

  const nextAnnotations = [...annotations];
  const labeledIndices = new Set<number>();
  let attachedCount = 0;

  for (const match of matches) {
    if (labeledIndices.has(match.annIdx)) continue;
    labeledIndices.add(match.annIdx);
    const prev = nextAnnotations[match.annIdx];
    nextAnnotations[match.annIdx] = {
      ...prev,
      data: {
        ...prev.data,
        ...(prev.data.branchName ? {} : { branchName: match.anchorText }),
        ...(prev.data.text ? {} : { text: match.anchorText }),
      },
    };
    attachedCount += 1;
  }

  return { annotations: nextAnnotations, attachedCount };
}
