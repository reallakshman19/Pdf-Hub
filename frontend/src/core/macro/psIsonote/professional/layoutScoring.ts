import type { Point, Rect } from './model';
import {
  isInsidePage,
  rectsOverlap,
  rectsTouchOrOverlap,
  routeIntersections,
  routeRectHits,
  segmentIntersectsRect,
} from './layoutGeometry';
import { leaderRouteKindIndex } from './leaderRouter';
import type {
  CandidateAssessment,
  LayoutDiagnostic,
  LeaderRoute,
  ObstaclePolicyRule,
  OccurrenceInput,
  PageLayoutOptions,
  PlacementClass,
  SelectedLayoutResult,
} from './layoutTypes';

const PROHIBITED_PENALTY = 1_000_000;

const PLACEMENT_ORDER: readonly PlacementClass[] = [
  'right',
  'top-right',
  'bottom-right',
  'top',
  'bottom',
  'left',
  'top-left',
  'bottom-left',
  'margin-right',
  'margin-left',
];

function placementIndex(placement: PlacementClass): number {
  return PLACEMENT_ORDER.indexOf(placement);
}

function makeDiagnostic(
  code: LayoutDiagnostic['code'],
  message: string,
  penalty: number,
  detail: Partial<LayoutDiagnostic> = {},
): LayoutDiagnostic {
  return { code, message, penalty, ...detail };
}

function routeHitsRectWithoutExemption(route: LeaderRoute, rect: Rect): boolean {
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    if (start && end && segmentIntersectsRect(start, end, rect) !== 'none') return true;
  }
  return false;
}

function evaluatePlacedClashes(
  box: Rect,
  route: LeaderRoute,
  selected: readonly SelectedLayoutResult[],
): readonly LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = [];
  for (const existing of selected) {
    if (rectsOverlap(box, existing.box, 6)) {
      diagnostics.push(makeDiagnostic(
        'callout-box',
        `Callout box conflicts with ${existing.occurrence.id}.`,
        PROHIBITED_PENALTY,
      ));
    }
    if (routeHitsRectWithoutExemption(route, existing.box)
      || routeHitsRectWithoutExemption(existing.route, box)
      || routeIntersections(route, existing.route).length > 0) {
      diagnostics.push(makeDiagnostic(
        'callout-leader',
        `Callout route conflicts with ${existing.occurrence.id}.`,
        PROHIBITED_PENALTY,
      ));
    }
  }
  return diagnostics;
}

function resolveRule(
  source: string,
  options: PageLayoutOptions,
): ObstaclePolicyRule | undefined {
  return options.obstaclePolicy.bySource[source];
}

function obstacleDiagnostic(
  obstacleId: string,
  source: string,
  geometry: 'box' | 'leader',
  rule: ObstaclePolicyRule | undefined,
  intersection?: LayoutDiagnostic['intersection'],
): LayoutDiagnostic {
  const missing = rule === undefined;
  const mode = rule?.mode ?? 'prohibited';
  const penalty = missing
    ? PROHIBITED_PENALTY
    : geometry === 'box' ? rule.boxPenalty : rule.leaderPenalty;
  const code = missing ? 'missing-obstacle-policy' : 'obstacle-clash';
  const message = missing
    ? `Obstacle ${obstacleId} has no policy for source ${source}; rejected fail-closed.`
    : `${geometry} ${mode} clash with obstacle ${obstacleId} (${source}).`;
  return makeDiagnostic(code, message, penalty, {
    obstacleId,
    source,
    geometry,
    policyMode: mode,
    ...(intersection ? { intersection } : {}),
  });
}

function evaluateObstacleClashes(
  box: Rect,
  route: LeaderRoute,
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
): readonly LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = [];
  for (const obstacle of options.obstacles ?? []) {
    const rule = resolveRule(obstacle.source, options);
    if (rectsTouchOrOverlap(box, obstacle.rect)) {
      diagnostics.push(obstacleDiagnostic(obstacle.id, obstacle.source, 'box', rule));
    }
    const routeHits = routeRectHits(route, obstacle.rect, occurrence.targetPoint);
    const strongestHit = routeHits.reduce<LayoutDiagnostic['intersection']>(
      (strongest, hit) => {
        const rank = { none: 0, touch: 1, cross: 2, overlap: 3 } as const;
        return strongest === undefined || rank[hit.kind] > rank[strongest]
          ? hit.kind : strongest;
      },
      undefined,
    );
    if (strongestHit) {
      diagnostics.push(obstacleDiagnostic(
        obstacle.id,
        obstacle.source,
        'leader',
        rule,
        strongestHit,
      ));
    }
  }
  return diagnostics;
}

