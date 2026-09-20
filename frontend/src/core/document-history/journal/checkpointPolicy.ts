import {
  HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION,
} from './stateCheckpoint';
import type {
  HistoryJournalCheckpoint,
  HistoryJournalEntry,
  HistoryJournalManifest,
} from './types';

export interface HistoryPeriodicCheckpointPolicy {
  maxTransactionsSinceCheckpoint: number;
  maxJournalBytesSinceCheckpoint: number;
  maxElapsedMsSinceCheckpoint: number;
}

export const DEFAULT_HISTORY_PERIODIC_CHECKPOINT_POLICY:
HistoryPeriodicCheckpointPolicy = {
  maxTransactionsSinceCheckpoint: 20,
  maxJournalBytesSinceCheckpoint:
    256 * 1024,
  maxElapsedMsSinceCheckpoint:
    5 * 60 * 1000,
};

export type HistoryPeriodicCheckpointReason =
  | 'BOOTSTRAP_RECOVERY_POINT'
  | 'TRANSACTION_COUNT'
  | 'JOURNAL_BYTES'
  | 'ELAPSED_TIME';

export interface HistoryPeriodicCheckpointDecision {
  due: boolean;
  reasons: HistoryPeriodicCheckpointReason[];
  transactionId: string;
  transactionsSinceCheckpoint: number;
  journalBytesSinceCheckpoint: number;
  elapsedMsSinceCheckpoint: number | null;
  anchorCheckpointId: string | null;
  anchorTransactionId: string | null;
}

interface RecoveryCheckpointAnchor {
  checkpoint: HistoryJournalCheckpoint;
  entryIndex: number;
  manifestIndex: number;
}

/**
 * Pure recovery-distance policy.
 *
 * The manifest must already contain the candidate transaction. This function
 * never mutates it. It intentionally considers only recovery-complete v2
 * checkpoints as anchors because legacy/incomplete checkpoint payloads cannot
 * bound crash-recovery replay.
 */
export function evaluateHistoryPeriodicCheckpoint(
  manifest: HistoryJournalManifest,
  transactionId: string,
  policy:
    HistoryPeriodicCheckpointPolicy =
      DEFAULT_HISTORY_PERIODIC_CHECKPOINT_POLICY,
): HistoryPeriodicCheckpointDecision {
  assertPolicy(policy);

  const transactionIndex =
    manifest.entries.findIndex(
      (entry) =>
        entry.transactionId
        === transactionId,
    );
  if (transactionIndex < 0) {
    throw new Error(
      `Periodic checkpoint policy cannot locate transaction ${transactionId}.`,
    );
  }

  const transaction =
    manifest.entries[transactionIndex]!;
  const anchor =
    latestRecoveryCheckpointAtOrBefore(
      manifest,
      transactionIndex,
    );
  const firstReplayIndex =
    (anchor?.entryIndex ?? -1) + 1;
  const replayEntries =
    manifest.entries.slice(
      firstReplayIndex,
      transactionIndex + 1,
    );

  const transactionsSinceCheckpoint =
    replayEntries.length;
  const journalBytesSinceCheckpoint =
    serializedUtf8Bytes(replayEntries);
  const elapsedMsSinceCheckpoint =
    anchor
      ? elapsedMs(
          anchor.checkpoint.createdAt,
          transaction.createdAt,
        )
      : null;

  if (
    transaction.disposition
    !== 'SELF_CONTAINED_REPLAY'
  ) {
    return {
      due: false,
      reasons: [],
      transactionId,
      transactionsSinceCheckpoint,
      journalBytesSinceCheckpoint,
      elapsedMsSinceCheckpoint,
      anchorCheckpointId:
        anchor?.checkpoint.checkpointId
        ?? null,
      anchorTransactionId:
        anchor?.checkpoint.transactionId
        ?? null,
    };
  }

  const reasons:
    HistoryPeriodicCheckpointReason[] = [];

  if (!anchor) {
    reasons.push(
      'BOOTSTRAP_RECOVERY_POINT',
    );
  } else {
    if (
      transactionsSinceCheckpoint
      >= policy
        .maxTransactionsSinceCheckpoint
    ) {
      reasons.push(
        'TRANSACTION_COUNT',
      );
    }
    if (
      journalBytesSinceCheckpoint
      >= policy
        .maxJournalBytesSinceCheckpoint
    ) {
      reasons.push(
        'JOURNAL_BYTES',
      );
    }
    if (
      elapsedMsSinceCheckpoint !== null
      && elapsedMsSinceCheckpoint
        >= policy
          .maxElapsedMsSinceCheckpoint
    ) {
      reasons.push(
        'ELAPSED_TIME',
      );
    }
  }

  return {
    due: reasons.length > 0,
    reasons,
    transactionId,
    transactionsSinceCheckpoint,
    journalBytesSinceCheckpoint,
    elapsedMsSinceCheckpoint,
    anchorCheckpointId:
      anchor?.checkpoint.checkpointId
      ?? null,
    anchorTransactionId:
      anchor?.checkpoint.transactionId
      ?? null,
  };
}

function latestRecoveryCheckpointAtOrBefore(
  manifest: HistoryJournalManifest,
  transactionIndex: number,
): RecoveryCheckpointAnchor | null {
  let latest:
    RecoveryCheckpointAnchor | null =
      null;

  for (
    let manifestIndex = 0;
    manifestIndex
      < manifest.checkpoints.length;
    manifestIndex += 1
  ) {
    const checkpoint =
      manifest.checkpoints[
        manifestIndex
      ]!;
    if (
      !checkpoint.transactionId
      || !checkpoint.statePayload
      || checkpoint.statePayload
        .schemaVersion
        !== HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION
    ) {
      continue;
    }

    const entryIndex =
      manifest.entries.findIndex(
        (entry) =>
          entry.transactionId
          === checkpoint.transactionId,
      );
    if (
      entryIndex < 0
      || entryIndex > transactionIndex
    ) {
      continue;
    }

    if (
      !latest
      || entryIndex > latest.entryIndex
      || (
        entryIndex
          === latest.entryIndex
        && manifestIndex
          > latest.manifestIndex
      )
    ) {
      latest = {
        checkpoint,
        entryIndex,
        manifestIndex,
      };
    }
  }

  return latest;
}

function serializedUtf8Bytes(
  entries: readonly HistoryJournalEntry[],
): number {
  const serialized =
    JSON.stringify(entries);
  return new TextEncoder()
    .encode(serialized)
    .byteLength;
}

function elapsedMs(
  from: string,
  to: string,
): number {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  if (
    !Number.isFinite(fromMs)
    || !Number.isFinite(toMs)
  ) {
    throw new Error(
      `History periodic checkpoint cadence requires valid ISO-compatible timestamps; received ${from} -> ${to}.`,
    );
  }

  return Math.max(
    0,
    toMs - fromMs,
  );
}

function assertPolicy(
  policy:
    HistoryPeriodicCheckpointPolicy,
): void {
  for (
    const [key, value] of
      Object.entries(policy)
  ) {
    if (
      !Number.isFinite(value)
      || value <= 0
    ) {
      throw new Error(
        `History periodic checkpoint policy ${key} must be a positive finite number.`,
      );
    }
  }

  if (
    !Number.isInteger(
      policy
        .maxTransactionsSinceCheckpoint,
    )
  ) {
    throw new Error(
      'History periodic checkpoint transaction bound must be an integer.',
    );
  }
}
