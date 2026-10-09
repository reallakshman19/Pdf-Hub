import type {
  PdfRect,
  PsIsonoteLeaderPath,
  PsIsonotePlannedCallout,
} from './model';

export type PsIsonoteReviewDecision = 'approved' | 'pending' | 'suppressed';
export type PsIsonoteReviewSource = 'automatic' | 'manual' | 'margin';

export interface PsIsonoteReviewItem {
  occurrenceId: string;
  pageNumber: number;
  original: PsIsonotePlannedCallout;
  current: PsIsonotePlannedCallout;
  decision: PsIsonoteReviewDecision;
  source: PsIsonoteReviewSource;
  revision: number;
}

export interface PsIsonoteReviewAuditEvent {
  sequence: number;
  occurrenceId?: string;
  action:
    | 'initialize'
    | 'move'
    | 'approve'
    | 'suppress'
    | 'reset'
    | 'replace-page-plan'
    | 'approve-all-clean';
  beforeDecision?: PsIsonoteReviewDecision;
  afterDecision?: PsIsonoteReviewDecision;
  details?: string;
}

export interface PsIsonoteReviewState {
  itemsByOccurrenceId: Record<string, PsIsonoteReviewItem>;
  order: string[];
  nextSequence: number;
  auditTrail: PsIsonoteReviewAuditEvent[];
}

export type PsIsonoteReviewAction =
  | {
      type: 'move';
      occurrenceId: string;
      box: PdfRect;
      leader: PsIsonoteLeaderPath;
    }
  | {
      type: 'approve';
      occurrenceId: string;
    }
  | {
      type: 'suppress';
      occurrenceId: string;
    }
  | {
      type: 'reset';
      occurrenceId: string;
    }
  | {
      type: 'replace-page-plan';
      pageNumber: number;
      callouts: PsIsonotePlannedCallout[];
      source: 'automatic' | 'margin';
      preserveManual: boolean;
    }
  | {
      type: 'approve-all-clean';
    };

export interface PsIsonoteCommitGate {
  allowed: boolean;
  blockingOccurrenceIds: string[];
  pendingReviewCount: number;
  unplaceableCount: number;
  approvedCount: number;
  suppressedCount: number;
  reasons: string[];
}

function initialDecision(callout: PsIsonotePlannedCallout): PsIsonoteReviewDecision {
  return callout.quality === 'clean' ? 'approved' : 'pending';
}

function copyCallout(callout: PsIsonotePlannedCallout): PsIsonotePlannedCallout {
  return {
    ...callout,
    content: { ...callout.content },
    box: { ...callout.box },
    anchor: { ...callout.anchor },
    leader: {
      ...callout.leader,
      points: callout.leader.points.map((point) => ({ ...point })),
    },
    diagnostics: [...callout.diagnostics],
  };
}

function validateFiniteRect(rect: PdfRect): void {
  const entries = Object.entries(rect);
  for (const [key, value] of entries) {
    if (!Number.isFinite(value)) throw new Error(`Manual callout ${key} must be finite.`);
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error('Manual callout dimensions must be positive.');
  }
}

function validateLeader(leader: PsIsonoteLeaderPath): void {
  if (leader.points.length < 2) throw new Error('Manual leader requires at least two points.');
  leader.points.forEach((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`Manual leader point ${index} must be finite.`);
    }
  });
  if (!Number.isFinite(leader.anchorRadius) || leader.anchorRadius <= 0) {
    throw new Error('Manual leader anchor radius must be positive and finite.');
  }
}

function nextEvent(
  state: PsIsonoteReviewState,
  event: Omit<PsIsonoteReviewAuditEvent, 'sequence'>,
): PsIsonoteReviewAuditEvent {
  return { sequence: state.nextSequence, ...event };
}

function withUpdatedItem(
  state: PsIsonoteReviewState,
  item: PsIsonoteReviewItem,
  event: Omit<PsIsonoteReviewAuditEvent, 'sequence'>,
): PsIsonoteReviewState {
  return {
    ...state,
    itemsByOccurrenceId: {
      ...state.itemsByOccurrenceId,
      [item.occurrenceId]: item,
    },
    nextSequence: state.nextSequence + 1,
    auditTrail: [...state.auditTrail, nextEvent(state, event)],
  };
}

function requiredItem(
  state: PsIsonoteReviewState,
  occurrenceId: string,
): PsIsonoteReviewItem {
  const item = state.itemsByOccurrenceId[occurrenceId];
  if (!item) throw new Error(`Unknown PS ISONOTE occurrence ${occurrenceId}.`);
  return item;
}

