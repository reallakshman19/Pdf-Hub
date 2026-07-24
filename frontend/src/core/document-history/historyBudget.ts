import { HISTORY_POLICY } from './historyPolicy';
import type {
  HistoryTrimReason,
  Transaction,
} from './types';

export interface HistoryRetentionPolicy {
  maxUndoDepth: number;
  maxRetainedBytes: number;
  minimumRetainedTransactions: number;
}

export interface HistoryRetentionResult {
  transactions: Transaction[];
  retainedBytes: number;
  droppedTransactions: number;
  reason: HistoryTrimReason;
  overBudget: boolean;
}

function addedBytesForTransaction(
  transaction: Transaction,
  seenSnapshots: ReadonlySet<Uint8Array>,
): number {
  let addedBytes = 0;
  if (!seenSnapshots.has(transaction.before.bytes)) {
    addedBytes += transaction.before.bytes.byteLength;
  }
  if (
    transaction.after.bytes !== transaction.before.bytes &&
    !seenSnapshots.has(transaction.after.bytes)
  ) {
    addedBytes += transaction.after.bytes.byteLength;
  }
  return addedBytes;
}

function rememberTransactionSnapshots(
  transaction: Transaction,
  seenSnapshots: Set<Uint8Array>,
): void {
  seenSnapshots.add(transaction.before.bytes);
  seenSnapshots.add(transaction.after.bytes);
}

export function retainedBytesForTransactions(
  transactions: readonly Transaction[],
): number {
  const seenSnapshots = new Set<Uint8Array>();
  let retainedBytes = 0;

  for (const transaction of transactions) {
    retainedBytes += addedBytesForTransaction(transaction, seenSnapshots);
    rememberTransactionSnapshots(transaction, seenSnapshots);
  }

  return retainedBytes;
}

export function retainHistorySuffix(
  transactions: readonly Transaction[],
  policy: HistoryRetentionPolicy = HISTORY_POLICY,
): HistoryRetentionResult {
  const retainedNewestFirst: Transaction[] = [];
  const seenSnapshots = new Set<Uint8Array>();
  let retainedBytes = 0;
  let droppedByDepth = false;
  let droppedByBytes = false;

  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    if (retainedNewestFirst.length >= policy.maxUndoDepth) {
      droppedByDepth = true;
      break;
    }

    const transaction = transactions[index];
    const addedBytes = addedBytesForTransaction(transaction, seenSnapshots);
    const mustRetain = retainedNewestFirst.length < policy.minimumRetainedTransactions;

    if (!mustRetain && retainedBytes + addedBytes > policy.maxRetainedBytes) {
      droppedByBytes = true;
      break;
    }

    retainedNewestFirst.push(transaction);
    retainedBytes += addedBytes;
    rememberTransactionSnapshots(transaction, seenSnapshots);
  }

  const retained = retainedNewestFirst.reverse();
  const droppedTransactions = transactions.length - retained.length;
  const reason: HistoryTrimReason = droppedByDepth && droppedByBytes
    ? 'depth-and-bytes'
    : droppedByDepth
      ? 'depth'
      : droppedByBytes
        ? 'bytes'
        : 'none';

  return {
    transactions: retained,
    retainedBytes,
    droppedTransactions,
    reason,
    overBudget: retainedBytes > policy.maxRetainedBytes,
  };
}
