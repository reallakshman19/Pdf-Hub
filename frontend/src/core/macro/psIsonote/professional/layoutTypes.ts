import { type Point, type Rect, type ProfessionalCalloutModel } from './model';
import type { ObstacleKind } from '../../../annotation-core/page-scene';
import type { PlacementPolicy } from '../../../annotation-core/placement-policy';

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

export interface RectObstacle {
  id: string;
  kind?: 'rect';
  type: ObstacleType;
  /** Typed against canonical ObstacleKind union. Legacy string values still accepted for backward compat. */
  source: ObstacleKind | string;
  rect: Rect;
  weight?: number; // Penalty weight for soft obstacles
}

export interface SegmentObstacle {
  id: string;
  kind: 'segment';
  type: ObstacleType;
  /** Typed against canonical ObstacleKind union. Legacy string values still accepted for backward compat. */
  source: ObstacleKind | string;
  start: Point;
  end: Point;
  clearance: number;
  weight?: number;
}

export type Obstacle = RectObstacle | SegmentObstacle;

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
  leaderPoints?: readonly Point[];
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
  preferredPlacement?: PlacementClass;
}

export interface PlacedLayoutResult {
  status: 'placed';
  occurrenceId: string;
  occurrence: OccurrenceInput;
  placementClass: PlacementClass;
  callout: ProfessionalCalloutModel;
  diagnostics: readonly LayoutDiagnostic[];
}

export interface UnplaceableLayoutResult {
  status: 'unplaceable';
  occurrenceId: string;
  occurrence: OccurrenceInput;
  diagnostics: readonly LayoutDiagnostic[];
}

export type LayoutResultItem = PlacedLayoutResult | UnplaceableLayoutResult;

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
  /** ⚠️ If omitted, PIPING_ISO_PLACEMENT_POLICY is used as the default. */
  policy?: PlacementPolicy;
}
