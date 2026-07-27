import { getStyleContract } from './model';
import { calculateCalloutBoxDimensions } from './typography';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';
import { generateCandidateBox } from './layoutGeometry';
import { generateLeaderRoutes, leaderRouteKindIndex } from './leaderRouter';
import {
  compareCandidateAssessments,
  evaluateCandidateAssessment,
  validateLayoutOptions,
} from './layoutScoring';
import type {
  AttemptedCandidateSummary,
  CandidateAssessment,
  LayoutResult,
  OccurrenceInput,
  PageLayoutOptions,
  PageLayoutSolution,
  PlacementClass,
  SelectedLayoutResult,
  UnplaceableLayoutResult,
} from './layoutTypes';

export const ALL_PLACEMENT_CLASSES: readonly PlacementClass[] = [
  'right', 'top-right', 'bottom-right', 'top', 'bottom',
  'left', 'top-left', 'bottom-left', 'margin-right', 'margin-left',
];

export function generateCandidateAssessments(
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
  selected: readonly SelectedLayoutResult[],
): readonly CandidateAssessment[] {
  const width = occurrence.preferredWidth ?? 200;
  const style = getStyleContract(occurrence.style);
  const dimensions = calculateCalloutBoxDimensions(occurrence.content, width, style);
  const assessments: CandidateAssessment[] = [];
  for (const placement of ALL_PLACEMENT_CLASSES) {
    const box = generateCandidateBox(
      occurrence.targetPoint, dimensions.width, dimensions.height, placement,
      options.pageWidth, options.pageHeight, options.pageMargin,
    );
    for (const route of generateLeaderRoutes(box, occurrence.targetPoint)) {
      assessments.push(evaluateCandidateAssessment(
        placement, box, route, occurrence, options, selected,
      ));
    }
  }
  return assessments.sort(compareCandidateAssessments);
}

const UNPLACEABLE_COST = 1_000_000;

interface BeamNode {
  readonly results: readonly LayoutResult[];
  readonly totalCost: number;
  readonly compromisedCount: number;
  readonly unplaceableCount: number;
}

function placementIndex(placement: PlacementClass): number {
  return ALL_PLACEMENT_CLASSES.indexOf(placement);
}

function cloneOccurrence(occurrence: OccurrenceInput): OccurrenceInput {
  return {
    id: occurrence.id,
    psNo: occurrence.psNo,
    pageNumber: occurrence.pageNumber,
    content: {
      ...(occurrence.content.tagValue !== undefined
        ? { tagValue: occurrence.content.tagValue } : {}),
      ...(occurrence.content.isoNoteValue !== undefined
        ? { isoNoteValue: occurrence.content.isoNoteValue } : {}),
      ...(occurrence.content.confidence !== undefined
        ? { confidence: occurrence.content.confidence } : {}),
    },
    targetPoint: { ...occurrence.targetPoint },
    ...(occurrence.preferredWidth !== undefined
      ? { preferredWidth: occurrence.preferredWidth } : {}),
    style: { ...occurrence.style },
  };
}

function selectedResults(node: BeamNode): readonly SelectedLayoutResult[] {
  return node.results.filter(
    (result): result is SelectedLayoutResult => result.status !== 'unplaceable',
  );
}

function createSelectedResult(
  occurrence: OccurrenceInput,
  assessment: CandidateAssessment,
): SelectedLayoutResult {
  if (assessment.outcome === 'rejected') {
    throw new Error('Cannot create a selected result from a rejected candidate.');
  }
  const copiedOccurrence = cloneOccurrence(occurrence);
  const callout = buildVectorCalloutPlan({
    id: occurrence.id,
    psNo: occurrence.psNo,
    content: occurrence.content,
    targetPoint: occurrence.targetPoint,
    boxPlacement: {
      x: assessment.box.x,
      y: assessment.box.y,
      width: assessment.box.width,
    },
    style: occurrence.style,
    leaderRoute: assessment.route.points,
  });
  const common = {
    occurrence: copiedOccurrence,
    placementClass: assessment.placementClass,
    box: { ...assessment.box },
    route: assessment.route,
    assessment,
    callout,
    totalCost: assessment.totalCost,
    diagnostics: assessment.diagnostics,
  };
  return assessment.outcome === 'clear'
    ? { ...common, status: 'clear', requiresReview: false }
    : { ...common, status: 'compromised', requiresReview: true };
}

function summarize(assessment: CandidateAssessment): AttemptedCandidateSummary {
  return {
    placementClass: assessment.placementClass,
    routeKind: assessment.route.kind,
    routePoints: assessment.route.points.map((point) => ({ ...point })),
    outcome: assessment.outcome,
    totalCost: assessment.totalCost,
    rejectionReasons: [...assessment.rejectionReasons],
  };
}

