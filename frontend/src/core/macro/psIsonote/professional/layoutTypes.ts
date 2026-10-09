import type {
  PdfPoint,
  PdfRect,
  PsIsonoteCalloutContent,
  PsIsonoteCalloutIdentity,
  PsIsonoteLeaderPath,
  PsIsonotePlannedCallout,
  PsIsonoteProfessionalStyle,
  TextMetricsProvider,
} from './model';

export type PsIsonoteObstacleKind =
  | 'pdf-text'
  | 'matched-anchor'
  | 'title-block'
  | 'drawing-ink'
  | 'existing-callout'
  | 'planned-callout'
  | 'reserved-region';

export interface PsIsonoteLayoutObstacle {
  id: string;
  kind: PsIsonoteObstacleKind;
  rect: PdfRect;
  hard: boolean;
  weight: number;
}

export type PsIsonoteCandidateKind =
  | 'north-west'
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'south-west'
  | 'west'
  | 'left-margin'
  | 'right-margin';

export type PsIsonoteLayoutDiagnosticCode =
  | 'REVIEW_TEXT_OVERLAP'
  | 'REVIEW_DENSE_DRAWING_REGION'
  | 'REVIEW_LONG_LEADER'
  | 'REVIEW_MARGIN_FALLBACK'
  | 'REVIEW_SOFT_OBSTACLE_OVERLAP'
  | 'UNPLACEABLE_OUTSIDE_PAGE'
  | 'UNPLACEABLE_HARD_OBSTACLE'
  | 'UNPLACEABLE_CALLOUT_COLLISION'
  | 'UNPLACEABLE_LEADER_COLLISION'
  | 'UNPLACEABLE_NO_SAFE_CANDIDATE';

export interface PsIsonoteLayoutDiagnostic {
  code: PsIsonoteLayoutDiagnosticCode;
  message: string;
  penalty: number;
  obstacleId?: string;
}

export interface PsIsonoteLayoutOccurrence extends PsIsonoteCalloutIdentity {
  content: PsIsonoteCalloutContent;
  anchorRect: PdfRect;
}

export interface PsIsonoteCalloutCandidate {
  occurrenceId: string;
  kind: PsIsonoteCandidateKind;
  box: PdfRect;
  anchor: PdfPoint;
  leader: PsIsonoteLeaderPath;
  score: number;
  rejected: boolean;
  diagnostics: PsIsonoteLayoutDiagnostic[];
}

export interface PsIsonotePageLayoutInput {
  pageNumber: number;
  page: { width: number; height: number };
  occurrences: PsIsonoteLayoutOccurrence[];
  obstacles: PsIsonoteLayoutObstacle[];
}

export interface PsIsonotePageLayoutOptions {
  style: PsIsonoteProfessionalStyle;
  metrics: TextMetricsProvider;
  pageMargin: number;
  anchorGap: number;
  candidateWidths: number[];
  calloutClearance: number;
  leaderClearance: number;
  longLeaderThreshold: number;
  reviewScoreThreshold: number;
  maximumAcceptedScore: number;
  beamWidth: number;
  maximumCandidatesPerOccurrence: number;
  preferredSide: 'auto' | 'left' | 'right';
}

export interface PsIsonotePageLayoutResult {
  pageNumber: number;
  callouts: PsIsonotePlannedCallout[];
  rejectedOccurrenceIds: string[];
  totalScore: number;
  diagnostics: PsIsonoteLayoutDiagnostic[];
}

export interface PsIsonoteLayoutState {
  selected: Array<{
    occurrence: PsIsonoteLayoutOccurrence;
    candidate: PsIsonoteCalloutCandidate;
  }>;
  totalScore: number;
}
