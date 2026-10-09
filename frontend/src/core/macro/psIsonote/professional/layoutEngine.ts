import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PdfPoint,
  type PdfRect,
  type PsIsonotePlannedCallout,
  type TextMetricsProvider,
} from './model';
import {
  intersectionArea,
  orthogonalLeaderRoutes,
  pathIntersectsRect,
  pathLength,
  rectArea,
  rectInsidePage,
  rectsOverlap,
  segmentsIntersect,
} from './layoutGeometry';
import type {
  PsIsonoteCalloutCandidate,
  PsIsonoteCandidateKind,
  PsIsonoteLayoutDiagnostic,
  PsIsonoteLayoutOccurrence,
  PsIsonoteLayoutState,
  PsIsonotePageLayoutInput,
  PsIsonotePageLayoutOptions,
  PsIsonotePageLayoutResult,
} from './layoutTypes';
import { layoutCalloutTypography } from './typography';

const HARD_REJECTION_PENALTY = 1_000_000;
const CALLOUT_COLLISION_PENALTY = 750_000;
const LEADER_COLLISION_PENALTY = 500_000;

const CANDIDATE_KIND_ORDER: readonly PsIsonoteCandidateKind[] = [
  'north-east',
  'east',
  'south-east',
  'north',
  'south',
  'north-west',
  'west',
  'south-west',
  'right-margin',
  'left-margin',
];

function candidateKindRank(kind: PsIsonoteCandidateKind): number {
  return CANDIDATE_KIND_ORDER.indexOf(kind);
}

function occurrenceAnchor(occurrence: PsIsonoteLayoutOccurrence): PdfPoint {
  return {
    x: occurrence.anchorRect.x + occurrence.anchorRect.width / 2,
    y: occurrence.anchorRect.y + occurrence.anchorRect.height / 2,
  };
}

function normalizedWidths(options: PsIsonotePageLayoutOptions): number[] {
  const bounded = options.candidateWidths
    .map((width) => Math.max(options.style.minimumWidth, Math.min(width, options.style.maximumWidth)))
    .filter((width) => Number.isFinite(width));
  const unique = Array.from(new Set(bounded.map((width) => Math.round(width * 100) / 100)));
  return unique.length > 0 ? unique.sort((left, right) => left - right) : [options.style.preferredWidth];
}

function calloutHeight(
  occurrence: PsIsonoteLayoutOccurrence,
  width: number,
  options: PsIsonotePageLayoutOptions,
): number {
  return layoutCalloutTypography({
    psNo: occurrence.content.psNo,
    isonote: occurrence.content.isonote,
    ...(occurrence.content.family ? { family: occurrence.content.family } : {}),
    width,
    paddingX: options.style.paddingX,
    paddingY: options.style.paddingY,
    headerFontSize: options.style.headerFontSize,
    noteFontSize: options.style.noteFontSize,
    secondaryFontSize: options.style.secondaryFontSize,
    lineHeight: options.style.lineHeight,
    metrics: options.metrics,
  }).height;
}

function boxForKind(options: {
  kind: PsIsonoteCandidateKind;
  occurrence: PsIsonoteLayoutOccurrence;
  page: { width: number; height: number };
  width: number;
  height: number;
  gap: number;
  margin: number;
}): PdfRect {
  const anchorRect = options.occurrence.anchorRect;
  const anchor = occurrenceAnchor(options.occurrence);
  const centeredX = anchor.x - options.width / 2;
  const centeredY = anchor.y - options.height / 2;
  const leftX = anchorRect.x - options.gap - options.width;
  const rightX = anchorRect.x + anchorRect.width + options.gap;
  const aboveY = anchorRect.y - options.gap - options.height;
  const belowY = anchorRect.y + anchorRect.height + options.gap;
  const marginY = Math.max(
    options.margin,
    Math.min(centeredY, options.page.height - options.margin - options.height),
  );

  switch (options.kind) {
    case 'north-west':
      return { x: leftX, y: aboveY, width: options.width, height: options.height };
    case 'north':
      return { x: centeredX, y: aboveY, width: options.width, height: options.height };
    case 'north-east':
      return { x: rightX, y: aboveY, width: options.width, height: options.height };
    case 'east':
      return { x: rightX, y: centeredY, width: options.width, height: options.height };
    case 'south-east':
      return { x: rightX, y: belowY, width: options.width, height: options.height };
    case 'south':
      return { x: centeredX, y: belowY, width: options.width, height: options.height };
    case 'south-west':
      return { x: leftX, y: belowY, width: options.width, height: options.height };
    case 'west':
      return { x: leftX, y: centeredY, width: options.width, height: options.height };
    case 'left-margin':
      return { x: options.margin, y: marginY, width: options.width, height: options.height };
    case 'right-margin':
      return {
        x: options.page.width - options.margin - options.width,
        y: marginY,
        width: options.width,
        height: options.height,
      };
  }
}

