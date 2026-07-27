import { type Point, type Rect, type ProfessionalCalloutModel } from './model';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';
import { type LayoutResultItem, type OccurrenceInput, type PageLayoutOptions } from './layoutTypes';
import { solvePageLayout } from './layoutEngine';

export type ReviewStatus = 'auto-placed' | 'moved' | 'approved' | 'suppressed' | 'unplaceable';

export type AuditAction = 'init' | 'move' | 'approve' | 'suppress' | 'reset' | 'reflow' | 'resolve-drawer' | 'commit-drag';

export interface AuditEvent {
  timestamp: number;
  action: AuditAction;
  occurrenceId?: string;
  details?: string;
}

export interface ReviewItem {
  occurrenceId: string;
  psNo: string;
  tag: string;
  note: string;
  confidence: string;
  targetPoint?: Point;
  status: ReviewStatus;
  isApproved: boolean;
  isSuppressed: boolean;
  callout?: ProfessionalCalloutModel;
  transientBox?: Rect;
  originalResult: LayoutResultItem;
}

export interface ReviewState {
  pageNumber: number;
  items: ReadonlyMap<string, ReviewItem>;
  auditLog: readonly AuditEvent[];
}

export interface CommitVerificationResult {
  allowed: boolean;
  reasons: string[];
}

export function initReviewState(pageNumber: number, results: LayoutResultItem[], now = Date.now()): ReviewState {
  const items = new Map<string, ReviewItem>();

  for (const item of results) {
    const isUnplaceable = item.status === 'unplaceable';
    const status: ReviewStatus = isUnplaceable ? 'unplaceable' : 'auto-placed';
    const calloutSource = item.status === 'placed' ? item.callout : undefined;
    const occ = (item as any).occurrence;
    const hasDiagnostics = Boolean(item.diagnostics && item.diagnostics.length > 0);
    const isApproved = !isUnplaceable && !hasDiagnostics;

    const callout = calloutSource ? {
      ...calloutSource,
      style: {
        ...calloutSource.style,
        isReview: !isApproved || calloutSource.style.isReview,
        backgroundColor: (!isApproved || calloutSource.style.isReview) ? '#fffaf0' : calloutSource.style.backgroundColor,
        borderColor: (!isApproved || calloutSource.style.isReview) ? '#dd6b20' : calloutSource.style.borderColor,
      }
    } : undefined;

    items.set(item.occurrenceId, {
      occurrenceId: item.occurrenceId,
      psNo: calloutSource?.psNo ?? occ?.psNo ?? '',
      tag: calloutSource?.tag ?? occ?.tag ?? '',
      note: calloutSource?.note ?? occ?.note ?? '',
      confidence: calloutSource?.confidence ?? occ?.confidence ?? 'UNKNOWN',
      targetPoint: calloutSource?.targetPoint ?? occ?.targetPoint ?? occ?.point ?? undefined,
      status,
      isApproved,
      isSuppressed: false,
      callout,
      transientBox: undefined,
      originalResult: item,
    });
  }

  const initEvent: AuditEvent = {
    timestamp: now,
    action: 'init',
    details: `Initialized review state with ${results.length} items.`,
  };

  return {
    pageNumber,
    items,
    auditLog: [initEvent],
  };
}

/**
 * Manually moves a callout box.
 * Invariant: Manual movement ALWAYS requires reapproval and immediately transitions style to orange review mode.
 */