function baseCost(placement: PlacementClass, route: LeaderRoute): number {
  const marginPenalty = placement.startsWith('margin-') ? 20 : 0;
  return route.length + placementIndex(placement) * 0.25
    + leaderRouteKindIndex(route.kind) * 0.01 + marginPenalty;
}

function isProhibited(diagnostic: LayoutDiagnostic): boolean {
  return diagnostic.code === 'page-boundary'
    || diagnostic.code === 'callout-box'
    || diagnostic.code === 'callout-leader'
    || diagnostic.policyMode === 'prohibited';
}

export function evaluateCandidateAssessment(
  placementClass: PlacementClass,
  box: Rect,
  route: LeaderRoute,
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
  selected: readonly SelectedLayoutResult[],
): CandidateAssessment {
  const margin = options.pageMargin ?? 12;
  const diagnostics: LayoutDiagnostic[] = [];
  if (!isInsidePage(box, options.pageWidth, options.pageHeight, margin)) {
    diagnostics.push(makeDiagnostic(
      'page-boundary',
      'Callout box is outside the permitted page area.',
      PROHIBITED_PENALTY,
    ));
  }
  diagnostics.push(...evaluatePlacedClashes(box, route, selected));
  diagnostics.push(...evaluateObstacleClashes(box, route, occurrence, options));

  const compromiseCost = diagnostics
    .filter((diagnostic) => diagnostic.policyMode === 'weighted')
    .reduce((total, diagnostic) => total + diagnostic.penalty, 0);
  const rejectionReasons = diagnostics.filter(isProhibited).map((item) => item.message);
  if (rejectionReasons.length === 0 && compromiseCost > options.compromiseThreshold) {
    const message = `Compromise cost ${compromiseCost} exceeds threshold ${options.compromiseThreshold}.`;
    diagnostics.push(makeDiagnostic('compromise-threshold', message, 0));
    rejectionReasons.push(message);
  }
  const cost = baseCost(placementClass, route);
  const outcome = rejectionReasons.length > 0
    ? 'rejected'
    : compromiseCost > 0 ? 'compromised' : 'clear';

  return {
    placementClass,
    box: { ...box },
    route,
    outcome,
    baseCost: cost,
    compromiseCost,
    totalCost: cost + compromiseCost,
    diagnostics,
    rejectionReasons,
  };
}

function compareRoutePoints(first: readonly Point[], second: readonly Point[]): number {
  const count = Math.min(first.length, second.length);
  for (let index = 0; index < count; index += 1) {
    const a = first[index];
    const b = second[index];
    if (!a || !b) continue;
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
  }
  return first.length - second.length;
}

export function compareCandidateAssessments(
  first: CandidateAssessment,
  second: CandidateAssessment,
): number {
  const rank = { clear: 0, compromised: 1, rejected: 2 } as const;
  return rank[first.outcome] - rank[second.outcome]
    || first.totalCost - second.totalCost
    || placementIndex(first.placementClass) - placementIndex(second.placementClass)
    || leaderRouteKindIndex(first.route.kind) - leaderRouteKindIndex(second.route.kind)
    || compareRoutePoints(first.route.points, second.route.points);
}

export function validateLayoutOptions(options: PageLayoutOptions): void {
  const positive = [options.pageWidth, options.pageHeight];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Page dimensions must be positive finite numbers.');
  }
  if (!Number.isFinite(options.compromiseThreshold) || options.compromiseThreshold < 0) {
    throw new RangeError('compromiseThreshold must be a non-negative finite number.');
  }
  if (options.beamWidth !== undefined
    && (!Number.isInteger(options.beamWidth) || options.beamWidth <= 0)) {
    throw new RangeError('beamWidth must be a positive integer.');
  }
  for (const [source, rule] of Object.entries(options.obstaclePolicy.bySource)) {
    if (![rule.boxPenalty, rule.leaderPenalty].every(
      (value) => Number.isFinite(value) && value >= 0,
    )) throw new RangeError(`Obstacle policy penalties must be non-negative for ${source}.`);
    if (rule.mode === 'weighted' && rule.leaderPenalty >= rule.boxPenalty) {
      throw new Error(`Weighted leader penalty must be lower than box penalty for ${source}.`);
    }
  }
}
