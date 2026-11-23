/**
 * CAD Quantity Takeoff & Summary Export Engine.
 *
 * Implements cumulative material takeoff, linear piping/conduit length aggregation,
 * boundary area takeoff, and CSV export for engineering drawings.
 */

import type { PdfAnnotation, AnnotationType } from './types';
import {
  DEFAULT_SCALE_CALIBRATION,
  type ScaleCalibration,
} from './calibration';

export interface TakeoffGroup {
  type: AnnotationType;
  label: string;
  count: number;
  totalLengthReal: number;
  totalAreaReal: number;
  unit: string;
  pages: number[];
}

export interface TakeoffSummary {
  groups: TakeoffGroup[];
  totalItemCount: number;
  totalLinearLength: number;
  totalArea: number;
  unit: string;
}

/**
 * Converts a linear distance in PDF points to real-world units based on calibration.
 */
export function pointsToRealDistance(
  distPt: number,
  calibration: ScaleCalibration = DEFAULT_SCALE_CALIBRATION,
): number {
  const sheetMm = (distPt / 72) * 25.4;
  const realMm = sheetMm * calibration.scaleRatio;

  switch (calibration.unit) {
    case 'mm':
      return realMm;
    case 'cm':
      return realMm / 10;
    case 'm':
      return realMm / 1000;
    case 'in':
      return realMm / 25.4;
    case 'ft':
      return realMm / 304.8;
    default:
      return realMm;
  }
}

/**
 * Converts an area in PDF square points to real-world square units.
 */
export function pointsToRealArea(
  areaPt2: number,
  calibration: ScaleCalibration = DEFAULT_SCALE_CALIBRATION,
): number {
  // Convert 1 pt to sheet mm
  const ptToSheetMm = 25.4 / 72;
  const realMmPerPt = ptToSheetMm * calibration.scaleRatio;
  const areaMm2 = areaPt2 * (realMmPerPt * realMmPerPt);

  switch (calibration.unit) {
    case 'mm':
      return areaMm2;
    case 'cm':
      return areaMm2 / 100;
    case 'm':
      return areaMm2 / 1_000_000;
    case 'in':
      return areaMm2 / (25.4 * 25.4);
    case 'ft':
      return areaMm2 / (304.8 * 304.8);
    default:
      return areaMm2;
  }
}

/**
 * Computes linear length of an annotation in PDF points.
 */
export function getAnnotationLinearPoints(annotation: PdfAnnotation): number {
  const rawPoints = (annotation.data?.points as number[]) ?? [];
  if (Array.isArray(rawPoints) && rawPoints.length >= 4) {
    let totalDist = 0;
    for (let i = 0; i < rawPoints.length - 2; i += 2) {
      const dx = rawPoints[i + 2] - rawPoints[i];
      const dy = rawPoints[i + 3] - rawPoints[i + 1];
      totalDist += Math.hypot(dx, dy);
    }
    return totalDist;
  }

  if (annotation.type === 'line' || annotation.type === 'arrow') {
    return Math.hypot(annotation.rect.width, annotation.rect.height);
  }

  return 0;
}

/**
 * Computes polygon or rectangle area in PDF square points.
 */
