/**
 * CAD Grid & Polar Tracking Domain Types.
 *
 * Implements architectural and piping drafting grid geometries:
 * - Orthogonal (Cartesian X-Y) grid
 * - Isometric (30° / 90° / 150°) triangular/hexagonal grid
 * - Isoplane constraints (Top, Left, Right, All)
 * - Polar cursor tracking telemetry
 */

import type { Point2D } from '../annotations/types';

export type CadGridMode = 'none' | 'ortho' | 'isometric';

export type IsoplaneMode = 'all' | 'top' | 'left' | 'right';

export interface CadGridConfig {
  mode: CadGridMode;
  isoplane: IsoplaneMode;
  spacing: number;
  snapEnabled: boolean;
}

export interface PolarCursorData {
  lengthPoints: number;
  lengthReal: number;
  unit: string;
  formattedLength: string;
  angleDeg: number;
  formattedAngle: string;
  deltaXPoints: number;
  deltaYPoints: number;
  deltaXReal: number;
  deltaYReal: number;
  axisLabel?: string;
  isIsometricAxis: boolean;
  isOrthoAxis: boolean;
}

export interface GridSnapResult {
  point: Point2D;
  distance: number;
  gridMode: CadGridMode;
  isoplane?: IsoplaneMode;
}
