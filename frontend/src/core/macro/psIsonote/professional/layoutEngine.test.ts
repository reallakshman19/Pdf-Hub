import { describe, expect, it } from 'vitest';
import { solvePageLayout, evaluateCandidate, ALL_PLACEMENT_CLASSES, generateOrthogonalRoutes, simplifyOrthogonalPath } from './layoutEngine';
import { linesIntersect, rectsOverlap } from './layoutGeometry';
import { type OccurrenceInput, type Obstacle, type PageLayoutOptions } from './layoutTypes';

const baseOccurrence: OccurrenceInput = {
  id: 'occ-1',
  psNo: 'PS-100',
  tag: 'Restraint',
  note: ':/PS-100 Restraint Guide',
  confidence: 'HIGH',
  targetPoint: { x: 300, y: 400 },
  pageNumber: 1,
};

const defaultOptions: PageLayoutOptions = {
  pageWidth: 600,
  pageHeight: 800,
  pageMargin: 20,
};

describe('Obstacle-Aware Layout Core (Layer 2)', () => {
  it('supports exactly ten deterministic placement classes', () => {
    expect(ALL_PLACEMENT_CLASSES).toHaveLength(10);
    expect(ALL_PLACEMENT_CLASSES).toContain('margin-right');
    expect(ALL_PLACEMENT_CLASSES).toContain('margin-left');
  });

  it('rejects candidates that collide with page boundaries (hard obstacle)', () => {
    const cornerOcc: OccurrenceInput = {
      ...baseOccurrence,
      targetPoint: { x: 590, y: 15 },
    };
    const evalResult = evaluateCandidate('top-right', { x: 580, y: 5, width: 150, height: 60 }, cornerOcc, defaultOptions, []);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.diagnostics[0].source).toBe('page-boundary');
  });

  it('rejects candidates that overlap the title block (hard obstacle)', () => {
    const titleBlockOptions: PageLayoutOptions = {
      ...defaultOptions,
      titleBlockRect: { x: 400, y: 700, width: 180, height: 80 },
    };
    const nearTitle: OccurrenceInput = { ...baseOccurrence, targetPoint: { x: 450, y: 680 } };
    const evalResult = evaluateCandidate('bottom-right', { x: 410, y: 690, width: 150, height: 60 }, nearTitle, titleBlockOptions, []);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.diagnostics[0].source).toBe('title-block');
  });

  it('penalizes and records diagnostics for soft obstacles and triggers review mode in solvePageLayout', () => {
    const softObstacles: Obstacle[] = [
      { id: 'txt-1', type: 'soft', source: 'existing-text', rect: { x: 320, y: 380, width: 100, height: 40 } },
    ];
    const evalResult = evaluateCandidate('right', { x: 310, y: 370, width: 150, height: 60 }, baseOccurrence, { ...defaultOptions, obstacles: softObstacles }, []);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(evalResult.diagnostics.some(d => d.type === 'text-overlap')).toBe(true);

    // When solved, if soft overlap occurs on all available placement candidates, the placed callout must be flagged for review
    const everywhereSoft: Obstacle[] = [
      { id: 'txt-all', type: 'soft', source: 'existing-text', rect: { x: 0, y: 0, width: 600, height: 800 } },
    ];
    const solution = solvePageLayout([baseOccurrence], { ...defaultOptions, obstacles: everywhereSoft });
    const res = solution.results[0];
    if (res.status === 'placed') {
      expect(res.callout.style.isReview).toBe(true);
      expect(res.callout.style.borderColor).toBe('#ea580c');
    }
  });

  it('supports structured segment obstacles without flattening them into zero-width rectangles', () => {
    const segObstacles: Obstacle[] = [
      { id: 'pipe-1', kind: 'segment', type: 'hard', source: 'piping', start: { x: 290, y: 350 }, end: { x: 450, y: 350 }, clearance: 10 },
    ];
    const evalResult = evaluateCandidate('top-right', { x: 300, y: 320, width: 150, height: 40 }, baseOccurrence, { ...defaultOptions, obstacles: segObstacles }, []);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.diagnostics.some(d => d.source === 'piping')).toBe(true);
  });

  it('generates dynamic orthogonal elbow routes and simplifies collinear points', () => {
    const routes = generateOrthogonalRoutes({ x: 100, y: 100 }, { x: 200, y: 150 });
    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 150 },
    ]);

    const simplified = simplifyOrthogonalPath([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 50 },
    ]);
    expect(simplified).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 50 },
    ]);
  });

  it('rejects NaN and Infinity in geometry helpers', () => {
    expect(linesIntersect({ x: NaN, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: Infinity, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('uses deterministic beam search to resolve multiple occurrences without collisions', () => {
    const occ1: OccurrenceInput = { ...baseOccurrence, id: '1', targetPoint: { x: 300, y: 400 } };
    const occ2: OccurrenceInput = { ...baseOccurrence, id: '2', psNo: 'PS-101', targetPoint: { x: 310, y: 405 } };

    const solution = solvePageLayout([occ1, occ2], defaultOptions);
    expect(solution.unplaceableCount).toBe(0);
    expect(solution.results).toHaveLength(2);

    const res1 = solution.results.find((r) => r.occurrenceId === '1');
    const res2 = solution.results.find((r) => r.occurrenceId === '2');
    expect(res1?.status).toBe('placed');
    expect(res2?.status).toBe('placed');

    if (res1?.status === 'placed' && res2?.status === 'placed') {
      expect(res1.callout).toBeDefined();
      expect(res2.callout).toBeDefined();
      expect(res1.callout.box.y === res2.callout.box.y && res1.callout.box.x === res2.callout.box.x).toBe(false);
    }
  });

  it('strictly returns unplaceable status and preserves OccurrenceInput when placements are blocked', () => {
    const blockedOptions: PageLayoutOptions = {
      pageWidth: 200,
      pageHeight: 200,
      pageMargin: 10,
      obstacles: [
        { id: 'hard-1', type: 'hard', source: 'equipment', rect: { x: 0, y: 0, width: 200, height: 200 } },
      ],
    };
    const solution = solvePageLayout([baseOccurrence], blockedOptions);
    expect(solution.unplaceableCount).toBe(1);
    const res = solution.results[0];
    expect(res.status).toBe('unplaceable');
    expect('callout' in res).toBe(false);
    expect(res.diagnostics.length).toBeGreaterThan(0);
    if (res.status === 'unplaceable') {
      expect(res.occurrence).toEqual(baseOccurrence);
    }
  });
});
