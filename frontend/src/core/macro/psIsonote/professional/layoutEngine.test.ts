import { describe, expect, it } from 'vitest';
import { solvePageLayout, evaluateCandidate, ALL_PLACEMENT_CLASSES } from './layoutEngine';
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

  it('penalizes and records diagnostics for soft obstacles (existing text and drawing density)', () => {
    const softObstacles: Obstacle[] = [
      { id: 'txt-1', type: 'soft', source: 'existing-text', rect: { x: 320, y: 380, width: 100, height: 40 } },
    ];
    const evalResult = evaluateCandidate('right', { x: 310, y: 370, width: 150, height: 60 }, baseOccurrence, { ...defaultOptions, obstacles: softObstacles }, []);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.diagnostics).toHaveLength(1);
    expect(evalResult.diagnostics[0].type).toBe('text-overlap');
    expect(evalResult.score).toBeLessThan(85);
  });

  it('uses deterministic beam search to resolve multiple occurrences without collisions', () => {
    const occ1: OccurrenceInput = { ...baseOccurrence, id: '1', targetPoint: { x: 300, y: 400 } };
    const occ2: OccurrenceInput = { ...baseOccurrence, id: '2', psNo: 'PS-101', targetPoint: { x: 310, y: 405 } };

    const solution = solvePageLayout([occ1, occ2], defaultOptions);
    expect(solution.unplaceableCount).toBe(0);
    expect(solution.results).toHaveLength(2);

    const placed1 = solution.results.find((r) => r.occurrenceId === '1')?.callout;
    const placed2 = solution.results.find((r) => r.occurrenceId === '2')?.callout;
    expect(placed1).toBeDefined();
    expect(placed2).toBeDefined();
    // Verify they don't share the exact same box position
    expect(placed1?.box.y === placed2?.box.y && placed1?.box.x === placed2?.box.x).toBe(false);
  });

  it('strictly returns unplaceable status when all placements are impossible (no silent bad placement)', () => {
    // Surround target point on a tiny page or with massive hard obstacles
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
    expect(solution.results[0].status).toBe('unplaceable');
    expect(solution.results[0].callout).toBeUndefined();
    expect(solution.results[0].diagnostics[0].message).toContain('All 10 placement classes rejected');
  });
});
