import type {
  Point,
  ProfessionalCalloutContent,
  ProfessionalCalloutModel,
  Rect,
  StyleContractInput,
} from './model';

/** Stable generation and tie-break order is exported by layoutEngine.ts. */
export type PlacementClass =
  | 'right'
  | 'top-right'
  | 'bottom-right'
  | 'top'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'bottom-left'
  | 'margin-right'
  | 'margin-left';

export type LeaderRouteKind =
  | 'direct'
  | 'one-elbow-hv'
  | 'one-elbow-vh'
  | 'two-elbow-hvh'
  | 'two-elbow-vhv';

export interface LeaderRoute {
  readonly kind: LeaderRouteKind;
  readonly points: readonly [Point, Point, ...Point[]];
  readonly length: number;
}

export type SegmentIntersectionKind = 'none' | 'touch' | 'cross' | 'overlap';
export type AffectedGeometry = 'box' | 'leader';
export type ObstaclePolicyMode = 'prohibited' | 'weighted';

export interface Obstacle {
  readonly id: string;
  readonly source: string;
  readonly rect: Rect;
}

export interface ObstaclePolicyRule {
  readonly mode: ObstaclePolicyMode;
  readonly boxPenalty: number;
  readonly leaderPenalty: number;
}

export interface ObstaclePolicy {
  readonly bySource: Readonly<Record<string, ObstaclePolicyRule>>;
}

export interface OccurrenceInput {
  readonly id: string;
  readonly psNo: string;
  readonly pageNumber: number;
  readonly content: ProfessionalCalloutContent;
  readonly targetPoint: Point;
  readonly preferredWidth?: number;
  readonly style: StyleContractInput;
}

export interface LayoutDiagnostic {
  readonly code:
    | 'page-boundary'
    | 'callout-box'
    | 'callout-leader'
    | 'obstacle-clash'
    | 'missing-obstacle-policy'
    | 'compromise-threshold';
  readonly message: string;
  readonly penalty: number;
  readonly obstacleId?: string;
  readonly source?: string;
  readonly geometry?: AffectedGeometry;
  readonly policyMode?: ObstaclePolicyMode;
  readonly intersection?: SegmentIntersectionKind;
}

export type CandidateOutcome = 'clear' | 'compromised' | 'rejected';

export interface CandidateAssessment {
  readonly placementClass: PlacementClass;
  readonly box: Rect;
  readonly route: LeaderRoute;
  readonly outcome: CandidateOutcome;
  readonly baseCost: number;
  readonly compromiseCost: number;
  readonly totalCost: number;
  readonly diagnostics: readonly LayoutDiagnostic[];
  readonly rejectionReasons: readonly string[];
}

export interface AttemptedCandidateSummary {
  readonly placementClass: PlacementClass;
  readonly routeKind: LeaderRouteKind;
  readonly routePoints: readonly Point[];
  readonly outcome: CandidateOutcome;
  readonly totalCost: number;
  readonly rejectionReasons: readonly string[];
}

interface SelectedLayoutResultBase {
  readonly occurrence: OccurrenceInput;
  readonly placementClass: PlacementClass;
  readonly box: Rect;
  readonly route: LeaderRoute;
  readonly assessment: CandidateAssessment;
  readonly callout: ProfessionalCalloutModel;
  readonly totalCost: number;
  readonly diagnostics: readonly LayoutDiagnostic[];
}

export interface ClearLayoutResult extends SelectedLayoutResultBase {
  readonly status: 'clear';
  readonly requiresReview: false;
}

export interface CompromisedLayoutResult extends SelectedLayoutResultBase {
  readonly status: 'compromised';
  readonly requiresReview: true;
}

export interface UnplaceableLayoutResult {
  readonly status: 'unplaceable';
  readonly requiresReview: true;
  readonly occurrence: OccurrenceInput;
  readonly attemptedCandidates: readonly AttemptedCandidateSummary[];
  readonly bestRejectedCandidate?: CandidateAssessment;
  readonly reasons: readonly string[];
  readonly diagnostics: readonly LayoutDiagnostic[];
  readonly totalCost: number;
}

export type SelectedLayoutResult = ClearLayoutResult | CompromisedLayoutResult;
export type LayoutResult = SelectedLayoutResult | UnplaceableLayoutResult;

export interface PageLayoutOptions {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly pageMargin?: number;
  readonly obstacles?: readonly Obstacle[];
  readonly obstaclePolicy: ObstaclePolicy;
  readonly compromiseThreshold: number;
  readonly beamWidth?: number;
}

export interface PageLayoutSolution {
  readonly pageNumber: number;
  readonly results: readonly LayoutResult[];
  readonly totalCost: number;
  readonly clearCount: number;
  readonly compromisedCount: number;
  readonly unplaceableCount: number;
}
