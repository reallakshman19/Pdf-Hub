/**
 * CAD Grid Math & Polar Telemetry Engine.
 *
 * Provides high-precision O(1) grid snapping algorithms for Cartesian and
 * Isometric drafting lattices, angle locking for isoplanes, and real-time
 * polar tracking calculation.
 */

import type { Point2D, ScaleCalibration } from '../annotations/types';
import { pointsToRealDistance } from '../annotations/takeoffExport';
import type { IsoplaneMode, PolarCursorData } from './types';

export const DEFAULT_GRID_SPACING = 20;

/**
 * Snaps a 2D coordinate to the nearest orthogonal (Cartesian) grid intersection.
 */
export function snapToOrthogonalGrid(pt: Point2D, spacing: number = DEFAULT_GRID_SPACING): Point2D {
  if (spacing <= 0) return { ...pt };
  return {
    x: Math.round(pt.x / spacing) * spacing,
    y: Math.round(pt.y / spacing) * spacing,
  };
}

/**
 * Snaps a 2D coordinate to the nearest isometric grid intersection (30° / 90° / 150° lattice).
 *
 * In an isometric grid with spacing `s`:
 * - Horizontal step between staggered column lines: dxStep = s * (sqrt(3) / 2)
 * - Vertical step along column lines: dyStep = s
 * - Alternate columns are offset vertically by s / 2.
 */
export function snapToIsometricGrid(
  pt: Point2D,
  spacing: number = DEFAULT_GRID_SPACING,
): Point2D {
  // Lattice points are the same for every isoplane; the isoplane only
  // constrains drafting direction (ortho/polar), not grid snapping.
  if (spacing <= 0) return { ...pt };

  const dxStep = spacing * (Math.sqrt(3) / 2);

  // Check the two candidate columns surrounding pt.x
  const colIndex0 = Math.floor(pt.x / dxStep);
  const colIndex1 = colIndex0 + 1;

  let bestPoint: Point2D = { x: pt.x, y: pt.y };
  let bestDistSq = Infinity;

  for (const col of [colIndex0, colIndex1]) {
    const colX = col * dxStep;
    const yOffset = Math.abs(col) % 2 === 1 ? spacing / 2 : 0;
    const row = Math.round((pt.y - yOffset) / spacing);
    const colY = row * spacing + yOffset;

    const dSq = (pt.x - colX) ** 2 + (pt.y - colY) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestPoint = {
        x: Math.round(colX * 1000) / 1000,
        y: Math.round(colY * 1000) / 1000,
      };
    }
  }

  return bestPoint;
}

/**
 * Standard isometric axis angles (in degrees, drafting coordinate system: +Y up, 0° East).
 */
export const ISOPLANE_ANGLES_DEG: Record<IsoplaneMode, number[]> = {
  all: [30, 90, 150, 210, 270, 330],
  top: [30, 150, 210, 330], // Horizontal isometric plane (axes 1 & 2)
  right: [30, 90, 210, 270], // Vertical right plane (axes 1 & 3)
  left: [90, 150, 270, 330], // Vertical left plane (axes 2 & 3)
};

/**
 * Constrains target point relative to origin to the angles permitted by the current isoplane.
 */
export function constrainAngleToIsoplane(
  origin: Point2D,
  target: Point2D,
  isoplane: IsoplaneMode = 'all',
): Point2D {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) return { ...target };

  // Screen coordinates: +Y is downward, so atan2(dy, dx) has +dy down.
  const angleRad = Math.atan2(dy, dx);
  const permittedDeg = ISOPLANE_ANGLES_DEG[isoplane] ?? ISOPLANE_ANGLES_DEG.all;
  // Convert permitted drafting angles (+Y up) to screen radians (+Y down):
  // Screen angle = -draftingAngle
  const permittedScreenRad = permittedDeg.map((deg) => ((-deg * Math.PI) / 180));

  let closestRad = permittedScreenRad[0];
  let minDiff = Infinity;

  for (const pRad of permittedScreenRad) {
    let diff = Math.abs(angleRad - pRad);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < minDiff) {
      minDiff = diff;
      closestRad = pRad;
    }
  }

  return {
    x: Math.round((origin.x + length * Math.cos(closestRad)) * 1000) / 1000,
    y: Math.round((origin.y + length * Math.sin(closestRad)) * 1000) / 1000,
  };
}