export function getAnnotationAreaPoints(annotation: PdfAnnotation): number {
  const rawPoints = (annotation.data?.points as number[]) ?? [];
  if (Array.isArray(rawPoints) && rawPoints.length >= 6) {
    // Shoelace formula for polygon area
    let area = 0;
    const n = rawPoints.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = rawPoints[i * 2];
      const y1 = rawPoints[i * 2 + 1];
      const nextIdx = (i + 1) % n;
      const x2 = rawPoints[nextIdx * 2];
      const y2 = rawPoints[nextIdx * 2 + 1];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  if (annotation.type === 'shape-rect' || annotation.type === 'redaction') {
    return Math.max(0, annotation.rect.width) * Math.max(0, annotation.rect.height);
  }

  if (annotation.type === 'shape-ellipse') {
    const rx = Math.max(0, annotation.rect.width) / 2;
    const ry = Math.max(0, annotation.rect.height) / 2;
    return Math.PI * rx * ry;
  }

  return 0;
}

/**
 * Extracts a descriptive label for an annotation (text, comment, or type name).
 */
export function getAnnotationLabel(annotation: PdfAnnotation): string {
  const text = (annotation.data?.text as string) || (annotation.data?.content as string) || '';
  if (text.trim().length > 0) {
    // Single-line sanitized label
    return text.replace(/[\r\n]+/g, ' ').trim();
  }
  return annotation.type;
}

/**
 * Aggregates annotations into a Takeoff Summary with real-world dimensions and counts.
 */
export function computeTakeoffSummary(
  annotations: PdfAnnotation[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
): TakeoffSummary {
  const groupMap = new Map<string, TakeoffGroup>();
  let totalItemCount = 0;
  let totalLinearLength = 0;
  let totalArea = 0;
  let defaultUnit = 'mm';

  for (const ann of annotations) {
    totalItemCount++;
    const cal = getCalibration(ann.pageNumber);
    defaultUnit = cal.unit;

    const label = getAnnotationLabel(ann);
    const key = `${ann.type}::${label}::${cal.unit}`;

    const lengthPt = getAnnotationLinearPoints(ann);
    const areaPt = getAnnotationAreaPoints(ann);

    const lengthReal = lengthPt > 0 ? pointsToRealDistance(lengthPt, cal) : 0;
    const areaReal = areaPt > 0 ? pointsToRealArea(areaPt, cal) : 0;

    totalLinearLength += lengthReal;
    totalArea += areaReal;

    const existing = groupMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalLengthReal += lengthReal;
      existing.totalAreaReal += areaReal;
      if (!existing.pages.includes(ann.pageNumber)) {
        existing.pages.push(ann.pageNumber);
        existing.pages.sort((a, b) => a - b);
      }
    } else {
      groupMap.set(key, {
        type: ann.type,
        label,
        count: 1,
        totalLengthReal: lengthReal,
        totalAreaReal: areaReal,
        unit: cal.unit,
        pages: [ann.pageNumber],
      });
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.label.localeCompare(b.label);
  });

  return {
    groups,
    totalItemCount,
    totalLinearLength: Math.round(totalLinearLength * 100) / 100,
    totalArea: Math.round(totalArea * 100) / 100,
    unit: defaultUnit,
  };
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a Takeoff Summary into standard CSV format.
 */
export function generateTakeoffCsv(summary: TakeoffSummary): string {
  const headers = ['Type', 'Label / Description', 'Count', 'Total Length', 'Total Area', 'Unit', 'Pages'];
  const rows: string[] = [headers.join(',')];

  for (const group of summary.groups) {
    const lengthStr = group.totalLengthReal > 0 ? group.totalLengthReal.toFixed(2) : '-';
    const areaStr = group.totalAreaReal > 0 ? group.totalAreaReal.toFixed(2) : '-';
    const pagesStr = group.pages.join(';');

    rows.push(
      [
        escapeCsvField(group.type),
        escapeCsvField(group.label),
        escapeCsvField(group.count),
        escapeCsvField(lengthStr),
        escapeCsvField(areaStr),
        escapeCsvField(group.unit),
        escapeCsvField(pagesStr),
      ].join(','),
    );
  }

  // Summary Row
  rows.push('');
  rows.push(
    [
      'TOTAL',
      'All Annotations',
      escapeCsvField(summary.totalItemCount),
      escapeCsvField(summary.totalLinearLength > 0 ? summary.totalLinearLength.toFixed(2) : '-'),
      escapeCsvField(summary.totalArea > 0 ? summary.totalArea.toFixed(2) : '-'),
      escapeCsvField(summary.unit),
      '',
    ].join(','),
  );

  return rows.join('\r\n');
}
