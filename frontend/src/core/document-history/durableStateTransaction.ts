import { v4 as uuidv4 } from 'uuid';

import {
  enqueueDocumentOperation,
} from '@/core/commands/documentOperationQueue';
import { useSessionStore } from '@/core/session/store';
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

export async function commitDurableStateTransaction(
  input: CommitDurableStateTransactionInput,
): Promise<boolean> {
  return enqueueDocumentOperation(async () => {
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
        after: input.after,
        createdAt: new Date(
          timestamp,
        ).toISOString(),
      });

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
      applyStarted = true;
      await input.apply();

      useHistoryStore
        .getState()
        .push(transaction);

      if (preparedJournal) {
        await preparedJournal.store.save(
          preparedJournal.manifest,
        );
      }

      return true;
    } catch (error) {
      let rollbackError: unknown = null;

      if (applyStarted) {
        try {
          await input.rollback();
        } catch (caughtRollbackError) {
          rollbackError = caughtRollbackError;
        }
      }

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
  });
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