function diagnostic(
  code: PsIsonoteLayoutDiagnostic['code'],
  message: string,
  penalty: number,
  obstacleId?: string,
): PsIsonoteLayoutDiagnostic {
  return {
    code,
    message,
    penalty,
    ...(obstacleId ? { obstacleId } : {}),
  };
}

function isOwnAnchorObstacle(
  occurrence: PsIsonoteLayoutOccurrence,
  obstacle: PsIsonotePageLayoutInput['obstacles'][number],
): boolean {
  return obstacle.kind === 'matched-anchor' &&
    intersectionArea(occurrence.anchorRect, obstacle.rect) > 0;
}

function preferredSidePenalty(
  kind: PsIsonoteCandidateKind,
  preferredSide: PsIsonotePageLayoutOptions['preferredSide'],
): number {
  if (preferredSide === 'auto') return 0;
  const isLeft = kind === 'west' || kind === 'north-west' || kind === 'south-west' || kind === 'left-margin';
  const isRight = kind === 'east' || kind === 'north-east' || kind === 'south-east' || kind === 'right-margin';
  if (preferredSide === 'left' && isRight) return 120;
  if (preferredSide === 'right' && isLeft) return 120;
  return 0;
}

function scoreLeaderRoute(options: {
  occurrence: PsIsonoteLayoutOccurrence;
  route: PsIsonoteCalloutCandidate['leader'];
  input: PsIsonotePageLayoutInput;
  layoutOptions: PsIsonotePageLayoutOptions;
}): { score: number; rejected: boolean; diagnostics: PsIsonoteLayoutDiagnostic[] } {
  let score = pathLength(options.route) * 2;
  let rejected = false;
  const diagnostics: PsIsonoteLayoutDiagnostic[] = [];

  if (pathLength(options.route) > options.layoutOptions.longLeaderThreshold) {
    const penalty = (pathLength(options.route) - options.layoutOptions.longLeaderThreshold) * 4;
    score += penalty;
    diagnostics.push(diagnostic(
      'REVIEW_LONG_LEADER',
      `Leader length ${pathLength(options.route).toFixed(1)} exceeds the preferred threshold.`,
      penalty,
    ));
  }

  for (const obstacle of options.input.obstacles) {
    if (isOwnAnchorObstacle(options.occurrence, obstacle)) continue;
    if (!pathIntersectsRect(options.route, obstacle.rect, options.layoutOptions.leaderClearance)) continue;

    if (obstacle.hard) {
      rejected = true;
      score += HARD_REJECTION_PENALTY;
      diagnostics.push(diagnostic(
        'UNPLACEABLE_HARD_OBSTACLE',
        `Leader intersects hard obstacle ${obstacle.id}.`,
        HARD_REJECTION_PENALTY,
        obstacle.id,
      ));
      continue;
    }

    const penalty = Math.max(50, obstacle.weight * 250);
    score += penalty;
    diagnostics.push(diagnostic(
      obstacle.kind === 'drawing-ink' ? 'REVIEW_DENSE_DRAWING_REGION' : 'REVIEW_SOFT_OBSTACLE_OVERLAP',
      `Leader crosses ${obstacle.kind} obstacle ${obstacle.id}.`,
      penalty,
      obstacle.id,
    ));
  }

  return { score, rejected, diagnostics };
}