export function moveReviewItem(
  state: ReviewState,
  occurrenceId: string,
  newBox: Rect,
  targetPoint?: Point,
  now = Date.now(),
): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing) {
    throw new Error(`Review item ${occurrenceId} not found.`);
  }

  const target = targetPoint ?? existing.targetPoint ?? { x: newBox.x, y: newBox.y };
  const reviewCallout = buildVectorCalloutPlan(
    existing.occurrenceId,
    existing.psNo,
    existing.tag,
    existing.note,
    existing.confidence,
    target,
    newBox,
    { isReview: true, width: newBox.width },
  );

  const updatedItem: ReviewItem = {
    ...existing,
    targetPoint: target,
    status: 'moved',
    isApproved: false, // Invariant: manual movement revokes approval!
    isSuppressed: false,
    callout: reviewCallout,
    transientBox: undefined,
  };

  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  const event: AuditEvent = {
    timestamp: now,
    action: 'move',
    occurrenceId,
    details: `Manually moved callout to (${newBox.x}, ${newBox.y}); reapproval required.`,
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Approves a reviewed/moved callout.
 * Invariant: Transitions callout style from orange review-only back to neutral professional styling.
 */
export function approveReviewItem(state: ReviewState, occurrenceId: string, now = Date.now()): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing || !existing.callout) {
    throw new Error(`Cannot approve item ${occurrenceId}: missing callout geometry.`);
  }

  const approvedCallout = buildVectorCalloutPlan(
    existing.callout.id,
    existing.callout.psNo,
    existing.callout.tag,
    existing.callout.note,
    existing.callout.confidence,
    existing.callout.targetPoint,
    existing.callout.box,
    { isReview: false, width: existing.callout.box.width }, // Revert to neutral normal style
  );

  const updatedItem: ReviewItem = {
    ...existing,
    status: 'approved',
    isApproved: true,
    callout: approvedCallout,
    transientBox: undefined,
  };

  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  const event: AuditEvent = {
    timestamp: now,
    action: 'approve',
    occurrenceId,
    details: 'Explicitly approved callout placement.',
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Suppresses a callout occurrence (e.g. for unplaceable or unnecessary items).
 */
export function suppressReviewItem(state: ReviewState, occurrenceId: string, reason = 'Suppressed by reviewer', now = Date.now()): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing) {
    throw new Error(`Review item ${occurrenceId} not found.`);
  }

  const updatedItem: ReviewItem = {
    ...existing,
    status: 'suppressed',
    isApproved: true, // Suppression resolves blocking state
    isSuppressed: true,
    transientBox: undefined,
  };

  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  const event: AuditEvent = {
    timestamp: now,
    action: 'suppress',
    occurrenceId,
    details: reason,
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Resets a callout back to its original layout engine result.
 */
export function resetReviewItem(state: ReviewState, occurrenceId: string, now = Date.now()): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing) {
    throw new Error(`Review item ${occurrenceId} not found.`);
  }

  const isUnplaceable = existing.originalResult.status === 'unplaceable';
  const hasDiagnostics = Boolean(existing.originalResult.diagnostics && existing.originalResult.diagnostics.length > 0);
  const isApproved = !isUnplaceable && !hasDiagnostics;
  const calloutSource = existing.originalResult.status === 'placed' ? existing.originalResult.callout : undefined;
  const callout = calloutSource ? {
    ...calloutSource,
    style: {
      ...calloutSource.style,
      isReview: !isApproved || calloutSource.style.isReview,
      backgroundColor: (!isApproved || calloutSource.style.isReview) ? '#fffaf0' : calloutSource.style.backgroundColor,
      borderColor: (!isApproved || calloutSource.style.isReview) ? '#dd6b20' : calloutSource.style.borderColor,
    }
  } : undefined;

  const updatedItem: ReviewItem = {
    ...existing,
    status: isUnplaceable ? 'unplaceable' : 'auto-placed',
    isApproved,
    isSuppressed: false,
    callout,
    transientBox: undefined,
  };

  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  const event: AuditEvent = {
    timestamp: now,
    action: 'reset',
    occurrenceId,
    details: 'Reset callout to original auto-placement state.',
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Reflows unapproved/unplaceable items around currently approved/moved placements.
 */
export function reflowReviewState(
  state: ReviewState,
  occurrences: OccurrenceInput[],
  options: PageLayoutOptions,
  now = Date.now(),
): ReviewState {
  const newItems = new Map(state.items);

  // Treat approved/moved callouts as additional hard obstacles for the solver
  const existingObstacles = [...(options.obstacles ?? [])];
  const fixedIds = new Set<string>();

  newItems.forEach((item, id) => {
    if ((item.isApproved || item.status === 'moved') && !item.isSuppressed && item.callout) {
      existingObstacles.push({
        id: `fixed-${id}`,
        type: 'hard',
        source: 'callout-box',
        rect: item.callout.box,
      });
      fixedIds.add(id);
    } else if (item.isSuppressed) {
      fixedIds.add(id);
    }
  });

  const remainingOccurrences = occurrences.filter((occ) => !fixedIds.has(occ.id));
  if (remainingOccurrences.length > 0) {
    const solution = solvePageLayout(remainingOccurrences, { ...options, obstacles: existingObstacles });
    for (const res of solution.results) {
      const existing = newItems.get(res.occurrenceId);
      const isUnplaceable = res.status === 'unplaceable';
      if (existing && !existing.isSuppressed) {
        newItems.set(res.occurrenceId, {
          ...existing,
          status: isUnplaceable ? 'unplaceable' : 'auto-placed',
          isApproved: !isUnplaceable,
          callout: res.status === 'placed' ? { ...res.callout } : undefined,
          transientBox: undefined,
          originalResult: res,
        });
      }
    }
  }

  const event: AuditEvent = {
    timestamp: now,
    action: 'reflow',
    details: `Reflowed ${remainingOccurrences.length} remaining items against fixed placements.`,
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Fail-closed commit gate:
 * Validates that no unplaceable items remain unaddressed and no manually moved items remain unapproved.
 */
export function verifyCommitGate(state: ReviewState): CommitVerificationResult {
  const reasons: string[] = [];

  state.items.forEach((item, id) => {
    if (item.status === 'unplaceable' && !item.isSuppressed) {
      reasons.push(`Occurrence ${id} (${item.psNo}) is unplaceable and must be moved or suppressed before commit.`);
    }
    if (item.status === 'moved' && !item.isApproved && !item.isSuppressed) {
      reasons.push(`Occurrence ${id} (${item.psNo}) was manually moved and requires explicit approval.`);
    }
    if (item.transientBox) {
      reasons.push(`Occurrence ${id} (${item.psNo}) has an active uncommitted transient drag and must be confirmed or cancelled.`);
    }
    if (!item.isApproved && !item.isSuppressed) {
      reasons.push(`Occurrence ${id} (${item.psNo}) is pending user review approval.`);
    }
  });

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

/**
 * Executes a fail-closed commit.
 * Returns only active, unsuppressed callout plans that exactly match the approved review state.
 */
export function commitReviewState(state: ReviewState): ProfessionalCalloutModel[] {
  const verification = verifyCommitGate(state);
  if (!verification.allowed) {
    throw new Error(`Commit blocked by fail-closed review gate:\n- ${verification.reasons.join('\n- ')}`);
  }

  const committed: ProfessionalCalloutModel[] = [];
  state.items.forEach((item) => {
    if (!item.isSuppressed && item.callout) {
      // Invariant check: Committed state must be normal neutral style, never review orange style
      if (item.callout.style.isReview) {
        throw new Error(`Commit integrity failure: item ${item.occurrenceId} still has active review styling.`);
      }
      committed.push(item.callout);
    }
  });

  return committed;
}

/**
 * Returns all unplaceable items currently staged in the Unplaceable Drawer waiting for user placement.
 */
export function getUnplaceableQueue(state: ReviewState): ReviewItem[] {
  const queue: ReviewItem[] = [];
  state.items.forEach((item) => {
    if (item.status === 'unplaceable' && !item.isSuppressed) {
      queue.push(item);
    }
  });
  return queue;
}

/**
 * Resolves an item from the Unplaceable Drawer by assigning it a coordinate on the canvas.
 * Transitions status to 'moved' in review mode, requiring user confirmation.
 */
export function resolveFromDrawer(
  state: ReviewState,
  occurrenceId: string,
  targetBox: Rect,
  targetPoint?: Point,
  now = Date.now(),
): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing) {
    throw new Error(`Review item ${occurrenceId} not found.`);
  }
  if (existing.status !== 'unplaceable') {
    throw new Error(`Review item ${occurrenceId} is not in the unplaceable drawer.`);
  }

  const target = targetPoint ?? existing.targetPoint ?? { x: targetBox.x, y: targetBox.y };
  const reviewCallout = buildVectorCalloutPlan(
    existing.occurrenceId,
    existing.psNo,
    existing.tag,
    existing.note,
    existing.confidence,
    target,
    targetBox,
    { isReview: true, width: targetBox.width },
  );

  const updatedItem: ReviewItem = {
    ...existing,
    targetPoint: target,
    status: 'moved',
    isApproved: false,
    isSuppressed: false,
    callout: reviewCallout,
    transientBox: undefined,
  };

  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  const event: AuditEvent = {
    timestamp: now,
    action: 'resolve-drawer',
    occurrenceId,
    details: `Resolved unplaceable item from drawer to (${targetBox.x}, ${targetBox.y}); awaiting approval.`,
  };

  return {
    ...state,
    items: newItems,
    auditLog: [...state.auditLog, event],
  };
}

/**
 * Transient-Drag Semantics: Initiates an interactive drag session in visual review without mutating immutable callout state or spamming audit logs.
 */
export function startTransientDrag(state: ReviewState, occurrenceId: string): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing || !existing.callout) {
    throw new Error(`Cannot start transient drag on item ${occurrenceId}: missing callout geometry.`);
  }

  const updatedItem: ReviewItem = {
    ...existing,
    transientBox: { ...existing.callout.box },
  };
  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  return {
    ...state,
    items: newItems,
  };
}

