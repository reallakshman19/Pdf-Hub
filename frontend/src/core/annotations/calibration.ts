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