export function createPsIsonoteReviewState(
  callouts: PsIsonotePlannedCallout[],
): PsIsonoteReviewState {
  const sorted = [...callouts].sort((left, right) =>
    left.pageNumber - right.pageNumber ||
    left.box.y - right.box.y ||
    left.box.x - right.box.x ||
    left.occurrenceId.localeCompare(right.occurrenceId),
  );
  const itemsByOccurrenceId: Record<string, PsIsonoteReviewItem> = {};

  for (const callout of sorted) {
    if (itemsByOccurrenceId[callout.occurrenceId]) {
      throw new Error(`Duplicate PS ISONOTE occurrence ${callout.occurrenceId}.`);
    }
    const original = copyCallout(callout);
    itemsByOccurrenceId[callout.occurrenceId] = {
      occurrenceId: callout.occurrenceId,
      pageNumber: callout.pageNumber,
      original,
      current: copyCallout(callout),
      decision: initialDecision(callout),
      source: 'automatic',
      revision: 0,
    };
  }

  return {
    itemsByOccurrenceId,
    order: sorted.map((callout) => callout.occurrenceId),
    nextSequence: 2,
    auditTrail: [{
      sequence: 1,
      action: 'initialize',
      details: `Initialized ${sorted.length} callout(s).`,
    }],
  };
}

function reduceMove(
  state: PsIsonoteReviewState,
  action: Extract<PsIsonoteReviewAction, { type: 'move' }>,
): PsIsonoteReviewState {
  validateFiniteRect(action.box);
  validateLeader(action.leader);
  const item = requiredItem(state, action.occurrenceId);
  const current: PsIsonotePlannedCallout = {
    ...copyCallout(item.current),
    box: { ...action.box },
    leader: {
      ...action.leader,
      points: action.leader.points.map((point) => ({ ...point })),
    },
    quality: 'manual',
    diagnostics: [...item.current.diagnostics.filter((code) => !code.startsWith('UNPLACEABLE_')), 'MANUAL_OVERRIDE'],
  };
  return withUpdatedItem(
    state,
    {
      ...item,
      current,
      decision: 'pending',
      source: 'manual',
      revision: item.revision + 1,
    },
    {
      occurrenceId: item.occurrenceId,
      action: 'move',
      beforeDecision: item.decision,
      afterDecision: 'pending',
      details: `Moved callout to ${action.box.x},${action.box.y}.`,
    },
  );
}

function reduceApprove(
  state: PsIsonoteReviewState,
  occurrenceId: string,
): PsIsonoteReviewState {
  const item = requiredItem(state, occurrenceId);
  if (item.current.quality === 'unplaceable') {
    throw new Error('An unplaceable callout must be moved or suppressed before approval.');
  }
  return withUpdatedItem(
    state,
    { ...item, decision: 'approved', revision: item.revision + 1 },
    {
      occurrenceId,
      action: 'approve',
      beforeDecision: item.decision,
      afterDecision: 'approved',
    },
  );
}

function reduceSuppress(
  state: PsIsonoteReviewState,
  occurrenceId: string,
): PsIsonoteReviewState {
  const item = requiredItem(state, occurrenceId);
  return withUpdatedItem(
    state,
    { ...item, decision: 'suppressed', revision: item.revision + 1 },
    {
      occurrenceId,
      action: 'suppress',
      beforeDecision: item.decision,
      afterDecision: 'suppressed',
    },
  );
}

function reduceReset(
  state: PsIsonoteReviewState,
  occurrenceId: string,
): PsIsonoteReviewState {
  const item = requiredItem(state, occurrenceId);
  const resetDecision = initialDecision(item.original);
  return withUpdatedItem(
    state,
    {
      ...item,
      current: copyCallout(item.original),
      decision: resetDecision,
      source: 'automatic',
      revision: item.revision + 1,
    },
    {
      occurrenceId,
      action: 'reset',
      beforeDecision: item.decision,
      afterDecision: resetDecision,
    },
  );
}

