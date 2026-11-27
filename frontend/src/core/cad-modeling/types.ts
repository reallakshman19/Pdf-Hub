import type { Point2D } from '../cad-geometry/types';

export type CadToolMode =
  | 'select'
  | 'pan'
  | 'line'
  | 'polyline'
  | 'rectangle'
  | 'circle'
  | 'callout'
  | 'extrude_preview';

export type CadSnapType = 'endpoint' | 'midpoint' | 'center' | 'grid' | 'intersection';

export type Cad3DViewMode = 'shaded' | 'wireframe' | 'xray';

export type Piping3DRenderMode = 'wireframe' | 'volumetric';

export interface CadDraftingSettings {
  gridVisible: boolean;
  gridSnapEnabled: boolean;
  gridSpacing: number; // in points (default: 10)
  orthoEnabled: boolean; // constrain movement to 0, 90, 180, 270 deg
  polarTrackingEnabled: boolean;
  polarAngleStepDeg: number; // e.g. 15, 30, 45, 90 deg
  objectSnapEnabled: boolean;
  objectSnapTolerance: number; // in points (default: 8)
}

export interface CadLiveCursorTelemetry {
  screenCoords: Point2D | null;
  worldCoords: Point2D | null;
  activeAnchor: Point2D | null;
  activeLength: number | null;
  activeAngleDeg: number | null;
  snappedPoint: Point2D | null;
  activeSnapType: CadSnapType | null;
}

export interface Cad3DDockSettings {
  isOpen: boolean;
  selectedLoopId: string | null;
  extrudeDepth: number; // in points (default: 20)
  bevelSize: number; // in points (default: 2)
  viewMode: Cad3DViewMode;
  wireframeColor: string;
  shadedColor: string;
}
