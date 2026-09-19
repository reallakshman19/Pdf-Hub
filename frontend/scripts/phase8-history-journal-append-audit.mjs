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
    `[phase8-history-journal-append] ${message}`,
  );
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

const appendPath =
  'src/core/document-history/journal/appendMutation.ts';
const append = read(appendPath);
requireContains(append, appendPath, [
  'prepareHistoryJournalMutation',
  'classifyHistoryReplayability',
  "classification.disposition === 'NON_MUTATING'",
  "classification.disposition",
  "=== 'CHECKPOINT_REQUIRED'",
  "kind: 'BARRIER'",
  'manifest.activeRevisionId =',
  'manifest.activeTransactionId =',
  'resolveHistoryJournalActiveTransactionId',
  'truncateAbandonedTail',
  'manifest.entries = []',
  'activeEntryIndex',
]);
forbidContains(append, appendPath, [
  '.remove(',
  'WorkingRevisionStore',
  'dispatchCommand',
]);

const navigationPath =
  'src/core/document-history/journal/navigation.ts';
const navigation = read(navigationPath);
requireContains(navigation, navigationPath, [
  'prepareHistoryJournalNavigation',
  'current.activeRevisionId !== input.currentRevisionId',
  'resolveHistoryJournalActiveTransactionId',
  'candidateIndex',
  'previousTransactionId',
  'manifest.activeRevisionId = input.targetRevisionId',
  'manifest.activeTransactionId =',
  'previousManifest',
]);
forbidContains(navigation, navigationPath, [
  '.remove(',
  'dispatchCommand',
]);

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  'prepareHistoryJournalMutation',
  'const transactionId = uuidv4()',
  'id: transactionId',
  'timestamp: transactionTimestamp',
  'preparedJournal.store.save',
  'history journal persistence failed',
  'useHistoryStore.setState(historySnapshot)',
]);
const prepareIndex = transaction.indexOf(
  'preparedJournal = await prepareHistoryJournalMutation',
);
const sessionCommitIndex = transaction.indexOf(
  'useSessionStore.getState().replaceWorkingCopy',
);
const historyPushIndex = transaction.indexOf(
  'useHistoryStore.getState().push({',
);
const journalSaveIndex = transaction.indexOf(
  'await preparedJournal.store.save',
);
if (
  prepareIndex < 0
  || sessionCommitIndex < 0
  || historyPushIndex < 0
  || journalSaveIndex < 0
  || !(prepareIndex < sessionCommitIndex)
  || !(sessionCommitIndex < historyPushIndex)
  || !(historyPushIndex < journalSaveIndex)
) {
  fail(
    'Document mutation must prepare journal metadata before app commit, then save it only after synchronous app/history commit.',
  );
}

const historyPath =
  'src/core/document-history/transactions.ts';
const history = read(historyPath);
requireContains(history, historyPath, [
  'prepareHistoryJournalNavigation',
  'history: {',
  'useHistoryStore.setState(snapshot.history)',
  'preparedJournal.store.save',
  'targetRevisionId',
]);
const navigationPrepareIndex = history.indexOf(
  'await prepareHistoryJournalNavigation',
);
const restoreIndex = history.indexOf(
  'restoreHistoryState(target, targetPdf)',
);
const stackIndex = history.indexOf(
  "direction === 'undo'\n        ? useHistoryStore.getState().undo()",
);
const navigationSaveIndex = history.indexOf(
  'await preparedJournal.store.save',
);
if (
  navigationPrepareIndex < 0
  || restoreIndex < 0
  || stackIndex < 0
  || navigationSaveIndex < 0
  || !(navigationPrepareIndex < restoreIndex)
  || !(restoreIndex < stackIndex)
  || !(stackIndex < navigationSaveIndex)
) {
  fail(
    'Undo/redo must prepare journal navigation before restore and save the journal head after stack movement inside rollback protection.',
  );
}

const storePath =
  'src/core/document-history/journal/store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  'Atomically replace one manifest',
  'rejected save must leave the previously',
]);

const appendTestPath =
  'src/core/document-history/journal/appendMutation.test.ts';
const appendTest = read(appendTestPath);
requireContains(appendTest, appendTestPath, [
  'appends a replayable mutation without adding a checkpoint',
  'adds a barrier checkpoint for donor-backed mutation',
  'truncates an abandoned redo tail before appending a new branch',
  'fails closed when journal active revision does not match mutation input',
]);

const navigationTestPath =
  'src/core/document-history/journal/navigation.test.ts';
const navigationTest = read(navigationTestPath);
requireContains(navigationTest, navigationTestPath, [
  'moves active revision without deleting the redo tail',
  'moves the logical cursor when adjacent transactions share one PDF revision',
  'fails when session and journal heads disagree',
]);

const integrationTestPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const integrationTest = read(integrationTestPath);
requireContains(integrationTest, integrationTestPath, [
  'transaction-history-journal',
  "disposition: 'SELF_CONTAINED_REPLAY'",
  'rolls application history back when durable journal save fails',
  'rolls undo state and stacks back when journal navigation save fails',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-journal-append] durable binary mutation journal, branch truncation and navigation rollback guards passed',
);
