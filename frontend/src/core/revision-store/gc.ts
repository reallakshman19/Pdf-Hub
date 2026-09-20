import {
  enqueueDocumentOperation,
} from '@/core/commands/documentOperationQueue';
import { useHistoryStore } from '@/core/document-history/store';
import {
  resolveHistoryJournalStore,
} from '@/core/document-history/journal/registry';
import { useSessionStore } from '@/core/session/store';
import {
  acquireRevisionStoreExclusiveLease,
  acquireRevisionStoreGcClearanceLease,
} from './exclusion';
import {
  listRevisionPins,
} from './pins';
import {
  planRevisionReachability,
  type RevisionReachabilityDiagnostic,
  type RevisionReachabilityEntry,
} from './reachability';
import {
  resolveWorkingRevisionStore,
} from './registry';

export type RevisionGarbageCollectionErrorCode =
  | 'REVISION_STORE_UNAVAILABLE'
  | 'JOURNAL_STORE_UNAVAILABLE'
  | 'UNSAFE_REACHABILITY'
  | 'STALE_PLAN';

export class RevisionGarbageCollectionError
extends Error {
  readonly code:
    RevisionGarbageCollectionErrorCode;

  constructor(
    code:
      RevisionGarbageCollectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      'RevisionGarbageCollectionError';
    this.code = code;
  }
}

export interface RevisionGarbageCollectionPlan {
  storeId: string;
  journalStoreId: string;
  inventory: string[];
  reachable: RevisionReachabilityEntry[];
  candidates: string[];
  diagnostics: RevisionReachabilityDiagnostic[];
  safeToDelete: boolean;
  referenceSignature: string;
}

export interface RevisionGarbageCollectionResult {
  status: 'completed' | 'partial';
  storeId: string;
  deleted: string[];
  remaining: string[];
  failed?: {
    revisionId: string;
    message: string;
  };
}

export async function planLiveRevisionGarbageCollection(
  input: {
    storeId: string;
    journalStoreId: string;
  },
): Promise<RevisionGarbageCollectionPlan> {
  const revisionStore =
    resolveWorkingRevisionStore(
      input.storeId,
    );
  if (!revisionStore) {
    throw new RevisionGarbageCollectionError(
      'REVISION_STORE_UNAVAILABLE',
      `WorkingRevisionStore ${input.storeId} is not registered.`,
    );
  }

  const journalStore =
    resolveHistoryJournalStore(
      input.journalStoreId,
    );
  if (!journalStore) {
    throw new RevisionGarbageCollectionError(
      'JOURNAL_STORE_UNAVAILABLE',
      `HistoryJournalStore ${input.journalStoreId} is not registered.`,
    );
  }

  const [
    inventory,
    journals,
  ] = await Promise.all([
    revisionStore.listRevisionIds(),
    journalStore.listAll(),
  ]);

  const session =
    useSessionStore.getState();
  const history =
    useHistoryStore.getState();

  const reachability =
    planRevisionReachability({
      storeId: input.storeId,
      inventory,
      journals,
      session: {
        revisionStoreId:
          session.revisionStoreId,
        originalRevisionId:
          session.originalRevisionId,
        activeRevisionId:
          session.activeRevisionId,
      },
      undoStack:
        history.undoStack,
      redoStack:
        history.redoStack,
      pins:
        listRevisionPins(
          input.storeId,
        ),
    });

  return {
    storeId: input.storeId,
    journalStoreId:
      input.journalStoreId,
    inventory:
      [...reachability.inventory],
    reachable:
      reachability.reachable.map(
        (entry) => ({
          revisionId:
            entry.revisionId,
          reasons:
            entry.reasons.map(
              (reason) => ({
                ...reason,
              }),
            ),
        }),
      ),
    candidates:
      [...reachability.candidates],
    diagnostics:
      reachability.diagnostics.map(
        (diagnostic) => ({
          ...diagnostic,
        }),
      ),
    safeToDelete:
      reachability.safeToDelete,
    referenceSignature:
      JSON.stringify(
        reachability.reachable,
      ),
  };
}

export function executeRevisionGarbageCollection(
  plan:
    RevisionGarbageCollectionPlan,
): Promise<RevisionGarbageCollectionResult> {
  return enqueueDocumentOperation(
    () =>
      executeRevisionGarbageCollectionWithinQueue(
        plan,
      ),
  );
}

