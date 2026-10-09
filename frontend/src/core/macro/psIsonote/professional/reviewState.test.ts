import { describe, expect, it } from 'vitest';
import {
  createPsIsonoteReviewState,
  evaluatePsIsonoteCommitGate,
  reducePsIsonoteReviewState,
  reviewedPsIsonoteCallouts,
} from './reviewState';
import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PsIsonotePlannedCallout,
} from './model';

function callout(
  suffix: string,
  quality: PsIsonotePlannedCallout['quality'],
  x: number,
  pageNumber = 1,
): PsIsonotePlannedCallout {
  return {
    psNo: `PS-${suffix}`,
    pageNumber,
    mappingHash: `sha256:${'a'.repeat(64)}`,
    occurrenceId: `sha256:${suffix.padEnd(64, 'b').slice(0, 64)}`,
    content: {
      psNo: `PS-${suffix}`,
      family: 'R+G',
      isonote: 'REST, GUIDE',
    },
    box: { x, y: 100, width: 180, height: 48 },
    anchor: { x: x - 30, y: 140 },
    leader: {
      points: [
        { x, y: 124 },
        { x: x - 30, y: 124 },
        { x: x - 30, y: 140 },
      ],
      anchorRadius: 2.5,
    },
    quality,
    diagnostics: quality === 'clean' ? [] : ['REVIEW_TEXT_OVERLAP'],
    score: quality === 'clean' ? 10 : 400,
    styleVersion: DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE.styleVersion,
  };
}

describe('professional PS ISONOTE review state', () => {
  it('auto-approves clean plans and holds review plans for a user decision', () => {
    const clean = callout('11167.4', 'clean', 260);
    const review = callout('11168.8', 'review', 300);
    const state = createPsIsonoteReviewState([review, clean]);
    const gate = evaluatePsIsonoteCommitGate(state);

    expect(state.itemsByOccurrenceId[clean.occurrenceId].decision).toBe('approved');
    expect(state.itemsByOccurrenceId[review.occurrenceId].decision).toBe('pending');
    expect(gate.allowed).toBe(false);
    expect(gate.blockingOccurrenceIds).toEqual([review.occurrenceId]);
  });

  it('requires a moved manual callout to be explicitly approved', () => {
    const review = callout('11168.8', 'review', 300);
    let state = createPsIsonoteReviewState([review]);
    state = reducePsIsonoteReviewState(state, {
      type: 'move',
      occurrenceId: review.occurrenceId,
      box: { x: 390, y: 40, width: 180, height: 48 },
      leader: {
        points: [
          { x: 390, y: 64 },
          { x: 360, y: 64 },
          { x: 270, y: 140 },
        ],
        anchorRadius: 2.5,
      },
    });

    expect(state.itemsByOccurrenceId[review.occurrenceId]).toMatchObject({
      decision: 'pending',
      source: 'manual',
      revision: 1,
      current: { quality: 'manual' },
    });
    expect(evaluatePsIsonoteCommitGate(state).allowed).toBe(false);

    state = reducePsIsonoteReviewState(state, {
      type: 'approve',
      occurrenceId: review.occurrenceId,
    });
    expect(evaluatePsIsonoteCommitGate(state).allowed).toBe(true);
    expect(reviewedPsIsonoteCallouts(state)[0].box.x).toBe(390);
  });

  it('does not permit direct approval of an unplaceable automatic result', () => {
    const unplaceable = callout('11169.3', 'unplaceable', 300);
    const state = createPsIsonoteReviewState([unplaceable]);

    expect(() => reducePsIsonoteReviewState(state, {
      type: 'approve',
      occurrenceId: unplaceable.occurrenceId,
    })).toThrow(/must be moved or suppressed/);
  });

  it('allows an occurrence to be intentionally suppressed with an audit event', () => {
    const unplaceable = callout('11169.3', 'unplaceable', 300);
    let state = createPsIsonoteReviewState([unplaceable]);
    state = reducePsIsonoteReviewState(state, {
      type: 'suppress',
      occurrenceId: unplaceable.occurrenceId,
    });

    expect(evaluatePsIsonoteCommitGate(state).allowed).toBe(true);
    expect(reviewedPsIsonoteCallouts(state)).toEqual([]);
    expect(state.auditTrail.at(-1)).toMatchObject({
      action: 'suppress',
      occurrenceId: unplaceable.occurrenceId,
    });
  });

  it('preserves manual placements when a page is reflowed', () => {
    const first = callout('11167.4', 'review', 260);
    const second = callout('11168.8', 'review', 300);
    let state = createPsIsonoteReviewState([first, second]);
    state = reducePsIsonoteReviewState(state, {
      type: 'move',
      occurrenceId: first.occurrenceId,
      box: { x: 400, y: 30, width: 180, height: 48 },
      leader: first.leader,
    });

    const reflowedFirst = { ...first, box: { ...first.box, x: 40 }, quality: 'clean' as const };
    const reflowedSecond = { ...second, box: { ...second.box, x: 60 }, quality: 'clean' as const };
    state = reducePsIsonoteReviewState(state, {
      type: 'replace-page-plan',
      pageNumber: 1,
      callouts: [reflowedFirst, reflowedSecond],
      source: 'automatic',
      preserveManual: true,
    });

    expect(state.itemsByOccurrenceId[first.occurrenceId].current.box.x).toBe(400);
    expect(state.itemsByOccurrenceId[first.occurrenceId].source).toBe('manual');
    expect(state.itemsByOccurrenceId[second.occurrenceId].current.box.x).toBe(60);
    expect(state.itemsByOccurrenceId[second.occurrenceId].decision).toBe('approved');
  });

  it('is deterministic for the same ordered actions', () => {
    const review = callout('11168.8', 'review', 300);
    const actions = [
      { type: 'suppress', occurrenceId: review.occurrenceId } as const,
      { type: 'reset', occurrenceId: review.occurrenceId } as const,
    ];
    const reduceActions = () => actions.reduce(
      reducePsIsonoteReviewState,
      createPsIsonoteReviewState([review]),
    );

    expect(reduceActions()).toEqual(reduceActions());
  });
});