function evaluateCandidate(options: {
  occurrence: PsIsonoteLayoutOccurrence;
  kind: PsIsonoteCandidateKind;
  box: PdfRect;
  input: PsIsonotePageLayoutInput;
  layoutOptions: PsIsonotePageLayoutOptions;
}): PsIsonoteCalloutCandidate {
  const anchor = occurrenceAnchor(options.occurrence);
  let score = preferredSidePenalty(options.kind, options.layoutOptions.preferredSide);
  let rejected = false;
  const diagnostics: PsIsonoteLayoutDiagnostic[] = [];

  if (!rectInsidePage(options.box, options.input.page, options.layoutOptions.pageMargin)) {
    rejected = true;
    score += HARD_REJECTION_PENALTY;
    diagnostics.push(diagnostic(
      'UNPLACEABLE_OUTSIDE_PAGE',
      'Candidate is outside the printable page region.',
      HARD_REJECTION_PENALTY,
    ));
  }

  const boxArea = Math.max(1, rectArea(options.box));
  for (const obstacle of options.input.obstacles) {
    if (isOwnAnchorObstacle(options.occurrence, obstacle)) continue;
    const overlap = intersectionArea(options.box, obstacle.rect);
    if (overlap <= 0) continue;

    if (obstacle.hard) {
      rejected = true;
      score += HARD_REJECTION_PENALTY;
      diagnostics.push(diagnostic(
        'UNPLACEABLE_HARD_OBSTACLE',
        `Callout overlaps hard obstacle ${obstacle.id}.`,
        HARD_REJECTION_PENALTY,
        obstacle.id,
      ));
      continue;
    }

    const overlapRatio = overlap / boxArea;
    const penalty = Math.max(1, overlapRatio * obstacle.weight * 10_000);
    score += penalty;
    const code = obstacle.kind === 'pdf-text'
      ? 'REVIEW_TEXT_OVERLAP'
      : obstacle.kind === 'drawing-ink'
        ? 'REVIEW_DENSE_DRAWING_REGION'
        : 'REVIEW_SOFT_OBSTACLE_OVERLAP';
    diagnostics.push(diagnostic(
      code,
      `Callout overlaps ${obstacle.kind} obstacle ${obstacle.id} by ${(overlapRatio * 100).toFixed(1)}%.`,
      penalty,
      obstacle.id,
    ));
  }

  if (options.kind === 'left-margin' || options.kind === 'right-margin') {
    score += 80;
    diagnostics.push(diagnostic(
      'REVIEW_MARGIN_FALLBACK',
      `Callout uses the ${options.kind === 'left-margin' ? 'left' : 'right'} margin fallback.`,
      80,
    ));
  }

  const routes = orthogonalLeaderRoutes(
    options.box,
    anchor,
    options.layoutOptions.style.anchorRadius,
  );
  const evaluatedRoutes = routes.map((route, routeIndex) => ({
    route,
    routeIndex,
    ...scoreLeaderRoute({
      occurrence: options.occurrence,
      route,
      input: options.input,
      layoutOptions: options.layoutOptions,
    }),
  }));
  const bestRoute = evaluatedRoutes.sort((left, right) =>
    Number(left.rejected) - Number(right.rejected) ||
    left.score - right.score ||
    left.routeIndex - right.routeIndex,
  )[0];

  score += bestRoute.score;
  rejected = rejected || bestRoute.rejected;
  diagnostics.push(...bestRoute.diagnostics);

  if (score > options.layoutOptions.maximumAcceptedScore) {
    rejected = true;
    diagnostics.push(diagnostic(
      'UNPLACEABLE_NO_SAFE_CANDIDATE',
      `Candidate score ${score.toFixed(1)} exceeds the accepted limit.`,
      score - options.layoutOptions.maximumAcceptedScore,
    ));
  }

  return {
    occurrenceId: options.occurrence.occurrenceId,
    kind: options.kind,
    box: options.box,
    anchor,
    leader: bestRoute.route,
    score,
    rejected,
    diagnostics,
  };
}

export function createDefaultPsIsonoteLayoutOptions(options: {
  metrics: TextMetricsProvider;
  preferredSide?: PsIsonotePageLayoutOptions['preferredSide'];
}): PsIsonotePageLayoutOptions {
  return {
    style: { ...DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE },
    metrics: options.metrics,
    pageMargin: 12,
    anchorGap: 10,
    candidateWidths: [150, 180, 210],
    calloutClearance: 5,
    leaderClearance: 2,
    longLeaderThreshold: 240,
    reviewScoreThreshold: 250,
    maximumAcceptedScore: 25_000,
    beamWidth: 32,
    maximumCandidatesPerOccurrence: 24,
    preferredSide: options.preferredSide ?? 'auto',
  };
}

export function generatePsIsonoteCandidates(
  input: PsIsonotePageLayoutInput,
  occurrence: PsIsonoteLayoutOccurrence,
  options: PsIsonotePageLayoutOptions,
): PsIsonoteCalloutCandidate[] {
  const candidates: PsIsonoteCalloutCandidate[] = [];

  for (const width of normalizedWidths(options)) {
    const height = calloutHeight(occurrence, width, options);
    for (const kind of CANDIDATE_KIND_ORDER) {
      const box = boxForKind({
        kind,
        occurrence,
        page: input.page,
        width,
        height,
        gap: options.anchorGap,
        margin: options.pageMargin,
      });
      candidates.push(evaluateCandidate({
        occurrence,
        kind,
        box,
        input,
        layoutOptions: options,
      }));
    }
  }

  return candidates
    .sort((left, right) =>
      Number(left.rejected) - Number(right.rejected) ||
      left.score - right.score ||
      candidateKindRank(left.kind) - candidateKindRank(right.kind) ||
      left.box.width - right.box.width ||
      left.box.y - right.box.y ||
      left.box.x - right.box.x,
    )
    .slice(0, Math.max(1, options.maximumCandidatesPerOccurrence));
}

