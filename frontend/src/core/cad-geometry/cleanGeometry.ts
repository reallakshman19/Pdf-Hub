import type {
  CadArcPrimitive,
  CadCubicBezier,
  CadHarvestedPageGeometry,
  CadLineSegment,
  CadNormalizedGeometry,
  GeometryCleanOptions,
} from './types';
import { snapLineEndpoints } from './spatialSnap';
import { mergeCollinearSegments } from './collinearMerge';
import { fitArcToBezier } from './arcFitting';

export interface CleanGeometryResult extends CadNormalizedGeometry {
  snappedVertexCount: number;
  droppedDegenerateCount: number;
  mergedCollinearCount: number;
  fittedArcCount: number;
}

/**
 * Normalizes raw harvested page geometry into high-fidelity CAD primitives:
 * 1. Snaps endpoints of near-coincident lines within `snapEpsilon` tolerance.
 * 2. Merges connected collinear line segments sharing identical styling.
 * 3. Classifies cubic Beziers into circular arcs or retains them as general curves.
 * 4. Discards degenerate micro-segments.
 */
export function cleanAndNormalizeGeometry(
  raw: CadHarvestedPageGeometry,
  options: GeometryCleanOptions = {},
): CleanGeometryResult {
  const snapEpsilon = options.snapEpsilon ?? 0.5;
  const collinearAngleTol = options.collinearAngleToleranceRad ?? 0.0175;
  const arcFitMaxError = options.arcFitMaxError ?? 0.5;

  // 1. Spatial Endpoint Snapping
  const snapRes = snapLineEndpoints(raw.lines, snapEpsilon);

  // 2. Collinear Segment Merging
  const mergeRes = mergeCollinearSegments(snapRes.lines, {
    angleToleranceRad: collinearAngleTol,
  });

  // 3. Bezier Arc Fitting & Classification
  const fittedArcs: CadArcPrimitive[] = [];
  const remainingBeziers: CadCubicBezier[] = [];

  for (const b of raw.beziers) {
    const arc = fitArcToBezier(b, { maxError: arcFitMaxError });
    if (arc) {
      fittedArcs.push(arc);
    } else {
      remainingBeziers.push({ ...b });
    }
  }

  const lines: CadLineSegment[] = mergeRes.lines;
  const rectangles = [...raw.rectangles];

  const totalPrimitives =
    lines.length + fittedArcs.length + remainingBeziers.length + rectangles.length;

  return {
    pageNumber: raw.pageNumber,
    pageWidth: raw.pageWidth,
    pageHeight: raw.pageHeight,
    lines,
    arcs: fittedArcs,
    beziers: remainingBeziers,
    rectangles,
    totalPrimitives,
    snappedVertexCount: snapRes.snappedVertexCount,
    droppedDegenerateCount: snapRes.droppedDegenerateCount,
    mergedCollinearCount: mergeRes.mergedCount,
    fittedArcCount: fittedArcs.length,
  };
}
