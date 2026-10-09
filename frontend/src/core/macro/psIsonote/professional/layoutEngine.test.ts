import { describe, expect, it } from 'vitest';
import type { TextMetricsProvider } from './model';
import { intersectionArea, rectsOverlap } from './layoutGeometry';
import {
  createDefaultPsIsonoteLayoutOptions,
  generatePsIsonoteCandidates,
  solvePsIsonotePageLayout,
} from './layoutEngine';
import type {
  PsIsonoteLayoutOccurrence,
  PsIsonotePageLayoutInput,
} from './layoutTypes';

const metrics: TextMetricsProvider = {
  widthOfText: (text, fontSize, weight) =>
    text.length * fontSize * (weight === 'bold' ? 0.58 : 0.52),
};

function occurrence(
  occurrenceId: string,
  x: number,
  y: number,
): PsIsonoteLayoutOccurrence {
  return {
    psNo: `PS-${occurrenceId}`,
    pageNumber: 1,
    mappingHash: `sha256:${'a'.repeat(64)}`,
    occurrenceId: `sha256:${occurrenceId.padEnd(64, 'b').slice(0, 64)}`,
    content: {
      psNo: `PS-${occurrenceId}`,
      family: 'R+G',
      isonote: 'REST, GUIDE',
    },
    anchorRect: { x, y, width: 60, height: 12 },
  };
}

function pageInput(
  occurrences: PsIsonoteLayoutOccurrence[],
  obstacles: PsIsonotePageLayoutInput['obstacles'] = [],
): PsIsonotePageLayoutInput {
  return {
    pageNumber: 1,
    page: { width: 600, height: 420 },
    occurrences,
    obstacles,
  };
}

describe('professional PS ISONOTE layout engine', () => {
  it('generates multi-direction and margin candidates deterministically', () => {
    const input = pageInput([occurrence('11167.4', 250, 180)]);
    const options = createDefaultPsIsonoteLayoutOptions({ metrics });
    options.maximumCandidatesPerOccurrence = 30;
    const candidates = generatePsIsonoteCandidates(input, input.occurrences[0], options);
    const kinds = new Set(candidates.map((candidate) => candidate.kind));

    expect(kinds.has('east')).toBe(true);
    expect(kinds.has('west')).toBe(true);
    expect(kinds.has('north')).toBe(true);
    expect(kinds.has('south')).toBe(true);
    expect(kinds.has('right-margin') || kinds.has('left-margin')).toBe(true);
    expect(generatePsIsonoteCandidates(input, input.occurrences[0], options)).toEqual(candidates);
  });

  it('does not select a callout over a hard reserved region', () => {
    const input = pageInput(
      [occurrence('11167.4', 100, 170)],
      [{
        id: 'title-block',
        kind: 'title-block',
        rect: { x: 170, y: 110, width: 420, height: 200 },
        hard: true,
        weight: 100,
      }],
    );
    const result = solvePsIsonotePageLayout(
      input,
      createDefaultPsIsonoteLayoutOptions({ metrics }),
    );

    expect(result.callouts).toHaveLength(1);
    expect(result.callouts[0].quality).not.toBe('unplaceable');
    expect(intersectionArea(result.callouts[0].box, input.obstacles[0].rect)).toBe(0);
  });

  it('marks soft drawing overlap for review rather than silently treating it as clean', () => {
    const input = pageInput(
      [occurrence('11167.4', 250, 180)],
      [{
        id: 'drawing-density',
        kind: 'drawing-ink',
        rect: { x: 0, y: 0, width: 600, height: 420 },
        hard: false,
        weight: 1,
      }],
    );
    const options = createDefaultPsIsonoteLayoutOptions({ metrics });
    options.maximumAcceptedScore = 100_000;
    const result = solvePsIsonotePageLayout(input, options);

    expect(result.callouts[0].quality).toBe('review');
    expect(result.callouts[0].diagnostics).toContain('REVIEW_DENSE_DRAWING_REGION');
  });

  it('solves nearby occurrences without overlapping accepted callout boxes', () => {
    const input = pageInput([
      occurrence('11167.4', 210, 160),
      occurrence('11168.8', 215, 205),
    ]);
    const options = createDefaultPsIsonoteLayoutOptions({ metrics });
    const result = solvePsIsonotePageLayout(input, options);

    expect(result.callouts).toHaveLength(2);
    expect(result.rejectedOccurrenceIds).toEqual([]);
    expect(rectsOverlap(
      result.callouts[0].box,
      result.callouts[1].box,
      options.calloutClearance,
    )).toBe(false);
  });

  it('returns an explicit unplaceable result when no safe region exists', () => {
    const input = pageInput(
      [occurrence('11167.4', 250, 180)],
      [{
        id: 'full-page-reserved',
        kind: 'reserved-region',
        rect: { x: 0, y: 0, width: 600, height: 420 },
        hard: true,
        weight: 100,
      }],
    );
    const result = solvePsIsonotePageLayout(
      input,
      createDefaultPsIsonoteLayoutOptions({ metrics }),
    );

    expect(result.callouts[0].quality).toBe('unplaceable');
    expect(result.rejectedOccurrenceIds).toEqual([input.occurrences[0].occurrenceId]);
    expect(result.callouts[0].diagnostics).toContain('UNPLACEABLE_NO_SAFE_CANDIDATE');
  });

  it('produces the same page plan for identical inputs and settings', () => {
    const input = pageInput([
      occurrence('11167.4', 120, 120),
      occurrence('11168.8', 360, 250),
    ]);
    const options = createDefaultPsIsonoteLayoutOptions({ metrics });

    expect(solvePsIsonotePageLayout(input, options)).toEqual(
      solvePsIsonotePageLayout(input, options),
    );
  });
});
