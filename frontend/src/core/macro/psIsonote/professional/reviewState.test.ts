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
  getUnplaceableQueue,
  resolveFromDrawer,
  startTransientDrag,
  updateTransientDrag,
  commitTransientDrag,
  cancelTransientDrag,
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

const occ1: OccurrenceInput = {
  id: 'occ-1',
  psNo: 'PS-100',
  tag: 'Restraint',
  note: ':/PS-100 Restraint Guide',
  confidence: 'HIGH',
  targetPoint: { x: 300, y: 400 },
  pageNumber: 1,
};

const occ2: OccurrenceInput = {
  id: 'occ-2',
  psNo: 'PS-200',
  tag: 'Support',
  note: ':/PS-200 Support',
  confidence: 'MED',
  targetPoint: { x: 500, y: 500 },
  pageNumber: 1,
};

const mockResults: LayoutResultItem[] = [
  {
    status: 'placed',
    occurrenceId: 'occ-1',
    occurrence: occ1,
    placementClass: 'right',
    callout: validCallout,
    diagnostics: [],
  },
  {
    status: 'unplaceable',
    occurrenceId: 'occ-2',
    occurrence: occ2,
    diagnostics: [{ type: 'hard-collision', source: 'solver', message: 'No clean space', penalty: 1000 }],
  },
];

describe('Visual Review Workflow Core (Layer 3)', () => {
  it('initializes immutable review state and logs init audit event without imaginary coordinates', () => {
    const state = initReviewState(1, mockResults);
    expect(state.items.size).toBe(2);
    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0].action).toBe('init');
    
    const unplaced = state.items.get('occ-2');
    expect(unplaced?.psNo).toBe('PS-200'); // Authentic model retention
    expect(unplaced?.targetPoint).toEqual({ x: 500, y: 500 });
    expect(unplaced?.callout).toBeUndefined(); // Zero imaginary boxes
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
      occ1,
      { id: 'occ-3', psNo: 'PS-300', tag: 'Tag 3', note: 'Note 3', confidence: 'HIGH', targetPoint: { x: 400, y: 500 }, pageNumber: 1 },
    ];
    let state = initReviewState(1, [
      { occurrenceId: 'occ-1', status: 'placed', occurrence: occ1, placementClass: 'right', callout: { ...validCallout, box: { x: 150, y: 80, width: 200, height: 60 } }, diagnostics: [] },
      { occurrenceId: 'occ-3', status: 'unplaceable', occurrence: occInputs[1], diagnostics: [] },
    ]);
    // Approve occ-1 so it acts as an obstacle for reflow
    state = approveReviewItem(state, 'occ-1');
    state = reflowReviewState(state, occInputs, { pageWidth: 800, pageHeight: 800 });

    expect(state.auditLog.at(-1)?.action).toBe('reflow');
    const item3 = state.items.get('occ-3');
    expect(item3?.status).toBe('auto-placed');
    expect(item3?.callout).toBeDefined();
  });

  it('manages the Unplaceable Drawer Queue and allows resolving items out of the drawer', () => {
    let state = initReviewState(1, mockResults);
    const queue = getUnplaceableQueue(state);
    expect(queue).toHaveLength(1);
    expect(queue[0].occurrenceId).toBe('occ-2');

    state = resolveFromDrawer(state, 'occ-2', { x: 400, y: 450, width: 200, height: 60 });
    expect(getUnplaceableQueue(state)).toHaveLength(0);
    const resolved = state.items.get('occ-2');
    expect(resolved?.status).toBe('moved');
    expect(resolved?.callout?.box).toEqual({ x: 400, y: 450, width: 200, height: 60 });
    expect(resolved?.callout?.style.isReview).toBe(true);
    expect(state.auditLog.at(-1)?.action).toBe('resolve-drawer');
  });

  it('supports transient-drag semantics without spamming audit log or mutating committed box', () => {
    let state = initReviewState(1, mockResults);
    const initialLogLength = state.auditLog.length;

    // Start drag
    state = startTransientDrag(state, 'occ-1');
    expect(state.items.get('occ-1')?.transientBox).toEqual({ x: 350, y: 380, width: 200, height: 60 });
    expect(state.auditLog.length).toBe(initialLogLength);

    // Update drag coordinates multiple times
    state = updateTransientDrag(state, 'occ-1', { x: 360, y: 385, width: 200, height: 60 });
    state = updateTransientDrag(state, 'occ-1', { x: 380, y: 390, width: 200, height: 60 });
    expect(state.items.get('occ-1')?.transientBox).toEqual({ x: 380, y: 390, width: 200, height: 60 });
    expect(state.items.get('occ-1')?.callout?.box).toEqual({ x: 350, y: 380, width: 200, height: 60 }); // original unaltered
    expect(state.auditLog.length).toBe(initialLogLength); // zero audit spam

    // Commit gate must block while transient drag is uncommitted
    expect(verifyCommitGate(state).reasons.some(r => r.includes('transient drag'))).toBe(true);

    // Commit drag session
    state = commitTransientDrag(state, 'occ-1');
    expect(state.items.get('occ-1')?.transientBox).toBeUndefined();
    expect(state.items.get('occ-1')?.callout?.box).toEqual({ x: 380, y: 390, width: 200, height: 60 });
    expect(state.auditLog.length).toBe(initialLogLength + 1);
    expect(state.auditLog.at(-1)?.action).toBe('commit-drag');
  });

  it('cancels transient drag without creating audit events', () => {
    let state = initReviewState(1, mockResults);
    const initialLogLength = state.auditLog.length;
    state = startTransientDrag(state, 'occ-1');
    state = updateTransientDrag(state, 'occ-1', { x: 500, y: 500, width: 200, height: 60 });
    state = cancelTransientDrag(state, 'occ-1');

    expect(state.items.get('occ-1')?.transientBox).toBeUndefined();
    expect(state.items.get('occ-1')?.callout?.box).toEqual({ x: 350, y: 380, width: 200, height: 60 });
    expect(state.auditLog.length).toBe(initialLogLength);
  });
});
