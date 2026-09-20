import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-recovery-checkpoint] ${message}`);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required marker: ${marker}`);
    }
  }
}

function requireOrder(source, relativePath, before, after) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
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

const codecPath =
  'src/core/document-history/journal/stateCheckpoint.ts';
const codec = read(codecPath);
requireContains(codec, codecPath, [
  'HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION = 1',
  'HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION = 2',
  'HistoryStateCheckpointPayloadV1',
  'HistoryStateCheckpointPayloadV2',
  'pageCount: number',
  'pageGraph: PageGraph<PageNode> | null',
  'documentKey: string',
  'selectedPageIds: PageId[]',
  'currentPageId: PageId | null',
  'ocr: OcrPageAnchoredState',
  'FORBIDDEN_RECOVERY_BACKING_KEYS',
  "'workingBytes'",
  "'originalBytes'",
  "'revision'",
  "'activeRevisionId'",
  'omitUndefinedObjectProperties',
]);

const stateHistoryPath =
  'src/core/document-history/stateTransaction.ts';
const stateHistory = read(stateHistoryPath);
requireContains(stateHistory, stateHistoryPath, [
  'currentOcrPageState',
  'cloneOcrPageAnchoredState',
  'ocr: cloneOcrPageAnchoredState(ocr)',
]);

const stateAppendPath =
  'src/core/document-history/journal/appendStateTransaction.ts';
const stateAppend = read(stateAppendPath);
requireContains(stateAppend, stateAppendPath, [
  'after: HistoryState',
  'createHistoryStateCheckpointPayload',
  'input.after',
]);

const coordinatorPath =
  'src/core/document-history/durableStateTransaction.ts';
const coordinator = read(coordinatorPath);
requireContains(coordinator, coordinatorPath, [
  'after: transaction.after',
]);

const mutationAppendPath =
  'src/core/document-history/journal/appendMutation.ts';
const mutationAppend = read(mutationAppendPath);
requireContains(mutationAppend, mutationAppendPath, [
  'attachHistoryJournalBarrierState',
  'entry.disposition',
  "'CHECKPOINT_REQUIRED'",
  "'BARRIER'",
  'expectedKind',
  'checkpoint.statePayload',
  'createHistoryStateCheckpointPayload(',
  'input.after',
]);

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  'attachHistoryJournalBarrierState',
  'after: committedTransaction.after',
  'preparedJournal.store.save',
]);
requireOrder(
  transaction,
  transactionPath,
  'attachHistoryJournalBarrierState({',
  'await preparedJournal.store.save(',
);

const checkpointTestsPath =
  'src/core/document-history/journal/__tests__/stateCheckpoint.test.ts';
const checkpointTests = read(checkpointTestsPath);
requireContains(checkpointTests, checkpointTestsPath, [
  'recovery-complete v2 state without PDF or revision backing',
  'keeps legacy v1 checkpoint payloads valid and cloneable',
  'rejects embedded PDF/revision backing fields in v2 payloads',
  'normalizes optional undefined OCR object fields before validation',
]);

const appendTestsPath =
  'src/core/document-history/journal/appendMutation.test.ts';
const appendTests = read(appendTestsPath);
requireContains(appendTests, appendTestsPath, [
  'attachHistoryJournalBarrierState',
  'schemaVersion: 2',
  "documentKey: 'sha256:after'",
]);

const transactionTestsPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const transactionTests = read(transactionTestsPath);
requireContains(transactionTests, transactionTestsPath, [
  'attaches recovery-complete after-state to a binary checkpoint barrier before journal save',
  'checkpointBarrierCommand',
  'schemaVersion: 2',
  "documentFingerprint: 'hash-2'",
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-recovery-checkpoint] recovery-complete checkpoint guards passed',
);