function pathsIntersect(
  left: PsIsonoteCalloutCandidate['leader'],
  right: PsIsonoteCalloutCandidate['leader'],
): boolean {
  for (let leftIndex = 0; leftIndex < left.points.length - 1; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.points.length - 1; rightIndex += 1) {
      if (segmentsIntersect(
        left.points[leftIndex],
        left.points[leftIndex + 1],
        right.points[rightIndex],
        right.points[rightIndex + 1],
      )) return true;
    }
  }
  return false;
}

function interactionDiagnostics(options: {
  candidate: PsIsonoteCalloutCandidate;
  state: PsIsonoteLayoutState;
  layoutOptions: PsIsonotePageLayoutOptions;
}): { rejected: boolean; score: number; diagnostics: PsIsonoteLayoutDiagnostic[] } {
  let rejected = false;
  let score = 0;
  const diagnostics: PsIsonoteLayoutDiagnostic[] = [];

  for (const selected of options.state.selected) {
    if (selected.candidate.rejected) continue;

    if (rectsOverlap(
      options.candidate.box,
      selected.candidate.box,
      options.layoutOptions.calloutClearance,
    )) {
      rejected = true;
      score += CALLOUT_COLLISION_PENALTY;
      diagnostics.push(diagnostic(
        'UNPLACEABLE_CALLOUT_COLLISION',
        `Candidate collides with occurrence ${selected.occurrence.occurrenceId}.`,
        CALLOUT_COLLISION_PENALTY,
      ));
    }

    const leaderHitsBox = pathIntersectsRect(
      options.candidate.leader,
      selected.candidate.box,
      options.layoutOptions.leaderClearance,
    ) || pathIntersectsRect(
      selected.candidate.leader,
      options.candidate.box,
      options.layoutOptions.leaderClearance,
    );
    const leadersCross = pathsIntersect(options.candidate.leader, selected.candidate.leader);

    if (leaderHitsBox || leadersCross) {
      rejected = true;
      score += LEADER_COLLISION_PENALTY;
      diagnostics.push(diagnostic(
        'UNPLACEABLE_LEADER_COLLISION',
        `Leader conflicts with occurrence ${selected.occurrence.occurrenceId}.`,
        LEADER_COLLISION_PENALTY,
      ));
    }
  }

  return { rejected, score, diagnostics };
}

function stateTieBreaker(state: PsIsonoteLayoutState): string {
  return state.selected
    .map(({ occurrence, candidate }) => [
      occurrence.occurrenceId,
      candidate.kind,
      candidate.box.x.toFixed(2),
      candidate.box.y.toFixed(2),
      candidate.box.width.toFixed(2),
    ].join(':'))
    .join('|');
}

function occurrenceSortKey(
  occurrence: PsIsonoteLayoutOccurrence,
  candidateCount: number,
): readonly [number, number, number, string, string] {
  return [
    candidateCount,
    occurrence.anchorRect.y,
    occurrence.anchorRect.x,
    occurrence.content.psNo,
    occurrence.occurrenceId,
  ];
}

function compareOccurrenceEntries(
  left: { occurrence: PsIsonoteLayoutOccurrence; candidates: PsIsonoteCalloutCandidate[] },
  right: { occurrence: PsIsonoteLayoutOccurrence; candidates: PsIsonoteCalloutCandidate[] },
): number {
  const leftKey = occurrenceSortKey(
    left.occurrence,
    left.candidates.filter((candidate) => !candidate.rejected).length,
  );
  const rightKey = occurrenceSortKey(
    right.occurrence,
    right.candidates.filter((candidate) => !candidate.rejected).length,
  );
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] < rightKey[index]) return -1;
    if (leftKey[index] > rightKey[index]) return 1;
  }
  return 0;
}

