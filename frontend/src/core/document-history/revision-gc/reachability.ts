import type {
  Transaction,
} from '@/core/document-history/types';
import type {
  HistoryJournalManifest,
} from '@/core/document-history/journal/types';
import type {
  RevisionRuntimePin,
} from '@/core/revision-store/pins';

export type RevisionReachabilityReasonKind =
  | 'SESSION_ORIGINAL'
  | 'SESSION_ACTIVE'
  | 'HISTORY_UNDO_BEFORE'
  | 'HISTORY_UNDO_AFTER'
  | 'HISTORY_REDO_BEFORE'
  | 'HISTORY_REDO_AFTER'
  | 'JOURNAL_ORIGINAL'
  | 'JOURNAL_ACTIVE'
  | 'JOURNAL_ENTRY_BEFORE'
  | 'JOURNAL_ENTRY_AFTER'
  | 'JOURNAL_CHECKPOINT'
  | 'RUNTIME_PIN';

export interface RevisionReachabilityReason {
  kind: RevisionReachabilityReasonKind;
  sourceId: string;
  detail?: string;
}

export interface RevisionGcSessionReference {
  revisionStoreId: string | null;
  originalRevisionId: string | null;
  activeRevisionId: string | null;
}

export interface RevisionReachabilityPlanInput {
  storeId: string;
  inventory: readonly string[];
  journals: readonly HistoryJournalManifest[];
  session?: RevisionGcSessionReference | null;
  undoStack?: readonly Transaction[];
  redoStack?: readonly Transaction[];
  pins?: readonly RevisionRuntimePin[];
}

export interface RevisionReachabilityEntry {
  revisionId: string;
  reasons: RevisionReachabilityReason[];
}

export interface RevisionReachabilityDiagnostic {
  code:
    | 'DUPLICATE_INVENTORY'
    | 'MISSING_REFERENCED_REVISION';
  revisionId: string;
  message: string;
}

export interface RevisionReachabilityPlan {
  storeId: string;
  inventory: string[];
  reachable: RevisionReachabilityEntry[];
  candidates: string[];
  diagnostics: RevisionReachabilityDiagnostic[];
  safeToDelete: boolean;
}

/**
 * Pure mark phase for immutable working revisions.
 *
 * Every durable journal for the target store participates, not only the active
 * document. Missing references fail closed so GC never compounds an already
 * incomplete recovery graph.
 */