function createUnplaceableResult(
  occurrence: OccurrenceInput,
  assessments: readonly CandidateAssessment[],
): UnplaceableLayoutResult {
  const rejected = assessments.filter((assessment) => assessment.outcome === 'rejected');
  const bestRejectedCandidate = rejected[0];
  const reasons = [...new Set(rejected.flatMap((assessment) => assessment.rejectionReasons))];
  return {
    status: 'unplaceable',
    requiresReview: true,
    occurrence: cloneOccurrence(occurrence),
    attemptedCandidates: assessments.map(summarize),
    ...(bestRejectedCandidate ? { bestRejectedCandidate } : {}),
    reasons: reasons.length > 0 ? reasons : ['No acceptable candidate was generated.'],
    diagnostics: bestRejectedCandidate?.diagnostics ?? [],
    totalCost: UNPLACEABLE_COST + (bestRejectedCandidate?.totalCost ?? 0),
  };
}

function childWithResult(node: BeamNode, result: LayoutResult): BeamNode {
  return {
    results: [...node.results, result],
    totalCost: node.totalCost + result.totalCost,
    compromisedCount: node.compromisedCount + (result.status === 'compromised' ? 1 : 0),
    unplaceableCount: node.unplaceableCount + (result.status === 'unplaceable' ? 1 : 0),
  };
}

function resultSignature(result: LayoutResult): string {
  if (result.status === 'unplaceable') return `2:${result.occurrence.id}`;
  const status = result.status === 'clear' ? 0 : 1;
  const points = result.route.points.map((point) => `${point.x},${point.y}`).join('|');
  return `${status}:${result.occurrence.id}:${placementIndex(result.placementClass)}`
    + `:${leaderRouteKindIndex(result.route.kind)}:${points}`;
}

function compareBeamNodes(first: BeamNode, second: BeamNode): number {
  const primary = first.unplaceableCount - second.unplaceableCount
    || first.compromisedCount - second.compromisedCount
    || first.totalCost - second.totalCost;
  if (primary !== 0) return primary;
  const firstSignature = first.results.map(resultSignature).join(';');
  const secondSignature = second.results.map(resultSignature).join(';');
  return firstSignature.localeCompare(secondSignature);
}

function sortOccurrences(occurrences: readonly OccurrenceInput[]): readonly OccurrenceInput[] {
  return [...occurrences].sort((first, second) =>
    first.pageNumber - second.pageNumber
    || first.targetPoint.y - second.targetPoint.y
    || first.targetPoint.x - second.targetPoint.x
    || first.id.localeCompare(second.id));
}

function expandNode(
  node: BeamNode,
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
): readonly BeamNode[] {
  const assessments = generateCandidateAssessments(
    occurrence,
    options,
    selectedResults(node),
  );
  const acceptable = assessments.filter((assessment) => assessment.outcome !== 'rejected');
  if (acceptable.length === 0) {
    return [childWithResult(node, createUnplaceableResult(occurrence, assessments))];
  }
  return acceptable.map(
    (assessment) => childWithResult(node, createSelectedResult(occurrence, assessment)),
  );
}

export function solvePageLayout(
  occurrences: readonly OccurrenceInput[],
  options: PageLayoutOptions,
): PageLayoutSolution {
  validateLayoutOptions(options);
  const ordered = sortOccurrences(occurrences);
  const pageNumber = ordered[0]?.pageNumber ?? 1;
  if (ordered.some((occurrence) => occurrence.pageNumber !== pageNumber)) {
    throw new Error('solvePageLayout accepts occurrences from exactly one page.');
  }
  const beamWidth = options.beamWidth ?? 4;
  let beam: readonly BeamNode[] = [{
    results: [],
    totalCost: 0,
    compromisedCount: 0,
    unplaceableCount: 0,
  }];

  for (const occurrence of ordered) {
    beam = beam
      .flatMap((node) => expandNode(node, occurrence, options))
      .sort(compareBeamNodes)
      .slice(0, beamWidth);
  }

  const best = beam[0] ?? {
    results: [],
    totalCost: 0,
    compromisedCount: 0,
    unplaceableCount: 0,
  };
  return {
    pageNumber,
    results: best.results,
    totalCost: Math.round(best.totalCost * 100) / 100,
    clearCount: best.results.filter((result) => result.status === 'clear').length,
    compromisedCount: best.compromisedCount,
    unplaceableCount: best.unplaceableCount,
  };
}

export {
  compareCandidateAssessments,
  evaluateCandidateAssessment,
  validateLayoutOptions,
};
