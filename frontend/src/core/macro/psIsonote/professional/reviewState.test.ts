import { describe, expect, it } from 'vitest';
import {
  initReviewState,
  moveReviewItem,
  approveReviewItem,
  suppressReviewItem,
  resetReviewItem,
  reflowReviewState,
  verifyCommitGate,
  commitReviewState,
} from './reviewState';
import { type LayoutResultItem, type OccurrenceInput } from './layoutTypes';

const validCallout = {
  id: 'occ-1',
  psNo: 'PS-100',
  tag: 'Restraint',
  note: ':/PS-100 Restraint Guide',
  confidence: 'HIGH',
  targetPoint: { x: 300, y: 400 },
  box: { x: 350, y: 380, width: 200, height: 60 },
  style: {
    version: 'v1' as const,
    isReview: false,
    backgroundColor: '#fff',
    textColor: '#000',
    borderColor: '#000',
    leaderColor: '#000',
    fontSize: 9,
    fontFamily: 'Arial',
    borderWidth: 1,
    cornerRadius: 2,
  },
  primitives: [],
};

const mockResults: LayoutResultItem[] = [
  {
    occurrenceId: 'occ-1',
    status: 'placed',
    placementClass: 'right',
    callout: validCallout,
    diagnostics: [],
  },
  {
    occurrenceId: 'occ-2',
    status: 'unplaceable',
    diagnostics: [{ type: 'hard-collision', source: 'solver', message: 'No clean space', penalty: 1000 }],
  },
];

describe('Visual Review Workflow Core (Layer 3)', () => {
  it('initializes immutable review state and logs init audit event', () => {
    const state = initReviewState(1, mockResults);
    expect(state.items.size).toBe(2);
    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0].action).toBe('init');
  });

  it('enforces that manual movement revokes approval and applies orange review styling', () => {
    let state = initReviewState(1, mockResults);
    state = moveReviewItem(state, 'occ-1', { x: 370, y: 390, width: 200, height: 60 });

    const item = state.items.get('occ-1');
    expect(item?.status).toBe('moved');
    expect(item?.isApproved).toBe(false);
    expect(item?.callout?.style.isReview).toBe(true);
    expect(item?.callout?.style.backgroundColor).toBe('#fffaf0'); // Orange review background
    expect(state.auditLog.at(-1)?.action).toBe('move');
  });

  it('restores neutral style and sets approval upon explicit approve command', () => {
    let state = initReviewState(1, mockResults);
    state = moveReviewItem(state, 'occ-1', { x: 370, y: 390, width: 200, height: 60 });
    state = approveReviewItem(state, 'occ-1');

    const item = state.items.get('occ-1');
    expect(item?.status).toBe('approved');
    expect(item?.isApproved).toBe(true);
    expect(item?.callout?.style.isReview).toBe(false);
    expect(item?.callout?.style.backgroundColor).toBe('#ffffff');
    expect(state.auditLog.at(-1)?.action).toBe('approve');
  });

  it('enforces fail-closed commit gate when unplaceable or unapproved items remain', () => {
    const state = initReviewState(1, mockResults);
    // occ-2 is unplaceable and unsuppressed
    const verification = verifyCommitGate(state);
    expect(verification.allowed).toBe(false);
    expect(verification.reasons.some((r) => r.includes('unplaceable'))).toBe(true);
    expect(() => commitReviewState(state)).toThrow(/Commit blocked/);
  });

  it('allows commit once unplaceable results are suppressed and returns exact approved set', () => {
    let state = initReviewState(1, mockResults);
    state = suppressReviewItem(state, 'occ-2', 'Not needed in visual review');

    const verification = verifyCommitGate(state);
    expect(verification.allowed).toBe(true);

    const committed = commitReviewState(state);
    expect(committed).toHaveLength(1); // Only unsuppressed item
    expect(committed[0].id).toBe('occ-1');
    expect(committed[0].style.isReview).toBe(false);
  });

  it('resets modified items to original auto-placed state', () => {
    let state = initReviewState(1, mockResults);
    state = moveReviewItem(state, 'occ-1', { x: 400, y: 400, width: 200, height: 60 });
    state = resetReviewItem(state, 'occ-1');

    const item = state.items.get('occ-1');
    expect(item?.status).toBe('auto-placed');
    expect(item?.callout?.box.x).toBe(350); // back to original X
    expect(state.auditLog.at(-1)?.action).toBe('reset');
  });

  it('reflows remaining unapproved occurrences around fixed approved placements', () => {
    const occInputs: OccurrenceInput[] = [
      { id: 'occ-1', psNo: 'PS-100', tag: 'Tag 1', note: 'Note 1', confidence: 'HIGH', targetPoint: { x: 100, y: 100 }, pageNumber: 1 },
      { id: 'occ-3', psNo: 'PS-300', tag: 'Tag 3', note: 'Note 3', confidence: 'HIGH', targetPoint: { x: 400, y: 500 }, pageNumber: 1 },
    ];
    let state = initReviewState(1, [
      { occurrenceId: 'occ-1', status: 'placed', placementClass: 'right', callout: { ...validCallout, box: { x: 150, y: 80, width: 200, height: 60 } }, diagnostics: [] },
      { occurrenceId: 'occ-3', status: 'unplaceable', diagnostics: [] },
    ]);
    // Approve occ-1 so it acts as an obstacle for reflow
    state = approveReviewItem(state, 'occ-1');
    state = reflowReviewState(state, occInputs, { pageWidth: 800, pageHeight: 800 });

    expect(state.auditLog.at(-1)?.action).toBe('reflow');
    const item3 = state.items.get('occ-3');
    // After reflow, occ-3 should find a new spot away from occ-1
    expect(item3?.status).toBe('auto-placed');
    expect(item3?.callout).toBeDefined();
  });
});
