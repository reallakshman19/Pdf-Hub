/**
 * CAD Geometry & Vector Harvesting Domain Types (Phase O)
 *
 * Pure TypeScript domain models for extracting, normalizing, and topology-graphing
 * vector paths directly from raw PDF content streams (lines, arcs, polylines, closed loops).
 *
 * Invariant INV-4 compliant: strictly decoupled from third-party renderers or DOM libraries.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * 2D Affine Transformation Matrix [a, b, c, d, e, f]
 * Corresponds to standard PDF CTM:
 *   [x', y', 1] = [x, y, 1] * [ [a, b, 0], [c, d, 0], [e, f, 1] ]
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export type AffineMatrix2D = [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

export type CadPathPaintingOp =
  | 'stroke'
  | 'fill'
  | 'fill-even-odd'
  | 'fill-and-stroke'
  | 'fill-and-stroke-even-odd'
  | 'clip-only';

export interface CadLineSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  length: number;
  strokeColor?: string;
  strokeWidth?: number;
  dashArray?: number[];
  dashPhase?: number;
  layerName?: string;
}

export interface CadCubicBezier {
  id: string;
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  strokeColor?: string;
  strokeWidth?: number;
  dashArray?: number[];
  layerName?: string;
}

export interface CadRectPrimitive {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  layerName?: string;
}

export interface CadArcPrimitive {
  id: string;
  center: Point2D;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  isCounterClockwise: boolean;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface CadPathSubpath {
  points: Point2D[];
  isClosed: boolean;
  operations: Array<
    | { type: 'move'; point: Point2D }
    | { type: 'line'; point: Point2D }
    | { type: 'curve'; p1: Point2D; p2: Point2D; p3: Point2D }
    | { type: 'close' }
  >;
}

export interface CadHarvestedPath {
  id: string;
  subpaths: CadPathSubpath[];
  paintingOp: CadPathPaintingOp;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth: number;
  dashArray?: number[];
  dashPhase?: number;
}

export interface CadHarvestedPageGeometry {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  lines: CadLineSegment[];
  beziers: CadCubicBezier[];
  rectangles: CadRectPrimitive[];
  paths: CadHarvestedPath[];
  totalExtractedSegments: number;
}

export interface GeometryCleanOptions {
  snapEpsilon?: number; // Distance in points below which endpoints snap together (default: 0.5)
  collinearAngleToleranceRad?: number; // Angular tolerance for collinear merge (default: ~1 deg / 0.0175 rad)
  arcFitMaxError?: number; // Max deviation in points to classify a cubic curve as an arc (default: 0.5)
}

export interface CadNormalizedGeometry {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  lines: CadLineSegment[];
  arcs: CadArcPrimitive[];
  beziers: CadCubicBezier[];
  rectangles: CadRectPrimitive[];
  totalPrimitives: number;
}

export interface DcelVertex {
  id: string;
  point: Point2D;
  incidentEdgeId?: string;
}

export interface DcelHalfEdge {
  id: string;
  originId: string;
  targetId: string;
  twinId: string;
  nextId: string;
  prevId: string;
  angle: number; // Azimuth angle [-pi, pi]
  sourceSegmentId?: string;
}

export interface DcelFace {
  id: string;
  halfEdgeIds: string[];
  vertices: Point2D[];
  signedArea: number;
  isUnbounded: boolean;
}

export interface CadClosedLoop {
  id: string;
  vertices: Point2D[];
  area: number;
  perimeter: number;
  centroid: Point2D;
  isClockwise: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  edgeIds: string[];
}

export interface CadTextAnchor {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  angleRad: number;
}

export interface CadVectorExtractOptions {
  /** Optional ROI bounding box in view space (points) to scope extraction. */
  regionRect?: { x: number; y: number; width: number; height: number };
  /** Optional OCG CAD layer names to include (if omitted, includes all visible layers). */
  includeLayers?: string[];
  /** Minimum segment length in view-space points below which noise micro-strokes are dropped. */
  minSegmentLength?: number;
  /** Whether to retain filled-without-stroke paths (often CAD hatches/solid fills). Defaults to true. */
  includeFillOnlyPaths?: boolean;
  /** Whether to extract positioned page text anchors. Defaults to true. */
  includeTextAnchors?: boolean;
}

export interface CadOperatorListInput {
  fnArray: ReadonlyArray<number>;
  argsArray: ReadonlyArray<unknown>;
  ops: Record<string, number>;
  /** Optional map of OCG ID -> human-readable CAD layer name. */
  ocgLayerNames?: Record<string, string>;
}

export interface CadPageVectorExtractResult {
  geometry: CadHarvestedPageGeometry;
  textAnchors: CadTextAnchor[];
  layersDetected: string[];
  imageXObjectCount: number;
  isRasterOnlyLikely: boolean;
  skippedOutOfRegionCount: number;
}
