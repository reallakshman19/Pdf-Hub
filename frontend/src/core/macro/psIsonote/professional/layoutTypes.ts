import { type Point, type Rect, type ProfessionalCalloutModel } from './model';

/**
 * Ten deterministic placement classes:
 * Eight local cardinal/ordinal orientations around the anchor, plus two edge margin fallbacks.
 */
export type PlacementClass =
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'top-left'
  | 'margin-right'
  | 'margin-left';

export type ObstacleType = 'hard' | 'soft';

export type HardObstacleSource = 'page-boundary' | 'title-block' | 'callout-box' | 'leader-line';
export type SoftObstacleSource = 'drawing-density' | 'existing-text';

export interface Obstacle {
  id: string;
  type: ObstacleType;
  source: HardObstacleSource | SoftObstacleSource | string;
  rect: Rect;
  weight?: number; // Penalty weight for soft obstacles
}

export interface LayoutDiagnostic {
  type: 'hard-collision' | 'text-overlap' | 'drawing-density';
  source: string;
  message: string;
  penalty: number;
}

export interface PlacementCandidate {
  placementClass: PlacementClass;
  box: Rect;
  leaderStart: Point;
  leaderEnd: Point;
  score: number;
  diagnostics: LayoutDiagnostic[];
  isValid: boolean;
}

export interface OccurrenceInput {
  id: string;
  psNo: string;
  tag: string;
  note: string;
  confidence: string;
  targetPoint: Point;
  pageNumber: number;
  preferredWidth?: number;
}

export interface LayoutResultItem {
  occurrenceId: string;
  status: 'placed' | 'unplaceable';
  placementClass?: PlacementClass;
  callout?: ProfessionalCalloutModel;
  diagnostics: LayoutDiagnostic[];
}

export interface PageLayoutSolution {
  pageNumber: number;
  results: LayoutResultItem[];
  totalScore: number;
  unplaceableCount: number;
}

export interface PageLayoutOptions {
  pageWidth: number;
  pageHeight: number;
  pageMargin?: number;
  titleBlockRect?: Rect;
  obstacles?: Obstacle[];
  beamWidth?: number;
}
