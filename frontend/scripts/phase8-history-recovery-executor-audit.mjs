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
    `[phase8-history-recovery-executor] ${message}`,
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

const plannerPath =
  'src/core/document-history/journal/recoveryPlanner.ts';
const planner = read(plannerPath);
requireContains(planner, plannerPath, [
  'export function planHistoryRecovery',
  'HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION',
  'validatePageGraph',
  "'RECOVERY_CHECKPOINT_INVALID'",
  "'RECOVERY_SUFFIX_BLOCKED'",
  'classifyHistoryReplayability',
  'entry.disposition',
  "'SELF_CONTAINED_REPLAY'",
  'currentClassification.disposition',
  'replayEntries: replayEntries.map(cloneEntry)',
]);
forbidContains(planner, plannerPath, [
  'useSessionStore',
  'useAnnotationStore',
  'useWriterV2Store',
  'useOcrStore',
  'dispatchPdfCommand',
  'resolveWorkingRevisionStore',
  'Uint8Array',
]);

const resolverPath =
  'src/core/document-history/journal/recoveryResolver.ts';
const resolver = read(resolverPath);
requireContains(resolver, resolverPath, [
  'export async function resolveHistoryRecoveryPlan',
  'resolveWorkingRevisionStore',
  'plan.originalRevisionId',
  'plan.revision.revisionId',
  'entry.afterRevision.revisionId',
  "'REVISION_CHAIN_INVALID'",
  'materializeDocumentSource',
  'checkpointBytes',
]);
forbidContains(resolver, resolverPath, [
  'useSessionStore',
  'useAnnotationStore',
  'useWriterV2Store',
  'useOcrStore',
  'dispatchPdfCommand',
]);
requireOrder(
  resolver,
  resolverPath,
  'await assertRevisionExists(',
  'await materializeDocumentSource(',
);

const executorPath =
  'src/core/document-history/journal/recoveryExecutor.ts';
const executor = read(executorPath);
requireContains(executor, executorPath, [
  'export function executeHistoryRecovery',
  'enqueueDocumentOperation',
  'resolveHistoryJournalStore',
  'loadRecoveryWriterAssets',
  'captureRecoverySnapshot',
  'installRecoveryCheckpoint',
  "executionMode: 'recovery-replay'",
  "'REVISION_MISMATCH'",
  'persistAnnotations(',
  'restoreRecoverySnapshot(snapshot)',
  'rekeyRecoveredWriterState',
  'liveCheckpoint.statePayload',
  'liveReplayEntries',
  'resolveWorkingRevisionStore',
  "'REVISION_STORE_UNAVAILABLE'",
  "documentBus.emit({",
  "type: 'DOCUMENT_REPLACED'",
]);
requireOrder(
  executor,
  executorPath,
  'const snapshot =',
  'installRecoveryCheckpoint(',
);
requireOrder(
  executor,
  executorPath,
  'installRecoveryCheckpoint(',
  "executionMode: 'recovery-replay'",
);
requireOrder(
  executor,
  executorPath,
  "executionMode: 'recovery-replay'",
  'await persistAnnotations(',
);

const commandTypesPath =
  'src/core/commands/types.ts';
const commandTypes = read(commandTypesPath);
requireContains(commandTypes, commandTypesPath, [
  'export type CommandExecutionMode',
  "'normal'",
  "'recovery-replay'",
  'executionMode?: CommandExecutionMode',
]);

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  "input.executionMode !== 'recovery-replay'",
  'const recordHistory =',
  'recordHistory',
  '? await prepareHistoryJournalMutation({',
  'if (recordHistory) {',
  "input.executionMode !== 'recovery-replay'",
]);
requireOrder(
  transaction,
  transactionPath,
  "input.executionMode !== 'recovery-replay'",
  'const annotationSnapshot =',
);
requireOrder(
  transaction,
  transactionPath,
  'const recordHistory =',
  '? await prepareHistoryJournalMutation({',
);

const dispatchPath =
  'src/core/commands/dispatch.ts';
const dispatch = read(dispatchPath);
requireContains(dispatch, dispatchPath, [
  'derivedCommandEntityId',
  "'annotation-duplicate'",
  "'writer-duplicate'",
  'now: commandCreatedAtMs(command)',
  'now: command.createdAt',
]);

const dispatchTestsPath =
  'src/core/commands/__tests__/dispatch.test.ts';
const dispatchTests =
  read(dispatchTestsPath);
requireContains(
  dispatchTests,
  dispatchTestsPath,
  [
    "'duplicate-command::annotation-duplicate::1'",
    "'duplicate-command::writer-duplicate::1'",
    "'2026-09-18T03:04:05.000Z'",
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
    'recovery replay mutates the active revision without duplicating history, journal, or annotation persistence',
    "executionMode:",
    "'recovery-replay'",
    'not.toHaveBeenCalled()',
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
    'plans from the latest recovery-complete checkpoint through a replayable suffix',
    'fails closed when replay to the active cursor crosses a checkpoint-required entry',
    'does not treat a legacy v1 state checkpoint as recovery-complete',
    'reclassifies suffix commands instead of trusting a forged persisted disposition',
  ],
);

const resolverTestsPath =
  'src/core/document-history/journal/__tests__/recoveryResolver.test.ts';
const resolverTests =
  read(resolverTestsPath);
requireContains(
  resolverTests,
  resolverTestsPath,
  [
    'materializes exactly the checkpoint revision before restore execution',
    'fails closed when a replay suffix revision is missing',
    'fails closed when the replay revision chain is discontinuous',
  ],
);

const executorTestsPath =
  'src/core/document-history/journal/__tests__/recoveryExecutor.test.ts';
const executorTests =
  read(executorTestsPath);
requireContains(
  executorTests,
  executorTestsPath,
  [
    'atomically installs a checkpoint and persists only the final annotation state',
    'replays the validated suffix in recovery-replay mode and verifies the journal after-revision',
    'restores all live stores when replay fails after checkpoint application',
    'restores pre-recovery state when final annotation persistence fails',
    'hydrates referenced Writer assets before installing checkpoint state',
    'fails before mutating state when checkpoint Writer assets are unresolved',
    'fails before mutation when the revision store disappears after resolution',
    'fails before mutation when a planned replay entry changes in durable journal storage',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-history-recovery-executor] planner/resolver/executor guards passed',
);
