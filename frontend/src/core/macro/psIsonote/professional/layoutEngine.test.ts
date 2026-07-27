import { describe, expect, it } from 'vitest';
import {
  ALL_PLACEMENT_CLASSES,
  generateCandidateAssessments,
  solvePageLayout,
  validateLayoutOptions,
} from './layoutEngine';
import type {
  CandidateAssessment,
  Obstacle,
  OccurrenceInput,
  PageLayoutOptions,
} from './layoutTypes';

const semanticContent = Object.freeze({
  isoNoteValue: 'one two three four five six seven eight nine ten',
  confidence: 'HIGH' as const,
});
const style = Object.freeze({ isReview: false, fontSize: 9.8 });

function occurrence(id: string, x: number, y: number): OccurrenceInput {
  return {
    id,
    psNo: `PS-${id}`,
    pageNumber: 1,
    content: semanticContent,
    targetPoint: { x, y },
    preferredWidth: 160,
    style,
  };
}

function options(overrides: Partial<PageLayoutOptions> = {}): PageLayoutOptions {
  return {
    pageWidth: 640,
    pageHeight: 420,
    pageMargin: 20,
    obstacles: [],
    obstaclePolicy: { bySource: {} },
    compromiseThreshold: 100,
    beamWidth: 4,
    ...overrides,
  };
}

function assessment(
  assessments: readonly CandidateAssessment[],
  placement: CandidateAssessment['placementClass'],
  routeKind = 'direct',
): CandidateAssessment {
  const match = assessments.find(
    (item) => item.placementClass === placement && item.route.kind === routeKind,
  );
  if (!match) throw new Error(`Missing ${placement}/${routeKind} assessment.`);
  return match;
}

function greedyTrapObstacles(): readonly Obstacle[] {
  return [
    { id: 'r', source: 'protected', rect: { x: 550, y: 220, width: 5, height: 5 } },
    { id: 'tr', source: 'protected', rect: { x: 550, y: 180, width: 5, height: 5 } },
    { id: 't', source: 'protected', rect: { x: 430, y: 150, width: 5, height: 5 } },
    { id: 'b', source: 'protected', rect: { x: 420, y: 270, width: 5, height: 5 } },
    { id: 'br', source: 'protected', rect: { x: 550, y: 270, width: 5, height: 5 } },
    { id: 'tl', source: 'protected', rect: { x: 320, y: 155, width: 5, height: 5 } },
    { id: 'bl', source: 'protected', rect: { x: 300, y: 280, width: 5, height: 5 } },
    { id: 'ml', source: 'protected', rect: { x: 30, y: 230, width: 5, height: 5 } },
  ];
}

function onlyRightBlockers(): readonly Obstacle[] {
  return [
    { id: 'top', source: 'protected', rect: { x: 200, y: 120, width: 5, height: 5 } },
    { id: 'bottom', source: 'protected', rect: { x: 200, y: 250, width: 5, height: 5 } },
    { id: 'left', source: 'protected', rect: { x: 100, y: 180, width: 5, height: 5 } },
    { id: 'top-right', source: 'protected', rect: { x: 350, y: 120, width: 5, height: 5 } },
    { id: 'bottom-right', source: 'protected', rect: { x: 350, y: 250, width: 5, height: 5 } },
    { id: 'margin-right', source: 'protected', rect: { x: 500, y: 180, width: 5, height: 5 } },
    { id: 'margin-left', source: 'protected', rect: { x: 30, y: 180, width: 5, height: 5 } },
  ];
}

const protectedPolicy = {
  bySource: {
    protected: { mode: 'prohibited' as const, boxPenalty: 1000, leaderPenalty: 1000 },
  },
};

