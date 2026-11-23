/**
 * Pipeline Restraint / Support Exporter for XML Builder (CAESAR II / XML CII).
 *
 * Extracts piping supports (Anchors, Guides, Line Stops, +Y, Springs) and maps
 * them to the nearest node on the parent pipe centerline:
 *
 *   branchName\tnodeNumber\tnodeName\trestraintType\tgap\tstiffness\tfriction\tdirection
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { PdfAnnotation } from '../annotations/types';
import { pdfPointsToRealMm } from './pipelineCoordinateExport';
import {
  DEFAULT_SCALE_CALIBRATION,
  type ScaleCalibration,
} from '../annotations/calibration';
import type {
  PipelineCoordinateRow,
  PipelineRestraintRow,
  RestraintType,
} from './types';

/**
 * Checks if an annotation represents a piping support or restraint.
 */
export function isSupportAnnotation(ann: PdfAnnotation): boolean {
  if (ann.type === 'piping-support') return true;

  const data = ann.data;
  if (data?.restraintType) return true;

  const text = ((data?.text as string) || (data?.label as string) || '').toUpperCase();
  const supportKeywords = ['ANC', 'ANCHOR', 'GUIDE', 'LINE-STOP', 'LINE STOP', 'STOP', '+Y', '-Y', 'SPR', 'SPRING', 'REST'];

  return supportKeywords.some((kw) => text.includes(kw));
}

/**
 * Infers restraint type from text or annotation data.
 */
export function inferRestraintType(ann: PdfAnnotation): RestraintType {
  const custom = ann.data?.restraintType as RestraintType | undefined;
  if (custom) return custom;

  const text = ((ann.data?.text as string) || (ann.data?.label as string) || '').toUpperCase();
  if (text.includes('ANC')) return 'ANC';
  if (text.includes('GUIDE')) return 'GUIDE';
  if (text.includes('STOP')) return 'LINE-STOP';
  if (text.includes('+Y')) return '+Y';
  if (text.includes('-Y')) return '-Y';
  if (text.includes('SPR')) return 'SPR';

  return '+Y'; // default resting support
}

/**
 * Finds the nearest coordinate node to a given PDF point (x, y).
 */
export function findNearestCoordinateNode(
  sheetX: number,
  sheetY: number,
  pageNumber: number,
  coordinates: PipelineCoordinateRow[],
  scaleRatio: number,
): PipelineCoordinateRow | null {
  const pageCoords = coordinates.filter((c) => c.pageNumber === pageNumber);
  if (pageCoords.length === 0) return null;

  const realX = pdfPointsToRealMm(sheetX, scaleRatio);
  const realY = pdfPointsToRealMm(sheetY, scaleRatio);

  let closest: PipelineCoordinateRow | null = null;
  let minDistance = Infinity;

  for (const cr of pageCoords) {
    const dist = Math.hypot(cr.x - realX, cr.y - realY);
    if (dist < minDistance) {
      minDistance = dist;
      closest = cr;
    }
  }

  return closest;
}

/**
 * Extracts restraintRows by mapping support annotations to the closest pipe nodes.
 */
export function extractPipelineRestraints(
  annotations: PdfAnnotation[],
  coordinates: PipelineCoordinateRow[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
): PipelineRestraintRow[] {
  const rows: PipelineRestraintRow[] = [];
  const supportAnnotations = annotations.filter(isSupportAnnotation);

  for (const ann of supportAnnotations) {
    const cal = getCalibration(ann.pageNumber);
    const scaleRatio = cal.scaleRatio > 0 ? cal.scaleRatio : 100;

    // Anchor point from callout leader or center of rect
    let sheetX = ann.rect?.x ?? 0;
    let sheetY = ann.rect?.y ?? 0;
    if (ann.data?.anchor && typeof ann.data.anchor.x === 'number' && typeof ann.data.anchor.y === 'number') {
      sheetX = ann.data.anchor.x;
      sheetY = ann.data.anchor.y;
    } else if (ann.rect) {
      sheetX = ann.rect.x + (ann.rect.width ?? 0) / 2;
      sheetY = ann.rect.y + (ann.rect.height ?? 0) / 2;
    }

    const nearestNode = findNearestCoordinateNode(sheetX, sheetY, ann.pageNumber, coordinates, scaleRatio);
    if (!nearestNode) continue;

    const restraintType = inferRestraintType(ann);
    const nodeName =
      (ann.data?.nodeName as string) ||
      (ann.data?.label as string) ||
      `${restraintType}-${nearestNode.nodeNumber}`;

    const gap = typeof ann.data?.gap === 'number' ? ann.data.gap : undefined;
    const stiffness = typeof ann.data?.stiffness === 'number' ? ann.data.stiffness : undefined;
    const friction = typeof ann.data?.friction === 'number' ? ann.data.friction : (restraintType === '+Y' || restraintType === 'GUIDE' ? 0.3 : undefined);
    const direction = typeof ann.data?.direction === 'string' ? ann.data.direction : undefined;

    rows.push({
      branchName: nearestNode.branchName,
      nodeNumber: nearestNode.nodeNumber,
      nodeName,
      restraintType,
      gap,
      stiffness,
      friction,
      direction,
    });
  }

  return rows;
}

/**
 * Generates TSV text matching XML Builder > Restraints:
 *   branchName\tnodeNumber\tnodeName\trestraintType\tgap\tstiffness\tfriction\tdirection
 */
export function generateXmlBuilderRestraintTsv(rows: PipelineRestraintRow[]): string {
  const header = 'branchName\tnodeNumber\tnodeName\trestraintType\tgap\tstiffness\tfriction\tdirection';
  const lines = [header];

  for (const r of rows) {
    const gapStr = typeof r.gap === 'number' ? r.gap : '';
    const stfStr = typeof r.stiffness === 'number' ? r.stiffness : '';
    const fStr = typeof r.friction === 'number' ? r.friction : '';
    const dirStr = r.direction ?? '';
    lines.push(
      `${r.branchName}\t${r.nodeNumber}\t${r.nodeName}\t${r.restraintType}\t${gapStr}\t${stfStr}\t${fStr}\t${dirStr}`,
    );
  }

  return lines.join('\n');
}
