import { v4 as uuidv4 } from 'uuid';

import {
  enqueueDocumentOperation,
} from '@/core/commands/documentOperationQueue';
import { useSessionStore } from '@/core/session/store';
import {
  captureDocumentMutationOwner as captureMutationOwner,
  isDocumentMutationOwnerCurrent as isMutationOwnerCurrent,
  type DocumentMutationOwner as MutationOwner,
} from '@/core/session/mutationOwner';
import {
  prepareHistoryJournalStateTransaction,
} from './journal/appendStateTransaction';
import { useHistoryStore } from './store';
import {
  buildStateHistoryTransaction,
  type RecordStateTransactionInput,
} from './stateTransaction';

export interface CommitDurableStateTransactionInput
extends RecordStateTransactionInput {
  apply: () => void | Promise<void>;
  rollback: () => void | Promise<void>;
}

export type DurableStateMutationFactory = () =>
  | CommitDurableStateTransactionInput
  | null
  | Promise<CommitDurableStateTransactionInput | null>;

/**
 * A queued state edit owns the editing session and the coordinate/revision
 * basis it was invoked against, not whichever document happens to be active
 * when the queue drains. A reopen of identical bytes is a different session.
 */
export class StaleDurableStateMutationError extends Error {
  constructor() {
    super('State transaction belongs to a stale document session or revision.');
    this.name = 'StaleDurableStateMutationError';
  }
}

function assertMutationOwner(owner: MutationOwner): void {
  if (!isMutationOwnerCurrent(owner)) {
    throw new StaleDurableStateMutationError();
  }
}

export async function commitDurableStateTransaction(
  input: CommitDurableStateTransactionInput,
): Promise<boolean> {
  const owner = captureMutationOwner();
  return enqueueDocumentOperation(() => {
    assertMutationOwner(owner);
    return commitDurableStateTransactionWithinQueue(input, owner);
  });
}

export async function commitDurableStateMutation(
  factory: DurableStateMutationFactory,
): Promise<boolean> {
  const owner = captureMutationOwner();
  return enqueueDocumentOperation(async () => {
    assertMutationOwner(owner);
    const input = await factory();
    assertMutationOwner(owner);
    if (!input) return false;

    return commitDurableStateTransactionWithinQueue(input, owner);
  });
}

async function commitDurableStateTransactionWithinQueue(
  input: CommitDurableStateTransactionInput,
  owner: MutationOwner,
): Promise<boolean> {
  assertMutationOwner(owner);
  const sessionSnapshot =
    useSessionStore.getState();
  const historyBefore =
    useHistoryStore.getState();
  const transactionId = uuidv4();
  const timestamp = Date.now();

  const transaction =
    buildStateHistoryTransaction(
      input,
      {
        transactionId,
        timestamp,
        session: sessionSnapshot,
      },
    );

  if (!transaction) return false;

  const preparedJournal =
    await prepareHistoryJournalStateTransaction({
      journalStoreId:
        sessionSnapshot.historyJournalStoreId,
      journalId:
        sessionSnapshot.historyJournalId,
      revisionStoreId:
        sessionSnapshot.revisionStoreId,
      revisionId:
        sessionSnapshot.activeRevisionId,
      transactionId,
      currentTransactionId:
        historyBefore.undoStack.at(-1)?.id
        ?? null,
      command: input.command,
      before: transaction.before,
      after: transaction.after,
      createdAt: new Date(
        timestamp,
      ).toISOString(),
    });

  assertMutationOwner(owner);
  assertSessionUnchanged(sessionSnapshot);
  assertHistoryUnchanged(historyBefore);

  const historySnapshot = {
    undoStack: [...historyBefore.undoStack],
    redoStack: [...historyBefore.redoStack],
    retainedBytes: historyBefore.retainedBytes,
    droppedTransactions:
      historyBefore.droppedTransactions,
    lastTrimReason: historyBefore.lastTrimReason,
    overBudget: historyBefore.overBudget,
  };

  let applyStarted = false;
  try {
    assertMutationOwner(owner);
    applyStarted = true;
    // Production store callbacks apply synchronously. Do not introduce an
    // await between applying them and publishing their history cursor.
    const applied = input.apply();
    if (applied) await applied;
    assertMutationOwner(owner);

    useHistoryStore
      .getState()
      .push(transaction);

    if (preparedJournal) {
      await preparedJournal.store.save(
        preparedJournal.manifest,
      );
    }

    assertMutationOwner(owner);
    return true;
  } catch (error) {
    // A save that was already started belongs to the old journal. Never
    // restore old snapshots or execute old rollback callbacks in a new
    // editing session, even when the old journal write rejects late.
    if (!isMutationOwnerCurrent(owner)) {
      throw new StaleDurableStateMutationError();
    }
    let rollbackError: unknown = null;

    if (applyStarted) {
      try {
        const rolledBack = input.rollback();
        if (rolledBack) await rolledBack;
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
      }
    }

    assertMutationOwner(owner);
    useSessionStore.setState(sessionSnapshot);
    useHistoryStore.setState(historySnapshot);

    if (rollbackError) {
      const primaryReason =
        error instanceof Error
          ? error.message
          : String(error);
      const rollbackReason =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      throw new Error(
        `State transaction failed (${primaryReason}) and rollback also failed (${rollbackReason}).`,
      );
    }

    throw error;
  }
}

function assertSessionUnchanged(
  snapshot: ReturnType<typeof useSessionStore.getState>,
): void {
  const current = useSessionStore.getState();

  for (const key of [
    'documentKey',
    'revisionStoreId',
    'activeRevisionId',
    'historyJournalStoreId',
    'historyJournalId',
  ] as const) {
    if (current[key] !== snapshot[key]) {
      throw new Error(
        `State transaction session changed during durable preparation: ${key}.`,
      );
    }
  }
}


function assertHistoryUnchanged(
  snapshot: ReturnType<typeof useHistoryStore.getState>,
): void {
  const current = useHistoryStore.getState();

  if (
    current.undoStack !== snapshot.undoStack
    || current.redoStack !== snapshot.redoStack
  ) {
    throw new Error(
      'State transaction history changed during durable preparation.',
    );
  }
}