function unplaceableCandidate(
  candidates: PsIsonoteCalloutCandidate[],
  occurrence: PsIsonoteLayoutOccurrence,
): PsIsonoteCalloutCandidate {
  const fallback = candidates[0];
  if (!fallback) {
    const anchor = occurrenceAnchor(occurrence);
    return {
      occurrenceId: occurrence.occurrenceId,
      kind: 'right-margin',
      box: { x: anchor.x, y: anchor.y, width: 1, height: 1 },
      anchor,
      leader: { points: [anchor, { x: anchor.x + 1, y: anchor.y }], anchorRadius: 1 },
      score: HARD_REJECTION_PENALTY,
      rejected: true,
      diagnostics: [diagnostic(
        'UNPLACEABLE_NO_SAFE_CANDIDATE',
        'No callout candidate could be generated.',
        HARD_REJECTION_PENALTY,
      )],
    };
  }

  return {
    ...fallback,
    rejected: true,
    score: Math.max(fallback.score, HARD_REJECTION_PENALTY),
    diagnostics: [
      ...fallback.diagnostics,
      diagnostic(
        'UNPLACEABLE_NO_SAFE_CANDIDATE',
        'No candidate remained after page-level collision solving.',
        HARD_REJECTION_PENALTY,
      ),
    ],
  };
}

function qualityForCandidate(
  candidate: PsIsonoteCalloutCandidate,
  options: PsIsonotePageLayoutOptions,
): PsIsonotePlannedCallout['quality'] {
  if (candidate.rejected) return 'unplaceable';
  if (candidate.score >= options.reviewScoreThreshold || candidate.diagnostics.length > 0) return 'review';
  return 'clean';
}

export function solvePsIsonotePageLayout(
  input: PsIsonotePageLayoutInput,
  options: PsIsonotePageLayoutOptions,
): PsIsonotePageLayoutResult {
  if (input.pageNumber < 1 || !Number.isInteger(input.pageNumber)) {
    throw new Error('Page number must be a positive integer.');
  }
  if (input.page.width <= 0 || input.page.height <= 0) {
    throw new Error('Page dimensions must be positive.');
  }

  const entries = input.occurrences
    .map((occurrence) => ({
      occurrence,
      candidates: generatePsIsonoteCandidates(input, occurrence, options),
    }))
    .sort(compareOccurrenceEntries);

  let states: PsIsonoteLayoutState[] = [{ selected: [], totalScore: 0 }];

  for (const entry of entries) {
    const nextStates: PsIsonoteLayoutState[] = [];

    for (const state of states) {
      let acceptedForState = 0;
      for (const candidate of entry.candidates) {
        if (candidate.rejected) continue;
        const interaction = interactionDiagnostics({
          candidate,
          state,
          layoutOptions: options,
        });
        if (interaction.rejected) continue;

        nextStates.push({
          selected: [
            ...state.selected,
            {
              occurrence: entry.occurrence,
              candidate: {
                ...candidate,
                score: candidate.score + interaction.score,
                diagnostics: [...candidate.diagnostics, ...interaction.diagnostics],
              },
            },
          ],
          totalScore: state.totalScore + candidate.score + interaction.score,
        });
        acceptedForState += 1;
      }

      if (acceptedForState === 0) {
        const candidate = unplaceableCandidate(entry.candidates, entry.occurrence);
        nextStates.push({
          selected: [...state.selected, { occurrence: entry.occurrence, candidate }],
          totalScore: state.totalScore + candidate.score,
        });
      }
    }

    states = nextStates
      .sort((left, right) =>
        left.totalScore - right.totalScore ||
        stateTieBreaker(left).localeCompare(stateTieBreaker(right)),
      )
      .slice(0, Math.max(1, options.beamWidth));
  }

  const best = states[0] ?? { selected: [], totalScore: 0 };
  const callouts = best.selected
    .map(({ occurrence, candidate }): PsIsonotePlannedCallout => ({
      psNo: occurrence.psNo,
      pageNumber: occurrence.pageNumber,
      mappingHash: occurrence.mappingHash,
      occurrenceId: occurrence.occurrenceId,
      content: occurrence.content,
      box: candidate.box,
      anchor: candidate.anchor,
      leader: candidate.leader,
      quality: qualityForCandidate(candidate, options),
      diagnostics: candidate.diagnostics.map((item) => item.code),
      score: candidate.score,
      styleVersion: options.style.styleVersion,
    }))
    .sort((left, right) =>
      left.pageNumber - right.pageNumber ||
      left.box.y - right.box.y ||
      left.box.x - right.box.x ||
      left.occurrenceId.localeCompare(right.occurrenceId),
    );

  return {
    pageNumber: input.pageNumber,
    callouts,
    rejectedOccurrenceIds: callouts
      .filter((callout) => callout.quality === 'unplaceable')
      .map((callout) => callout.occurrenceId),
    totalScore: best.totalScore,
    diagnostics: best.selected.flatMap(({ candidate }) => candidate.diagnostics),
  };
}
