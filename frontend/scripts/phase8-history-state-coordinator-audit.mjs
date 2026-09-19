import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-state-coordinator] ${message}`);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required marker: ${marker}`);
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(`${relativePath} contains forbidden marker: ${marker}`);
    }
  }
}

const preparePath =
  'src/core/document-history/journal/appendStateTransaction.ts';
const prepare = read(preparePath);
requireContains(prepare, preparePath, [
  'prepareHistoryJournalStateTransaction',
  "input.command.type !== 'ANNOTATION_CHANGE'",
  "input.command.type !== 'WRITER_CHANGE'",
  "'DESCRIPTIVE_STATE_COMMAND'",
  'resolveHistoryJournalActiveTransactionId',
  'does not match in-memory history cursor',
  'createHistoryStateCheckpointPayload',
  'truncateAbandonedTail',
  "kind: 'BARRIER'",
  'beforeRevision: revision',
  'afterRevision: revision',
  'statePayload',
  'manifest.activeTransactionId =',
]);
forbidContains(prepare, preparePath, [
  'dispatchCommand',
  'revisionStore.remove',
]);

const coordinatorPath =
  'src/core/document-history/durableStateTransaction.ts';
const coordinator = read(coordinatorPath);
requireContains(coordinator, coordinatorPath, [
  'enqueueDocumentOperation',
  'buildStateHistoryTransaction',
  'prepareHistoryJournalStateTransaction',
  'assertSessionUnchanged',
  'assertHistoryUnchanged',
  'await input.apply()',
  '.push(transaction)',
  'await preparedJournal.store.save',
  'await input.rollback()',
  'useHistoryStore.setState(historySnapshot)',
]);

const prepareIndex = coordinator.indexOf(
  'await prepareHistoryJournalStateTransaction',
);
const applyIndex = coordinator.indexOf(
  'await input.apply()',
);
const pushIndex = coordinator.indexOf(
  '.push(transaction)',
);
const saveIndex = coordinator.indexOf(
  'await preparedJournal.store.save',
);
if (
  prepareIndex < 0
  || applyIndex < 0
  || pushIndex < 0
  || saveIndex < 0
  || !(prepareIndex < applyIndex)
  || !(applyIndex < pushIndex)
  || !(pushIndex < saveIndex)
) {
  fail(
    'Durable state transaction ordering must be prepare -> apply -> history push -> journal save.',
  );
}

const stateTxPath =
  'src/core/document-history/stateTransaction.ts';
const stateTx = read(stateTxPath);
requireContains(stateTx, stateTxPath, [
  'buildStateHistoryTransaction',
  'BuildStateHistoryTransactionOptions',
  'recordStateTransaction',
  'buildStateHistoryTransaction(input)',
]);

const annotationStorePath =
  'src/core/annotations/store.ts';
const annotationStore = read(annotationStorePath);
forbidContains(annotationStore, annotationStorePath, [
  'commitDurableStateTransaction',
]);

const writerStorePath =
  'src/core/writer-v2/writerV2Store.ts';
const writerStore = read(writerStorePath);
forbidContains(writerStore, writerStorePath, [
  'commitDurableStateTransaction',
]);

const coordinatorTestsPath =
  'src/core/document-history/__tests__/durableStateTransaction.test.ts';
const coordinatorTests = read(coordinatorTestsPath);
requireContains(coordinatorTests, coordinatorTestsPath, [
  'commits a same-revision state checkpoint and shared history transaction id',
  'rejects unsafe state before calling apply',
  'rolls caller state and history back when journal save fails',
  'retains legacy no-journal behavior through the coordinator',
]);

const prepareTestsPath =
  'src/core/document-history/journal/__tests__/appendStateTransaction.test.ts';
const prepareTests = read(prepareTestsPath);
requireContains(prepareTests, prepareTestsPath, [
  'appends a same-revision descriptive barrier with after-state payload',
  'fails closed when journal and in-memory history cursors disagree',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-state-coordinator] async durable state coordinator guards passed',
);