/**
 * Transient-Drag Semantics: Updates temporary modification coordinates without creating audit entries or rebuilding vector primitives.
 */
export function updateTransientDrag(state: ReviewState, occurrenceId: string, draftBox: Rect): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing || !existing.transientBox) {
    throw new Error(`No active transient drag for item ${occurrenceId}.`);
  }

  const updatedItem: ReviewItem = {
    ...existing,
    transientBox: { ...draftBox },
  };
  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  return {
    ...state,
    items: newItems,
  };
}

/**
 * Transient-Drag Semantics: Commits a transient drag session into a permanent move action, producing exactly one audit event and triggering orange review styling.
 */
export function commitTransientDrag(state: ReviewState, occurrenceId: string, now = Date.now()): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing || !existing.transientBox) {
    throw new Error(`No active transient drag for item ${occurrenceId}.`);
  }

  const draft = existing.transientBox;
  let newState = moveReviewItem(state, occurrenceId, draft, undefined, now);
  
  // Replace the last audit log action with commit-drag for distinction
  const lastLog = newState.auditLog.at(-1)!;
  const committedLog = newState.auditLog.slice(0, -1).concat({
    ...lastLog,
    action: 'commit-drag',
    details: `Committed interactive transient drag to (${draft.x}, ${draft.y}); reapproval required.`,
  });

  return {
    ...newState,
    auditLog: committedLog,
  };
}

/**
 * Transient-Drag Semantics: Cancels an active drag session, restoring previous callout geometry without any audit log pollution.
 */
export function cancelTransientDrag(state: ReviewState, occurrenceId: string): ReviewState {
  const existing = state.items.get(occurrenceId);
  if (!existing || !existing.transientBox) {
    throw new Error(`No active transient drag for item ${occurrenceId}.`);
  }

  const updatedItem: ReviewItem = {
    ...existing,
    transientBox: undefined,
  };
  const newItems = new Map(state.items);
  newItems.set(occurrenceId, updatedItem);

  return {
    ...state,
    items: newItems,
  };
}