function reduceReplacePagePlan(
  state: PsIsonoteReviewState,
  action: Extract<PsIsonoteReviewAction, { type: 'replace-page-plan' }>,
): PsIsonoteReviewState {
  const replacements = new Map(
    action.callouts
      .filter((callout) => callout.pageNumber === action.pageNumber)
      .map((callout) => [callout.occurrenceId, callout] as const),
  );
  let itemsByOccurrenceId = state.itemsByOccurrenceId;
  let changed = 0;

  for (const occurrenceId of state.order) {
    const item = itemsByOccurrenceId[occurrenceId];
    if (!item || item.pageNumber !== action.pageNumber) continue;
    if (action.preserveManual && item.source === 'manual') continue;
    const replacement = replacements.get(occurrenceId);
    if (!replacement) continue;

    const decision = initialDecision(replacement);
    const nextItem: PsIsonoteReviewItem = {
      ...item,
      current: copyCallout(replacement),
      decision,
      source: action.source,
      revision: item.revision + 1,
    };
    if (itemsByOccurrenceId === state.itemsByOccurrenceId) {
      itemsByOccurrenceId = { ...state.itemsByOccurrenceId };
    }
    itemsByOccurrenceId[occurrenceId] = nextItem;
    changed += 1;
  }

  if (changed === 0) return state;
  return {
    ...state,
    itemsByOccurrenceId,
    nextSequence: state.nextSequence + 1,
    auditTrail: [
      ...state.auditTrail,
      nextEvent(state, {
        action: 'replace-page-plan',
        details: `Replaced ${changed} callout(s) on page ${action.pageNumber} using ${action.source} layout.`,
      }),
    ],
  };
}

function reduceApproveAllClean(state: PsIsonoteReviewState): PsIsonoteReviewState {
  let itemsByOccurrenceId = state.itemsByOccurrenceId;
  let changed = 0;

  for (const occurrenceId of state.order) {
    const item = itemsByOccurrenceId[occurrenceId];
    if (!item || item.decision !== 'pending' || item.current.quality !== 'clean') continue;
    if (itemsByOccurrenceId === state.itemsByOccurrenceId) {
      itemsByOccurrenceId = { ...state.itemsByOccurrenceId };
    }
    itemsByOccurrenceId[occurrenceId] = {
      ...item,
      decision: 'approved',
      revision: item.revision + 1,
    };
    changed += 1;
  }

  if (changed === 0) return state;
  return {
    ...state,
    itemsByOccurrenceId,
    nextSequence: state.nextSequence + 1,
    auditTrail: [
      ...state.auditTrail,
      nextEvent(state, {
        action: 'approve-all-clean',
        details: `Approved ${changed} clean callout(s).`,
      }),
    ],
  };
}

export function reducePsIsonoteReviewState(
  state: PsIsonoteReviewState,
  action: PsIsonoteReviewAction,
): PsIsonoteReviewState {
  switch (action.type) {
    case 'move':
      return reduceMove(state, action);
    case 'approve':
      return reduceApprove(state, action.occurrenceId);
    case 'suppress':
      return reduceSuppress(state, action.occurrenceId);
    case 'reset':
      return reduceReset(state, action.occurrenceId);
    case 'replace-page-plan':
      return reduceReplacePagePlan(state, action);
    case 'approve-all-clean':
      return reduceApproveAllClean(state);
  }
}

export function evaluatePsIsonoteCommitGate(
  state: PsIsonoteReviewState,
): PsIsonoteCommitGate {
  const blockingOccurrenceIds: string[] = [];
  let pendingReviewCount = 0;
  let unplaceableCount = 0;
  let approvedCount = 0;
  let suppressedCount = 0;

  for (const occurrenceId of state.order) {
    const item = state.itemsByOccurrenceId[occurrenceId];
    if (!item) continue;
    if (item.decision === 'approved') approvedCount += 1;
    if (item.decision === 'suppressed') suppressedCount += 1;
    if (item.current.quality === 'unplaceable' && item.decision !== 'suppressed') {
      unplaceableCount += 1;
      blockingOccurrenceIds.push(occurrenceId);
      continue;
    }
    if (item.decision === 'pending') {
      pendingReviewCount += 1;
      blockingOccurrenceIds.push(occurrenceId);
    }
  }

  const uniqueBlocking = Array.from(new Set(blockingOccurrenceIds));
  const reasons: string[] = [];
  if (unplaceableCount > 0) reasons.push(`${unplaceableCount} unplaceable callout(s) require move or suppression.`);
  if (pendingReviewCount > 0) reasons.push(`${pendingReviewCount} callout(s) require approval or suppression.`);

  return {
    allowed: uniqueBlocking.length === 0,
    blockingOccurrenceIds: uniqueBlocking,
    pendingReviewCount,
    unplaceableCount,
    approvedCount,
    suppressedCount,
    reasons,
  };
}

export function reviewedPsIsonoteCallouts(
  state: PsIsonoteReviewState,
): PsIsonotePlannedCallout[] {
  const gate = evaluatePsIsonoteCommitGate(state);
  if (!gate.allowed) {
    throw new Error(`PS ISONOTE review is incomplete: ${gate.reasons.join(' ')}`);
  }

  return state.order
    .map((occurrenceId) => state.itemsByOccurrenceId[occurrenceId])
    .filter((item): item is PsIsonoteReviewItem => Boolean(item))
    .filter((item) => item.decision === 'approved')
    .map((item) => copyCallout(item.current));
}