describe('deterministic least-obstruction layout', () => {
  it('uses exactly the documented placement classes in stable order', () => {
    expect(ALL_PLACEMENT_CLASSES).toEqual([
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
    ]);
  });

  it('reuses the merged M001 semantic, style, dimensions, and planner contracts', () => {
    const solution = solvePageLayout([occurrence('A', 230, 190)], options());
    const result = solution.results[0];
    expect(result?.status).toBe('clear');
    if (!result || result.status === 'unplaceable') return;
    expect(result.box).toEqual({ x: 258, y: 162, width: 160, height: 56 });
    expect(result.callout.content).toEqual(semanticContent);
    expect(result.callout.style.bodyFontId).toBe('Helvetica');
    expect(result.callout.style.tagFontId).toBe('Helvetica-Bold');
    expect(result.callout.box).toEqual(result.box);
  });

  it('ranks every clear candidate ahead of a shorter compromised candidate', () => {
    const obstacle: Obstacle = {
      id: 'pipe-box',
      source: 'pipe',
      rect: { x: 300, y: 180, width: 5, height: 5 },
    };
    const assessments = generateCandidateAssessments(
      occurrence('A', 230, 190),
      options({
        obstacles: [obstacle],
        obstaclePolicy: {
          bySource: { pipe: { mode: 'weighted', boxPenalty: 50, leaderPenalty: 5 } },
        },
      }),
      [],
    );
    expect(assessment(assessments, 'right').outcome).toBe('compromised');
    expect(assessments[0]?.outcome).toBe('clear');
    expect(assessments[0]?.placementClass).toBe('top');
  });

  it('scores leader crossings below box obstruction for the same obstacle source', () => {
    const assessments = generateCandidateAssessments(
      occurrence('A', 230, 190),
      options({
        obstacles: [
          { id: 'route-hit', source: 'pipe', rect: { x: 240, y: 188, width: 4, height: 4 } },
          { id: 'box-hit', source: 'pipe', rect: { x: 300, y: 180, width: 4, height: 4 } },
        ],
        obstaclePolicy: {
          bySource: { pipe: { mode: 'weighted', boxPenalty: 50, leaderPenalty: 5 } },
        },
      }),
      [],
    );
    const right = assessment(assessments, 'right');
    const penalties = right.diagnostics.map((item) => [item.geometry, item.penalty]);
    expect(penalties).toContainEqual(['leader', 5]);
    expect(penalties).toContainEqual(['box', 50]);
    expect(right.compromiseCost).toBe(55);
  });

  it('selects the lowest-cost compromised candidate when no clear candidate exists', () => {
    const huge: Obstacle = {
      id: 'weighted-page',
      source: 'pipe',
      rect: { x: 0, y: 0, width: 640, height: 420 },
    };
    const solution = solvePageLayout([occurrence('A', 230, 190)], options({
      obstacles: [huge],
      obstaclePolicy: {
        bySource: { pipe: { mode: 'weighted', boxPenalty: 50, leaderPenalty: 5 } },
      },
    }));
    const result = solution.results[0];
    expect(result?.status).toBe('compromised');
    if (!result || result.status !== 'compromised') return;
    expect(result.requiresReview).toBe(true);
    expect(result.placementClass).toBe('right');
    expect(result.assessment.compromiseCost).toBe(55);
    expect(result.occurrence).toEqual(occurrence('A', 230, 190));
  });

  it('allows a low-priority leader crossing as compromised without allowing box obstruction', () => {
    const solution = solvePageLayout([occurrence('A', 230, 190)], options({
      obstacles: [
        ...onlyRightBlockers(),
        { id: 'pipe-route', source: 'pipe', rect: { x: 240, y: 188, width: 4, height: 4 } },
      ],
      obstaclePolicy: {
        bySource: {
          ...protectedPolicy.bySource,
          pipe: { mode: 'weighted', boxPenalty: 50, leaderPenalty: 5 },
        },
      },
      compromiseThreshold: 5,
    }));
    const result = solution.results[0];
    expect(result?.status).toBe('compromised');
    if (result?.status === 'compromised') {
      expect(result.placementClass).toBe('right');
      expect(result.assessment.compromiseCost).toBe(5);
      expect(result.diagnostics.map((item) => item.geometry)).toEqual(['leader']);
    }
  });

  it('returns lossless unplaceable results above the compromise threshold', () => {
    const original = occurrence('A', 230, 190);
    const solution = solvePageLayout([original], options({
      obstacles: [{
        id: 'weighted-page',
        source: 'pipe',
        rect: { x: 0, y: 0, width: 640, height: 420 },
      }],
      obstaclePolicy: {
        bySource: { pipe: { mode: 'weighted', boxPenalty: 50, leaderPenalty: 5 } },
      },
      compromiseThreshold: 50,
    }));
    const result = solution.results[0];
    expect(result?.status).toBe('unplaceable');
    if (!result || result.status !== 'unplaceable') return;
    expect(result.occurrence).toEqual(original);
    expect(result.attemptedCandidates.length).toBeGreaterThan(10);
    expect(result.bestRejectedCandidate).toBeDefined();
    expect(result.reasons[0]).toContain('exceeds threshold');
  });

  it('rejects prohibited clashes and missing policies fail-closed', () => {
    const obstacle = {
      id: 'protected-page',
      source: 'protected',
      rect: { x: 0, y: 0, width: 640, height: 420 },
    } as const;
    const prohibited = solvePageLayout([occurrence('A', 230, 190)], options({
      obstacles: [obstacle],
      obstaclePolicy: protectedPolicy,
    }));
    const missing = solvePageLayout([occurrence('A', 230, 190)], options({
      obstacles: [obstacle],
    }));
    expect(prohibited.results[0]?.status).toBe('unplaceable');
    expect(missing.results[0]?.status).toBe('unplaceable');
    const missingResult = missing.results[0];
    if (missingResult?.status === 'unplaceable') {
      expect(missingResult.diagnostics.some(
        (item) => item.code === 'missing-obstacle-policy',
      )).toBe(true);
    }
  });

  it('proves beam width one falls into the approved greedy trap while width two succeeds', () => {
    const occurrences = [occurrence('A', 230, 190), occurrence('B', 420, 230)];
    const common = {
      obstacles: greedyTrapObstacles(),
      obstaclePolicy: protectedPolicy,
    };
    const greedy = solvePageLayout(occurrences, options({ ...common, beamWidth: 1 }));
    const wider = solvePageLayout(occurrences, options({ ...common, beamWidth: 2 }));

    expect(greedy.results.map((result) => result.status)).toEqual(['clear', 'unplaceable']);
    expect(greedy.results[0]?.status === 'clear'
      ? greedy.results[0].placementClass : undefined).toBe('right');
    expect(wider.results.map((result) => result.status)).toEqual(['clear', 'clear']);
    expect(wider.results.map((result) => result.status === 'unplaceable'
      ? undefined : result.placementClass)).toEqual(['top', 'left']);
    expect(wider.results.map((result) => result.occurrence.id)).toEqual(['A', 'B']);
    expect(wider.totalCost).toBe(58);
  });

  it('is deeply deterministic and does not mutate or reuse frozen inputs', () => {
    const first = Object.freeze({
      ...occurrence('A', 230, 190),
      content: semanticContent,
      targetPoint: Object.freeze({ x: 230, y: 190 }),
      style,
    });
    const second = Object.freeze({
      ...occurrence('B', 420, 230),
      content: semanticContent,
      targetPoint: Object.freeze({ x: 420, y: 230 }),
      style,
    });
    const input = Object.freeze([second, first]);
    const configured = Object.freeze(options());
    const before = JSON.stringify({ input, configured });
    const firstRun = solvePageLayout(input, configured);
    const secondRun = solvePageLayout(input, configured);

    expect(firstRun).toStrictEqual(secondRun);
    expect(JSON.stringify({ input, configured })).toBe(before);
    expect(firstRun.results.map((result) => result.occurrence.id)).toEqual(['A', 'B']);
    expect(firstRun.results[0]?.occurrence).not.toBe(first);
  });

  it('validates weighted policy ordering and beam configuration', () => {
    expect(() => validateLayoutOptions(options({
      obstaclePolicy: {
        bySource: { pipe: { mode: 'weighted', boxPenalty: 5, leaderPenalty: 5 } },
      },
    }))).toThrow('leader penalty must be lower');
    expect(() => validateLayoutOptions(options({ beamWidth: 0 }))).toThrow(RangeError);
  });
});
