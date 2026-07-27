import { type Rect } from './model';
import { calculateCalloutBoxDimensions } from './typography';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';
import {
  type PlacementClass,
  type Obstacle,
  type LayoutDiagnostic,
  type OccurrenceInput,
  type LayoutResultItem,
  type PageLayoutSolution,
  type PageLayoutOptions,
  type PlacementCandidate,
} from './layoutTypes';
import {
  rectsOverlap,
  isInsidePage,
  lineIntersectsRect,
  linesIntersect,
  generateCandidateBox,
  evaluateLeaderGeometry,
} from './layoutGeometry';

export const ALL_PLACEMENT_CLASSES: PlacementClass[] = [
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

interface BeamNode {
  placed: LayoutResultItem[];
  unplaceable: LayoutResultItem[];
  activeObstacles: Obstacle[]; // hard obstacles + already placed callouts/leaders
  totalScore: number;
}

/**
 * Evaluates a single candidate box and placement class against all known hard and soft obstacles.
 */
export function evaluateCandidate(
  placement: PlacementClass,
  box: Rect,
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
  currentPlaced: LayoutResultItem[],
): PlacementCandidate {
  const margin = options.pageMargin ?? 12;
  const { start: leaderStart, end: leaderEnd, isOrthogonal, length } = evaluateLeaderGeometry(box, occurrence.targetPoint);

  const diagnostics: LayoutDiagnostic[] = [];
  let isValid = true;
  let score = 100 - length * 0.2; // Prefer shorter leader lines

  if (isOrthogonal) {
    score += 15; // Prefer orthogonal leaders
  }

  // Fallback edge placements get a small base penalty so closer local placements are favored if clean
  if (placement === 'margin-right' || placement === 'margin-left') {
    score -= 10;
  }

  // 1. Hard Check: Page boundaries
  if (!isInsidePage(box, options.pageWidth, options.pageHeight, margin)) {
    isValid = false;
    diagnostics.push({
      type: 'hard-collision',
      source: 'page-boundary',
      message: `Callout exceeds page dimensions (${options.pageWidth}x${options.pageHeight}).`,
      penalty: 1000,
    });
  }

  // 2. Hard Check: Title Block
  if (options.titleBlockRect && isValid) {
    if (rectsOverlap(box, options.titleBlockRect, 2) || lineIntersectsRect(leaderStart, leaderEnd, options.titleBlockRect)) {
      isValid = false;
      diagnostics.push({
        type: 'hard-collision',
        source: 'title-block',
        message: 'Callout or leader intersects protected title block.',
        penalty: 1000,
      });
    }
  }

  // 3. Hard Check: Already Placed Callouts & Leaders in current beam solution
  if (isValid) {
    for (const existing of currentPlaced) {
      if (existing.status === 'placed' && existing.callout) {
        // Box vs Box
        if (rectsOverlap(box, existing.callout.box, 6)) {
          isValid = false;
          diagnostics.push({
            type: 'hard-collision',
            source: 'callout-box',
            message: `Collides with existing callout ${existing.callout.psNo}.`,
            penalty: 1000,
          });
          break;
        }
        // Leader vs Existing Box
        if (lineIntersectsRect(leaderStart, leaderEnd, existing.callout.box)) {
          isValid = false;
          diagnostics.push({
            type: 'hard-collision',
            source: 'leader-line',
            message: `Leader intersects existing callout ${existing.callout.psNo}.`,
            penalty: 1000,
          });
          break;
        }
        // Existing Leader vs Candidate Box
        const existingLeader = existing.callout.primitives.find((p) => p.type === 'line');
        if (existingLeader && existingLeader.type === 'line') {
          if (lineIntersectsRect(existingLeader.start, existingLeader.end, box)) {
            isValid = false;
            diagnostics.push({
              type: 'hard-collision',
              source: 'callout-box',
              message: `Box intersects existing leader line for ${existing.callout.psNo}.`,
              penalty: 1000,
            });
            break;
          }
          if (linesIntersect(leaderStart, leaderEnd, existingLeader.start, existingLeader.end)) {
            isValid = false;
            diagnostics.push({
              type: 'hard-collision',
              source: 'leader-line',
              message: `Leader crosses existing leader line for ${existing.callout.psNo}.`,
              penalty: 1000,
            });
            break;
          }
        }
      }
    }
  }

  // 4. Evaluate provided Obstacles (both Hard and Soft)
  const obstacles = options.obstacles ?? [];
  for (const obs of obstacles) {
    if (rectsOverlap(box, obs.rect, 2) || lineIntersectsRect(leaderStart, leaderEnd, obs.rect)) {
      if (obs.type === 'hard') {
        isValid = false;
        diagnostics.push({
          type: 'hard-collision',
          source: obs.source,
          message: `Collides with hard obstacle (${obs.id}).`,
          penalty: 1000,
        });
      } else {
        const penalty = obs.weight ?? (obs.source === 'existing-text' ? 35 : 15);
        score -= penalty;
        diagnostics.push({
          type: obs.source === 'existing-text' ? 'text-overlap' : 'drawing-density',
          source: obs.source,
          message: `Overlaps soft obstacle (${obs.id}: ${obs.source}).`,
          penalty,
        });
      }
    }
  }

  return {
    placementClass: placement,
    box,
    leaderStart,
    leaderEnd,
    score: Math.round(score * 10) / 10,
    diagnostics,
    isValid,
  };
}

/**
 * Deterministic page-level layout engine using beam search.
 * Enforces zero silent failures: unplaceable items become explicitly flagged as unplaceable.
 */
export function solvePageLayout(
  occurrences: OccurrenceInput[],
  options: PageLayoutOptions,
): PageLayoutSolution {
  const beamWidth = options.beamWidth ?? 4;
  let beam: BeamNode[] = [{ placed: [], unplaceable: [], activeObstacles: options.obstacles ?? [], totalScore: 0 }];

  const sortedOccurrences = [...occurrences].sort((a, b) =>
    a.targetPoint.y - b.targetPoint.y || a.targetPoint.x - b.targetPoint.x
  );

  for (const occurrence of sortedOccurrences) {
    const width = occurrence.preferredWidth ?? 200;
    const dims = calculateCalloutBoxDimensions(occurrence.tag, occurrence.note, occurrence.confidence, width);

    const newBeam: BeamNode[] = [];

    for (const node of beam) {
      let bestCandidate: PlacementCandidate | null = null;

      for (const placement of ALL_PLACEMENT_CLASSES) {
        const candidateBox = generateCandidateBox(
          occurrence.targetPoint,
          dims.width,
          dims.height,
          placement,
          options.pageWidth,
          options.pageHeight,
          options.pageMargin,
        );
        const evaluation = evaluateCandidate(placement, candidateBox, occurrence, options, node.placed);

        if (evaluation.isValid) {
          if (!bestCandidate || evaluation.score > bestCandidate.score) {
            bestCandidate = evaluation;
          }
        }
      }

      if (bestCandidate) {
        const callout = buildVectorCalloutPlan(
          occurrence.id,
          occurrence.psNo,
          occurrence.tag,
          occurrence.note,
          occurrence.confidence,
          occurrence.targetPoint,
          bestCandidate.box,
          { isReview: false },
        );
        const resultItem: LayoutResultItem = {
          occurrenceId: occurrence.id,
          status: 'placed',
          placementClass: bestCandidate.placementClass,
          callout,
          diagnostics: bestCandidate.diagnostics,
        };
        newBeam.push({
          placed: [...node.placed, resultItem],
          unplaceable: [...node.unplaceable],
          activeObstacles: node.activeObstacles,
          totalScore: node.totalScore + bestCandidate.score,
        });
      } else {
        // Unplaceable: NO silent bad placement!
        const resultItem: LayoutResultItem = {
          occurrenceId: occurrence.id,
          status: 'unplaceable',
          diagnostics: [
            {
              type: 'hard-collision',
              source: 'layout-solver',
              message: `All 10 placement classes rejected due to hard obstacle or boundary collisions.`,
              penalty: 1000,
            },
          ],
        };
        newBeam.push({
          placed: [...node.placed],
          unplaceable: [...node.unplaceable, resultItem],
          activeObstacles: node.activeObstacles,
          totalScore: node.totalScore - 100, // penalty for unplaceable in beam search
        });
      }
    }

    // Keep top beamWidth solutions
    beam = newBeam.sort((a, b) => {
      // Favor solutions with fewer unplaceables first
      if (a.unplaceable.length !== b.unplaceable.length) {
        return a.unplaceable.length - b.unplaceable.length;
      }
      return b.totalScore - a.totalScore;
    }).slice(0, beamWidth);
  }

  const bestSolution = beam[0] ?? { placed: [], unplaceable: [], totalScore: 0 };
  const allResults = [...bestSolution.placed, ...bestSolution.unplaceable];

  return {
    pageNumber: occurrences[0]?.pageNumber ?? 1,
    results: allResults,
    totalScore: Math.round(bestSolution.totalScore * 10) / 10,
    unplaceableCount: bestSolution.unplaceable.length,
  };
}
