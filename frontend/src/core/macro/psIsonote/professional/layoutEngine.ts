import { type Point, type Rect, type ProfessionalCalloutModel } from './model';
import { calculateCalloutBoxDimensions } from './typography';
import { buildVectorCalloutPlan, getBoxAnchorTowards } from './vectorCalloutPlan';
import {
  type PlacementClass,
  type Obstacle,
  type LayoutDiagnostic,
  type OccurrenceInput,
  type LayoutResultItem,
  type PageLayoutSolution,
  type PageLayoutOptions,
  type PlacementCandidate,
  type PlacedLayoutResult,
  type UnplaceableLayoutResult,
} from './layoutTypes';
import {
  rectsOverlap,
  isInsidePage,
  lineIntersectsRect,
  linesIntersect,
  generateCandidateBox,
  evaluateLeaderGeometry,
  polylineIntersectsRect,
  polylineIntersectsSegment,
  polylinesIntersect,
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
  placed: PlacedLayoutResult[];
  unplaceable: UnplaceableLayoutResult[];
  activeObstacles: Obstacle[];
  totalScore: number;
  hardConflicts: number;
  unplaceableCount: number;
  canonicalKey?: string;
}

export function simplifyOrthogonalPath(points: readonly Point[]): Point[] {
  if (points.length === 0) return [];
  const deduped: Point[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    if (Math.abs(points[i].x - prev.x) > 1e-6 || Math.abs(points[i].y - prev.y) > 1e-6) {
      deduped.push(points[i]);
    }
  }
  if (deduped.length <= 2) return deduped;
  const simplified: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = simplified[simplified.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    const colinearX = Math.abs(prev.x - curr.x) < 1e-6 && Math.abs(curr.x - next.x) < 1e-6;
    const colinearY = Math.abs(prev.y - curr.y) < 1e-6 && Math.abs(curr.y - next.y) < 1e-6;
    if (!colinearX && !colinearY) {
      simplified.push(curr);
    }
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

export function generateOrthogonalRoutes(boxAnchor: Point, target: Point): Point[][] {
  if (Math.abs(boxAnchor.x - target.x) < 1e-6 || Math.abs(boxAnchor.y - target.y) < 1e-6) {
    return [simplifyOrthogonalPath([boxAnchor, target])];
  }
  const routeH = simplifyOrthogonalPath([
    boxAnchor,
    { x: target.x, y: boxAnchor.y },
    target,
  ]);
  const routeV = simplifyOrthogonalPath([
    boxAnchor,
    { x: boxAnchor.x, y: target.y },
    target,
  ]);
  return [routeH, routeV];
}

interface RouteEvaluation {
  route: Point[];
  isValid: boolean;
  diagnostics: LayoutDiagnostic[];
  penalty: number;
}

function evaluateRoute(
  route: Point[],
  box: Rect,
  options: PageLayoutOptions,
  currentPlaced: PlacedLayoutResult[],
): RouteEvaluation {
  const diagnostics: LayoutDiagnostic[] = [];
  let isValid = true;
  let penalty = 0;

  if (options.titleBlockRect && polylineIntersectsRect(route, options.titleBlockRect, false)) {
    isValid = false;
    diagnostics.push({
      type: 'hard-collision',
      source: 'title-block',
      message: 'Leader intersects protected title block.',
      penalty: 1000,
    });
    penalty += 1000;
  }

  for (const existing of currentPlaced) {
    if (polylineIntersectsRect(route, existing.callout.box, false)) {
      isValid = false;
      diagnostics.push({
        type: 'hard-collision',
        source: 'leader-line',
        message: `Leader intersects existing callout ${existing.callout.psNo}.`,
        penalty: 1000,
      });
      penalty += 1000;
      break;
    }
    const existingLines = existing.callout.primitives
      .filter((p): p is { type: 'line'; start: Point; end: Point; color: string; width: number } => p.type === 'line')
      .map(p => [p.start, p.end]);
    for (const seg of existingLines) {
      if (polylinesIntersect(route, seg)) {
        isValid = false;
        diagnostics.push({
          type: 'hard-collision',
          source: 'leader-line',
          message: `Leader crosses existing leader line for ${existing.callout.psNo}.`,
          penalty: 1000,
        });
        penalty += 1000;
        break;
      }
    }
  }

  const obstacles = options.obstacles ?? [];
  for (const obs of obstacles) {
    if ('kind' in obs && obs.kind === 'segment') {
      if (polylineIntersectsSegment(route, obs.start, obs.end, obs.clearance)) {
        if (obs.type === 'hard') {
          isValid = false;
          diagnostics.push({
            type: 'hard-collision',
            source: obs.source,
            message: `Leader collides with hard segment obstacle (${obs.id}).`,
            penalty: 1000,
          });
          penalty += 1000;
        } else {
          const w = obs.weight ?? 20;
          penalty += w;
          diagnostics.push({
            type: 'drawing-density',
            source: obs.source,
            message: `Leader intersects soft segment (${obs.id}).`,
            penalty: w,
          });
        }
      }
    } else {
      if (polylineIntersectsRect(route, obs.rect, true)) {
        if (obs.type === 'hard') {
          isValid = false;
          diagnostics.push({
            type: 'hard-collision',
            source: obs.source,
            message: `Leader collides with hard obstacle (${obs.id}).`,
            penalty: 1000,
          });
          penalty += 1000;
        } else {
          const w = obs.weight ?? (obs.source === 'existing-text' ? 35 : 15);
          penalty += w;
          diagnostics.push({
            type: obs.source === 'existing-text' ? 'text-overlap' : 'drawing-density',
            source: obs.source,
            message: `Leader overlaps soft obstacle (${obs.id}).`,
            penalty: w,
          });
        }
      }
    }
  }

  // Score Manhattan length and bends
  let length = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    length += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].y - route[i].y);
  }
  penalty += length * 0.2;
  const bends = Math.max(0, route.length - 2);
  penalty += bends * 2.5;

  return { route, isValid, diagnostics, penalty };
}