/**
 * Computes polar tracking telemetry (length, drafting angle, deltas, axis tags)
 * between origin and cursor target.
 */
export function computePolarTracking(
  origin: Point2D,
  target: Point2D,
  calibration?: ScaleCalibration,
): PolarCursorData {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const lengthPoints = Math.hypot(dx, dy);

  // In CAD drafting: 0° is East, 90° is North (Up), 180° is West, 270° is South (Down).
  // Screen coordinates have +Y down, so dyCad = -dy.
  const dyCad = -dy;
  let angleDeg = (Math.atan2(dyCad, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  angleDeg = Math.round(angleDeg * 10) / 10;
  if (angleDeg >= 360 || Object.is(angleDeg, -0) || angleDeg === 0) angleDeg = 0;

  const lengthReal = calibration ? pointsToRealDistance(lengthPoints, calibration) : lengthPoints;
  const deltaXReal = calibration ? pointsToRealDistance(Math.abs(dx), calibration) : Math.abs(dx);
  const deltaYReal = calibration ? pointsToRealDistance(Math.abs(dy), calibration) : Math.abs(dy);
  const unit = calibration?.unit ?? 'pt';

  // Check axis proximity within 1.5°
  const tolerance = 1.5;
  const isAngleNear = (targetDeg: number) => {
    const diff = Math.abs(angleDeg - targetDeg);
    return diff <= tolerance || diff >= 360 - tolerance;
  };

  let axisLabel: string | undefined;
  let isIsometricAxis = false;
  let isOrthoAxis = false;

  if (isAngleNear(30)) {
    axisLabel = 'ISO East (+30°)';
    isIsometricAxis = true;
  } else if (isAngleNear(90)) {
    axisLabel = 'ISO Up (+90°)';
    isIsometricAxis = true;
    isOrthoAxis = true;
  } else if (isAngleNear(150)) {
    axisLabel = 'ISO North (+150°)';
    isIsometricAxis = true;
  } else if (isAngleNear(210)) {
    axisLabel = 'ISO South (-150°)';
    isIsometricAxis = true;
  } else if (isAngleNear(270)) {
    axisLabel = 'ISO Down (-90°)';
    isIsometricAxis = true;
    isOrthoAxis = true;
  } else if (isAngleNear(330)) {
    axisLabel = 'ISO West (-30°)';
    isIsometricAxis = true;
  } else if (isAngleNear(0) || isAngleNear(360)) {
    axisLabel = 'East (0°)';
    isOrthoAxis = true;
  } else if (isAngleNear(180)) {
    axisLabel = 'West (180°)';
    isOrthoAxis = true;
  }

  const formattedLength =
    calibration && calibration.precision !== undefined
      ? `${lengthReal.toFixed(calibration.precision)} ${unit}`
      : `${lengthReal.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;

  const formattedAngle = `∠ ${angleDeg.toFixed(1)}°`;

  return {
    lengthPoints: Math.round(lengthPoints * 100) / 100,
    lengthReal: Math.round(lengthReal * 100) / 100,
    unit,
    formattedLength,
    angleDeg,
    formattedAngle,
    deltaXPoints: Math.round(dx * 100) / 100,
    deltaYPoints: Math.round(dy * 100) / 100,
    deltaXReal: Math.round(deltaXReal * 100) / 100,
    deltaYReal: Math.round(deltaYReal * 100) / 100,
    axisLabel,
    isIsometricAxis,
    isOrthoAxis,
  };
}
