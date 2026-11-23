import type { Point2D } from './types';

export type DimensionUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface ScaleCalibration {
  scaleRatio: number; // e.g. 100 for 1:100 scale (1 mm on sheet = 100 mm real world)
  unit: DimensionUnit;
  precision: number;
}

export const DEFAULT_SCALE_CALIBRATION: ScaleCalibration = {
  scaleRatio: 100,
  unit: 'mm',
  precision: 0,
};

export const STANDARD_CALIBRATION_PRESETS: Array<{
  label: string;
  scaleRatio: number;
  unit: DimensionUnit;
  precision: number;
}> = [
  { label: '1:1 (Full Scale)', scaleRatio: 1, unit: 'mm', precision: 1 },
  { label: '1:10 (Detail Section)', scaleRatio: 10, unit: 'mm', precision: 1 },
  { label: '1:20 (Section)', scaleRatio: 20, unit: 'mm', precision: 0 },
  { label: '1:50 (Piping / Structural)', scaleRatio: 50, unit: 'mm', precision: 0 },
  { label: '1:100 (Standard CAD Sheet)', scaleRatio: 100, unit: 'mm', precision: 0 },
  { label: '1:200 (Site Layout)', scaleRatio: 200, unit: 'mm', precision: 0 },
  { label: '1:500 (Civil / Plot Plan)', scaleRatio: 500, unit: 'm', precision: 1 },
  { label: '1/4" = 1\'-0" (Architectural 1:48)', scaleRatio: 48, unit: 'ft', precision: 1 },
  { label: '1/8" = 1\'-0" (Architectural 1:96)', scaleRatio: 96, unit: 'ft', precision: 1 },
];

/**
 * Calculates real-world dimension length in specified units from two PDF points.
 * Standard PDF points: 72 points = 1 inch = 25.4 millimeters.
 */
export function computeRealWorldDistance(
  p1: Point2D,
  p2: Point2D,
  calibration: ScaleCalibration = DEFAULT_SCALE_CALIBRATION,
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distPt = Math.hypot(dx, dy);

  // Convert points (1/72 in) to millimeters
  const sheetMm = (distPt / 72) * 25.4;
  const realWorldMm = sheetMm * calibration.scaleRatio;

  switch (calibration.unit) {
    case 'mm':
      return realWorldMm;
    case 'cm':
      return realWorldMm / 10;
    case 'm':
      return realWorldMm / 1000;
    case 'in':
      return realWorldMm / 25.4;
    case 'ft':
      return realWorldMm / 304.8;
    default:
      return realWorldMm;
  }
}

/**
 * Formats dimension distance into an engineering label string (e.g. "2200 mm", "4.5 m").
 */
export function formatDimensionLabel(
  p1: Point2D,
  p2: Point2D,
  calibration: ScaleCalibration = DEFAULT_SCALE_CALIBRATION,
): string {
  const val = computeRealWorldDistance(p1, p2, calibration);
  const rounded = Number(val.toFixed(calibration.precision));
  return `${rounded.toLocaleString()} ${calibration.unit}`;
}

/**
 * Calibrates scale ratio from a known real-world distance between two measured points.
 */
export function calibrateScaleFromPoints(
  p1: Point2D,
  p2: Point2D,
  knownRealWorldDistance: number,
  unit: DimensionUnit,
): ScaleCalibration {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distPt = Math.hypot(dx, dy);
  const sheetMm = (distPt / 72) * 25.4;

  let knownMm = knownRealWorldDistance;
  if (unit === 'cm') knownMm = knownRealWorldDistance * 10;
  else if (unit === 'm') knownMm = knownRealWorldDistance * 1000;
  else if (unit === 'in') knownMm = knownRealWorldDistance * 25.4;
  else if (unit === 'ft') knownMm = knownRealWorldDistance * 304.8;

  const scaleRatio = sheetMm > 0 ? Math.round(knownMm / sheetMm) : 100;
  return {
    scaleRatio: Math.max(1, scaleRatio),
    unit,
    precision: unit === 'm' || unit === 'ft' ? 2 : 0,
  };
}

/**
 * Computes real-world area from polygon vertices in PDF points using the Shoelace formula.
 */
export function computePolygonArea(
  vertices: Point2D[],
  calibration: ScaleCalibration = DEFAULT_SCALE_CALIBRATION,
): number {
  const n = vertices.length;
  if (n < 3) return 0;

  let shoelace = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    shoelace += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const areaPts = Math.abs(shoelace) / 2;

  // Linear scaling factor: 1 pt on sheet -> real world mm
  const mmPerPt = (25.4 / 72) * calibration.scaleRatio;
  const areaMm2 = areaPts * mmPerPt * mmPerPt;

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
      return areaMm2 / 1_000_000;
  }
}

/**
 * Computes polygon visual centroid for positioning measurement badges.
 */
export function computeCentroid(vertices: Point2D[]): Point2D {
  const n = vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { ...vertices[0] };
  if (n === 2) return { x: (vertices[0].x + vertices[1].x) / 2, y: (vertices[0].y + vertices[1].y) / 2 };

  let shoelace = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const factor = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    shoelace += factor;
    cx += (vertices[i].x + vertices[j].x) * factor;
    cy += (vertices[i].y + vertices[j].y) * factor;
  }

  const area = shoelace / 2;
  if (Math.abs(area) < 1e-4) {
    // Degenerate collinear polygon, return average
    const avgX = vertices.reduce((sum, v) => sum + v.x, 0) / n;
    const avgY = vertices.reduce((sum, v) => sum + v.y, 0) / n;
    return { x: avgX, y: avgY };
  }

  return {
    x: cx / (6 * area),
    y: cy / (6 * area),
  };
}

/**
 * Formats area into a human-readable engineering takeoff badge (e.g. "45.2 m²", "1,250 sq ft").
 */
export function formatAreaLabel(
  area: number,
  unit: DimensionUnit,
  precision?: number,
): string {
  const defaultPrec = unit === 'm' || unit === 'ft' ? 1 : 0;
  const prec = precision !== undefined ? precision : defaultPrec;
  const rounded = Number(area.toFixed(prec));

  let unitSuffix = 'm²';
  if (unit === 'mm') unitSuffix = 'mm²';
  else if (unit === 'cm') unitSuffix = 'cm²';
  else if (unit === 'in') unitSuffix = 'sq in';
  else if (unit === 'ft') unitSuffix = 'sq ft';

  return `${rounded.toLocaleString()} ${unitSuffix}`;
}