/**
 * Evaluates a single candidate box and placement class against all known hard and soft obstacles.
 */
export function evaluateCandidate(
  placement: PlacementClass,
  box: Rect,
  occurrence: OccurrenceInput,
  options: PageLayoutOptions,
  currentPlaced: LayoutResultItem[] = [],
): PlacementCandidate {
  const margin = options.pageMargin ?? 12;
  const boxAnchor = getBoxAnchorTowards(box, occurrence.targetPoint);
  const placedOnly = currentPlaced.filter((item): item is PlacedLayoutResult => item.status === 'placed');

  const diagnostics: LayoutDiagnostic[] = [];
  let isValid = true;
  let score = 100;

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
  if (options.titleBlockRect) {
    if (rectsOverlap(box, options.titleBlockRect, 2)) {
      isValid = false;
      diagnostics.push({
        type: 'hard-collision',
        source: 'title-block',
        message: 'Callout intersects protected title block.',
        penalty: 1000,
      });
    }
  }

  // 3. Hard Check: Already Placed Callout Boxes
  for (const existing of placedOnly) {
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
  }

  // 4. Evaluate provided Obstacles against Box
  const obstacles = options.obstacles ?? [];
  for (const obs of obstacles) {
    if ('kind' in obs && obs.kind === 'segment') {
      const minX = Math.min(obs.start.x, obs.end.x) - obs.clearance;
      const minY = Math.min(obs.start.y, obs.end.y) - obs.clearance;
      const w = Math.abs(obs.end.x - obs.start.x) + obs.clearance * 2;
      const h = Math.abs(obs.end.y - obs.start.y) + obs.clearance * 2;
      if (rectsOverlap(box, { x: minX, y: minY, width: w, height: h }, 0)) {
        if (obs.type === 'hard') {
          isValid = false;
          diagnostics.push({
            type: 'hard-collision',
            source: obs.source,
            message: `Box collides with hard segment (${obs.id}).`,
            penalty: 1000,
          });
        } else {
          const penalty = obs.weight ?? 20;
          score -= penalty;
          diagnostics.push({
            type: 'drawing-density',
            source: obs.source,
            message: `Box intersects soft segment (${obs.id}).`,
            penalty,
          });
        }
      }
    } else {
      if (rectsOverlap(box, obs.rect, 2)) {
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
  }

  // Evaluate dynamic orthogonal elbow routes
  const routes = generateOrthogonalRoutes(boxAnchor, occurrence.targetPoint);
  let bestRouteEval: RouteEvaluation | null = null;

  for (const r of routes) {
    const rEval = evaluateRoute(r, box, options, placedOnly);
    if (!bestRouteEval) {
      bestRouteEval = rEval;
    } else if (rEval.isValid && !bestRouteEval.isValid) {
      bestRouteEval = rEval;
    } else if (rEval.isValid === bestRouteEval.isValid && rEval.penalty < bestRouteEval.penalty) {
      bestRouteEval = rEval;
    }
  }

  const routeResult = bestRouteEval ?? { route: [boxAnchor, occurrence.targetPoint], isValid: true, diagnostics: [], penalty: 0 };
  if (!routeResult.isValid) {
    isValid = false;
  }
  score -= routeResult.penalty;
  for (const d of routeResult.diagnostics) {
    diagnostics.push(d);
  }

  const leaderPoints = routeResult.route;
  const leaderStart = leaderPoints[0] ?? boxAnchor;
  const leaderEnd = leaderPoints[leaderPoints.length - 1] ?? occurrence.targetPoint;

  return {
    placementClass: placement,
    box,
    leaderStart,
    leaderEnd,
    leaderPoints,
    score: Math.round(score * 10) / 10,
    diagnostics,
    isValid,
  };
}

function computeStateCanonicalKey(node: BeamNode): string {
  const placedPart = node.placed
    .map(p => `${p.occurrenceId}:${p.placementClass}:${Math.round(p.callout.box.x)},${Math.round(p.callout.box.y)}`)
    .sort()
    .join('|');
  const unplacedPart = node.unplaceable
    .map(u => u.occurrenceId)
    .sort()
    .join('|');
  return `${placedPart}||${unplacedPart}`;
}

function compareBeamStates(a: BeamNode, b: BeamNode): number {
  if (a.unplaceableCount !== b.unplaceableCount) {
    return a.unplaceableCount - b.unplaceableCount;
  }
  if (a.hardConflicts !== b.hardConflicts) {
    return a.hardConflicts - b.hardConflicts;
  }
  if (Math.abs(b.totalScore - a.totalScore) > 1e-3) {
    return b.totalScore - a.totalScore;
  }
  const keyA = a.canonicalKey ?? computeStateCanonicalKey(a);
  const keyB = b.canonicalKey ?? computeStateCanonicalKey(b);
  return keyA.localeCompare(keyB);
}

function markUnplaceable(node: BeamNode, occurrence: OccurrenceInput): BeamNode {
  const unplaceableResult: UnplaceableLayoutResult = {
    status: 'unplaceable',
    occurrenceId: occurrence.id,
    occurrence,
    diagnostics: [
      {
        type: 'hard-collision',
        source: 'layout-solver',
        message: 'Placement deferred or rejected to preserve global layout feasibility.',
        penalty: 1000,
      },
    ],
  };
  const next: BeamNode = {
    placed: node.placed,
    unplaceable: [...node.unplaceable, unplaceableResult],
    activeObstacles: node.activeObstacles,
    totalScore: node.totalScore - 1000,
    hardConflicts: node.hardConflicts,
    unplaceableCount: node.unplaceableCount + 1,
  };
  next.canonicalKey = computeStateCanonicalKey(next);
  return next;
}

/**
 * Deterministic page-level layout engine using global beam search with unplaceable deferral branches.
 */
export function solvePageLayout(
  occurrences: OccurrenceInput[],
  options: PageLayoutOptions,
): PageLayoutSolution {
  if (options.beamWidth !== undefined && (options.beamWidth < 1 || !Number.isFinite(options.beamWidth))) {
    throw new Error('Invalid beam width: must be >= 1.');
  }
  const beamWidth = Math.min(64, Math.max(1, options.beamWidth ?? 4));
  const maxCandidates = 32;

  // Order occurrences by most constrained first against static obstacles
  const sortedOccurrences = [...occurrences].sort((a, b) => {
    let validA = 0;
    let validB = 0;
    const dimsA = calculateCalloutBoxDimensions(a.tag, a.note, a.confidence, a.preferredWidth ?? 200);
    const dimsB = calculateCalloutBoxDimensions(b.tag, b.note, b.confidence, b.preferredWidth ?? 200);
    for (const cls of ALL_PLACEMENT_CLASSES) {
      if (evaluateCandidate(cls, generateCandidateBox(a.targetPoint, dimsA.width, dimsA.height, cls, options.pageWidth, options.pageHeight, options.pageMargin), a, options, []).isValid) validA++;
      if (evaluateCandidate(cls, generateCandidateBox(b.targetPoint, dimsB.width, dimsB.height, cls, options.pageWidth, options.pageHeight, options.pageMargin), b, options, []).isValid) validB++;
    }
    if (validA !== validB) return validA - validB; // fewer valid options = more constrained
    return a.targetPoint.y - b.targetPoint.y || a.targetPoint.x - b.targetPoint.x || a.id.localeCompare(b.id);
  });

  let beam: BeamNode[] = [{
    placed: [],
    unplaceable: [],
    activeObstacles: options.obstacles ?? [],
    totalScore: 0,
    hardConflicts: 0,
    unplaceableCount: 0,
    canonicalKey: '||',
  }];

  for (const occurrence of sortedOccurrences) {
    const width = occurrence.preferredWidth ?? 200;
    const dims = calculateCalloutBoxDimensions(occurrence.tag, occurrence.note, occurrence.confidence, width);

    const nextBeam: BeamNode[] = [];
    const seenKeys = new Set<string>();

    for (const state of beam) {
      const candidates: PlacementCandidate[] = [];

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
        const evalResult = evaluateCandidate(placement, candidateBox, occurrence, options, state.placed);
        candidates.push(evalResult);
      }

      candidates.sort((c1, c2) => {
        if (c1.isValid !== c2.isValid) return c1.isValid ? -1 : 1;
        return c2.score - c1.score;
      });
      const viableCandidates = candidates.slice(0, maxCandidates);

      let placedAny = false;
      for (const candidate of viableCandidates) {
        if (!candidate.isValid) {
          continue;
        }
        placedAny = true;
        const hasSoftOverlap = candidate.diagnostics.some(
          d => d.type === 'text-overlap' || d.type === 'drawing-density'
        );
        const callout = buildVectorCalloutPlan(
          occurrence.id,
          occurrence.psNo,
          occurrence.tag,
          occurrence.note,
          occurrence.confidence,
          occurrence.targetPoint,
          candidate.box,
          {
            isReview: hasSoftOverlap,
            leaderPath: candidate.leaderPoints ? { points: candidate.leaderPoints as [Point, Point, ...Point[]], anchorRadius: 2 } : undefined,
          },
        );
        const resultItem: PlacedLayoutResult = {
          status: 'placed',
          occurrenceId: occurrence.id,
          occurrence,
          placementClass: candidate.placementClass,
          callout,
          diagnostics: candidate.diagnostics,
        };
        const nextNode: BeamNode = {
          placed: [...state.placed, resultItem],
          unplaceable: [...state.unplaceable],
          activeObstacles: state.activeObstacles,
          totalScore: state.totalScore + candidate.score,
          hardConflicts: state.hardConflicts + (candidate.isValid ? 0 : 1),
          unplaceableCount: state.unplaceableCount,
        };
        const key = computeStateCanonicalKey(nextNode);
        nextNode.canonicalKey = key;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          nextBeam.push(nextNode);
        }
      }

      // Explicit defer/unplaceable branch even when viable candidates exist
      const unplacedNode = markUnplaceable(state, occurrence);
      const unplacedKey = unplacedNode.canonicalKey ?? computeStateCanonicalKey(unplacedNode);
      if (!seenKeys.has(unplacedKey)) {
        seenKeys.add(unplacedKey);
        nextBeam.push(unplacedNode);
      }
    }

    beam = nextBeam.sort(compareBeamStates).slice(0, beamWidth);
  }

  const bestSolution = beam[0] ?? { placed: [], unplaceable: [], totalScore: 0, unplaceableCount: 0 };
  const allResults: LayoutResultItem[] = [...bestSolution.placed, ...bestSolution.unplaceable];

  return {
    pageNumber: occurrences[0]?.pageNumber ?? 1,
    results: allResults,
    totalScore: Math.round(bestSolution.totalScore * 10) / 10,
    unplaceableCount: bestSolution.unplaceableCount,
  };
}