export function planRevisionReachability(
  input: RevisionReachabilityPlanInput,
): RevisionReachabilityPlan {
  if (!input.storeId.trim()) {
    throw new Error(
      'Revision reachability requires a non-empty store id.',
    );
  }

  const inventory = [
    ...input.inventory,
  ].sort();
  const inventorySet =
    new Set(inventory);
  const diagnostics:
    RevisionReachabilityDiagnostic[] = [];

  if (
    inventorySet.size
    !== inventory.length
  ) {
    diagnostics.push({
      code: 'DUPLICATE_INVENTORY',
      revisionId: '',
      message:
        'Revision inventory contains duplicate ids.',
    });
  }

  const references =
    new Map<
      string,
      RevisionReachabilityReason[]
    >();

  const mark = (
    revisionId: string | null
      | undefined,
    reason:
      RevisionReachabilityReason,
  ) => {
    if (!revisionId) return;
    const existing =
      references.get(revisionId)
      ?? [];
    existing.push(reason);
    references.set(
      revisionId,
      existing,
    );
  };

  const session = input.session;
  if (
    session?.revisionStoreId
    === input.storeId
  ) {
    mark(
      session.originalRevisionId,
      {
        kind: 'SESSION_ORIGINAL',
        sourceId: 'active-session',
      },
    );
    mark(
      session.activeRevisionId,
      {
        kind: 'SESSION_ACTIVE',
        sourceId: 'active-session',
      },
    );
  }

  markHistory(
    input.undoStack ?? [],
    'undo',
    input.storeId,
    mark,
  );
  markHistory(
    input.redoStack ?? [],
    'redo',
    input.storeId,
    mark,
  );

  for (
    const journal of
      [...input.journals].sort(
        (left, right) =>
          left.journalId.localeCompare(
            right.journalId,
          ),
      )
  ) {
    if (
      journal.revisionStoreId
      !== input.storeId
    ) {
      continue;
    }

    mark(
      journal.originalRevisionId,
      {
        kind: 'JOURNAL_ORIGINAL',
        sourceId: journal.journalId,
      },
    );
    mark(
      journal.activeRevisionId,
      {
        kind: 'JOURNAL_ACTIVE',
        sourceId: journal.journalId,
      },
    );

    for (const entry of journal.entries) {
      if (
        entry.beforeRevision.storeId
        === input.storeId
      ) {
        mark(
          entry.beforeRevision.revisionId,
          {
            kind:
              'JOURNAL_ENTRY_BEFORE',
            sourceId:
              journal.journalId,
            detail:
              entry.transactionId,
          },
        );
      }
      if (
        entry.afterRevision.storeId
        === input.storeId
      ) {
        mark(
          entry.afterRevision.revisionId,
          {
            kind:
              'JOURNAL_ENTRY_AFTER',
            sourceId:
              journal.journalId,
            detail:
              entry.transactionId,
          },
        );
      }
    }

    for (
      const checkpoint of
        journal.checkpoints
    ) {
      if (
        checkpoint.revision.storeId
        !== input.storeId
      ) {
        continue;
      }
      mark(
        checkpoint.revision.revisionId,
        {
          kind:
            'JOURNAL_CHECKPOINT',
          sourceId:
            journal.journalId,
          detail:
            checkpoint.checkpointId,
        },
      );
    }
  }

  for (
    const pin of
      [...(input.pins ?? [])].sort(
        comparePins,
      )
  ) {
    if (pin.storeId !== input.storeId) {
      continue;
    }
    mark(
      pin.revisionId,
      {
        kind: 'RUNTIME_PIN',
        sourceId: pin.reason,
      },
    );
  }

  const reachable =
    [...references.entries()]
      .map(
        ([revisionId, reasons]) => ({
          revisionId,
          reasons:
            dedupeReasons(reasons)
              .sort(compareReasons),
        }),
      )
      .sort(
        (left, right) =>
          left.revisionId
            .localeCompare(
              right.revisionId,
            ),
      );

  for (const entry of reachable) {
    if (
      !inventorySet.has(
        entry.revisionId,
      )
    ) {
      diagnostics.push({
        code:
          'MISSING_REFERENCED_REVISION',
        revisionId:
          entry.revisionId,
        message:
          `Referenced revision ${entry.revisionId} is missing from store ${input.storeId}.`,
      });
    }
  }

  const candidates = inventory
    .filter(
      (revisionId) =>
        !references.has(revisionId),
    );

  diagnostics.sort(
    (left, right) =>
      left.code.localeCompare(right.code)
      || left.revisionId.localeCompare(
        right.revisionId,
      ),
  );

  return {
    storeId: input.storeId,
    inventory,
    reachable,
    candidates,
    diagnostics,
    safeToDelete:
      diagnostics.length === 0,
  };
}

type MarkRevision = (
  revisionId: string | null
    | undefined,
  reason: RevisionReachabilityReason,
) => void;

function markHistory(
  transactions: readonly Transaction[],
  stack: 'undo' | 'redo',
  storeId: string,
  mark: MarkRevision,
): void {
  for (const transaction of transactions) {
    for (
      const [side, state] of [
        ['before', transaction.before],
        ['after', transaction.after],
      ] as const
    ) {
      if (
        state.revision?.storeId
        !== storeId
      ) {
        continue;
      }
      mark(
        state.revision.revisionId,
        {
          kind:
            stack === 'undo'
              ? side === 'before'
                ? 'HISTORY_UNDO_BEFORE'
                : 'HISTORY_UNDO_AFTER'
              : side === 'before'
                ? 'HISTORY_REDO_BEFORE'
                : 'HISTORY_REDO_AFTER',
          sourceId: transaction.id,
        },
      );
    }
  }
}

function dedupeReasons(
  reasons:
    readonly RevisionReachabilityReason[],
): RevisionReachabilityReason[] {
  const byKey =
    new Map<
      string,
      RevisionReachabilityReason
    >();
  for (const reason of reasons) {
    byKey.set(
      [
        reason.kind,
        reason.sourceId,
        reason.detail ?? '',
      ].join('\u0000'),
      { ...reason },
    );
  }
  return [...byKey.values()];
}

function compareReasons(
  left: RevisionReachabilityReason,
  right: RevisionReachabilityReason,
): number {
  return left.kind.localeCompare(
    right.kind,
  )
    || left.sourceId.localeCompare(
      right.sourceId,
    )
    || (left.detail ?? '')
      .localeCompare(
        right.detail ?? '',
      );
}

function comparePins(
  left: RevisionRuntimePin,
  right: RevisionRuntimePin,
): number {
  return left.storeId.localeCompare(
    right.storeId,
  )
    || left.revisionId.localeCompare(
      right.revisionId,
    )
    || left.reason.localeCompare(
      right.reason,
    );
}
