import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function fail(message) {
  failed = true;
  console.error(
    `[phase8-history-periodic-checkpoint] ${message}`,
  );
}

function requireContains(
  source,
  relativePath,
  markers,
) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function forbidContains(
  source,
  relativePath,
  markers,
) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

function requireOrder(
  source,
  relativePath,
  before,
  after,
) {
  const beforeIndex =
    source.indexOf(before);
  const afterIndex =
    source.indexOf(after);

  if (
    beforeIndex < 0
    || afterIndex < 0
    || beforeIndex >= afterIndex
  ) {
    fail(
      `${relativePath} must contain ${before} before ${after}`,
    );
  }
}

const policyPath =
  'src/core/document-history/journal/checkpointPolicy.ts';
const policy = read(policyPath);
requireContains(policy, policyPath, [
  'HistoryPeriodicCheckpointPolicy',
  'DEFAULT_HISTORY_PERIODIC_CHECKPOINT_POLICY',
  'maxTransactionsSinceCheckpoint: 20',
  '256 * 1024',
  '5 * 60 * 1000',
  "'BOOTSTRAP_RECOVERY_POINT'",
  "'TRANSACTION_COUNT'",
  "'JOURNAL_BYTES'",
  "'ELAPSED_TIME'",
  'evaluateHistoryPeriodicCheckpoint',
  'HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION',
  "transaction.disposition",
  "'SELF_CONTAINED_REPLAY'",
  'serializedUtf8Bytes',
  'TextEncoder',
]);
forbidContains(policy, policyPath, [
  'setInterval(',
  'setTimeout(',
  'useSessionStore',
  'useHistoryStore',
  'resolveWorkingRevisionStore',
  '.remove(',
  '.clear(',
]);

const appendPath =
  'src/core/document-history/journal/appendMutation.ts';
const append = read(appendPath);
requireContains(append, appendPath, [
  'checkpointPolicy?:',
  'HistoryPeriodicCheckpointPolicy',
  'periodicCheckpointDecision',
  'evaluateHistoryPeriodicCheckpoint',
  "classification.disposition",
  "'SELF_CONTAINED_REPLAY'",
  "'CHECKPOINT_REQUIRED'",
  "kind: 'PERIODIC'",
  "kind: 'BARRIER'",
  ':periodic:',
  'createHistoryStateCheckpointPayload',
  "expectedKind",
]);
forbidContains(append, appendPath, [
  'setInterval(',
  'setTimeout(',
  'resolveWorkingRevisionStore',
  '.remove(',
]);
requireOrder(
  append,
  appendPath,
  'manifest.entries.push({',
  'evaluateHistoryPeriodicCheckpoint(',
);
requireOrder(
  append,
  appendPath,
  "kind: 'PERIODIC'",
  'manifest.activeRevisionId =',
);

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  'attachHistoryJournalBarrierState({',
  'after: committedTransaction.after',
  'await preparedJournal.store.save(',
]);
requireOrder(
  transaction,
  transactionPath,
  'attachHistoryJournalBarrierState({',
  'await preparedJournal.store.save(',
);

const policyTestsPath =
  'src/core/document-history/journal/__tests__/checkpointPolicy.test.ts';
const policyTests =
  read(policyTestsPath);
requireContains(
  policyTests,
  policyTestsPath,
  [
    'bootstraps the first recovery-complete checkpoint for a self-contained history',
    'triggers exactly at the transaction-count bound',
    'triggers on serialized journal-entry bytes',
    'triggers elapsed time only on a later durable transaction boundary',
    'uses the latest recovery-complete checkpoint as the cadence reset',
    'never schedules periodic checkpoints for checkpoint-required transactions',
  ],
);

const appendTestsPath =
  'src/core/document-history/journal/appendMutation.test.ts';
const appendTests =
  read(appendTestsPath);
requireContains(
  appendTests,
  appendTestsPath,
  [
    'bootstraps a recovery-complete periodic checkpoint on the first replayable mutation',
    'does not add another periodic checkpoint before any policy bound is reached',
    'schedules a periodic checkpoint when a configured bound is reached',
    "'BOOTSTRAP_RECOVERY_POINT'",
    "reasons: ['TRANSACTION_COUNT']",
    "kind: 'PERIODIC'",
    'truncates an abandoned redo tail before appending a new branch',
    "checkpoint.transactionId",
    "=== 'tx-2'",
  ],
);

const transactionTestsPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const transactionTests =
  read(transactionTestsPath);
requireContains(
  transactionTests,
  transactionTestsPath,
  [
    "kind: 'PERIODIC'",
    'statePayload: {',
    'schemaVersion: 2',
    "documentKey: 'hash-2'",
    'rolls application history back when durable journal save fails',
    "activeTransactionId: null",
    "kind: 'ADMISSION'",
  ],
);

const navigationTestsPath =
  'src/core/document-history/journal/navigation.test.ts';
const navigationTests =
  read(navigationTestsPath);
requireContains(
  navigationTests,
  navigationTestsPath,
  [
    'attachHistoryJournalBarrierState',
    'recoveryState(',
  ],
);

const plannerTestsPath =
  'src/core/document-history/journal/__tests__/recoveryPlanner.test.ts';
const plannerTests =
  read(plannerTestsPath);
requireContains(
  plannerTests,
  plannerTestsPath,
  [
    'selects the latest checkpoint by journal cursor position, not checkpoint array order',
    "kind: 'PERIODIC'",
    'replayEntries: []',
  ],
);

const architecturePath =
  '../ARCHITECTURE.md';
const architecture =
  read(architecturePath);
requireContains(
  architecture,
  architecturePath,
  [
    'Phase 8E.5C3 bounds recovery replay distance',
    '20 transactions',
    '256 KiB',
    'five minutes elapsed',
    'there is no timer or UI scheduler',
    'not storage',
    'Phase 8E.5C4',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-history-periodic-checkpoint] bounded periodic checkpoint guards passed',
);