async function executeRevisionGarbageCollectionWithinQueue(
  plan:
    RevisionGarbageCollectionPlan,
): Promise<RevisionGarbageCollectionResult> {
  if (!plan.safeToDelete) {
    throw new RevisionGarbageCollectionError(
      'UNSAFE_REACHABILITY',
      'Revision GC plan is not safe to execute because referenced revisions are missing or inventory is invalid.',
    );
  }

  const revisionStore =
    resolveWorkingRevisionStore(
      plan.storeId,
    );
  if (!revisionStore) {
    throw new RevisionGarbageCollectionError(
      'REVISION_STORE_UNAVAILABLE',
      `WorkingRevisionStore ${plan.storeId} is not registered.`,
    );
  }

  if (
    !resolveHistoryJournalStore(
      plan.journalStoreId,
    )
  ) {
    throw new RevisionGarbageCollectionError(
      'JOURNAL_STORE_UNAVAILABLE',
      `HistoryJournalStore ${plan.journalStoreId} is not registered.`,
    );
  }

  const storeLease =
    await acquireRevisionStoreExclusiveLease({
      storeId: plan.storeId,
      requireCrossContext:
        revisionStore.capabilities
          .persistent,
    });

  let gcClearance:
    Awaited<
      ReturnType<
        typeof acquireRevisionStoreGcClearanceLease
      >
    >
    | null = null;

  try {
    if (
      revisionStore.capabilities
        .persistent
    ) {
      gcClearance =
        await acquireRevisionStoreGcClearanceLease(
          plan.storeId,
        );
    }

    const fresh =
      await planLiveRevisionGarbageCollection({
        storeId: plan.storeId,
        journalStoreId:
          plan.journalStoreId,
      });

    assertCompatiblePlan(
      plan,
      fresh,
    );

    const freshInventory =
      new Set(fresh.inventory);
    const remaining =
      plan.candidates.filter(
        (revisionId) =>
          freshInventory.has(
            revisionId,
          ),
      );
    const deleted: string[] = [];

    for (
      const revisionId of remaining
    ) {
      try {
        await revisionStore.remove(
          revisionId,
        );
        deleted.push(revisionId);
      } catch (error) {
        return {
          status: 'partial',
          storeId: plan.storeId,
          deleted,
          remaining:
            remaining.filter(
              (candidate) =>
                !deleted.includes(
                  candidate,
                ),
            ),
          failed: {
            revisionId,
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
        };
      }
    }

    return {
      status: 'completed',
      storeId: plan.storeId,
      deleted,
      remaining: [],
    };
  } finally {
    gcClearance?.release();
    storeLease.release();
  }
}

function assertCompatiblePlan(
  planned:
    RevisionGarbageCollectionPlan,
  fresh:
    RevisionGarbageCollectionPlan,
): void {
  if (!fresh.safeToDelete) {
    throw new RevisionGarbageCollectionError(
      'UNSAFE_REACHABILITY',
      'Revision GC revalidation found a damaged or incomplete reference graph; no revisions were deleted.',
    );
  }

  if (
    planned.storeId !== fresh.storeId
    || planned.journalStoreId
      !== fresh.journalStoreId
    || planned.referenceSignature
      !== fresh.referenceSignature
  ) {
    throw stalePlanError();
  }

  const plannedInventory =
    new Set(planned.inventory);
  const plannedCandidates =
    new Set(planned.candidates);
  const freshInventory =
    new Set(fresh.inventory);

  for (
    const revisionId of fresh.inventory
  ) {
    if (
      !plannedInventory.has(
        revisionId,
      )
    ) {
      throw stalePlanError();
    }
  }

  for (
    const revisionId of
      planned.inventory
  ) {
    if (
      freshInventory.has(
        revisionId,
      )
    ) {
      continue;
    }
    if (
      !plannedCandidates.has(
        revisionId,
      )
    ) {
      throw new RevisionGarbageCollectionError(
        'UNSAFE_REACHABILITY',
        `Reachable revision ${revisionId} disappeared before GC execution.`,
      );
    }
  }

  for (
    const revisionId of
      fresh.candidates
  ) {
    if (
      !plannedCandidates.has(
        revisionId,
      )
    ) {
      throw stalePlanError();
    }
  }
}

function stalePlanError():
RevisionGarbageCollectionError {
  return new RevisionGarbageCollectionError(
    'STALE_PLAN',
    'Revision GC plan is stale; references or revision inventory changed after planning. Re-plan before deleting.',
  );
}
