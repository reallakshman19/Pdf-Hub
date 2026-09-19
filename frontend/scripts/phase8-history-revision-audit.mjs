import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-revision] ${message}`);
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

const typesPath = 'src/core/document-history/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'export interface HistoryRevisionLocator',
  'storeId: string',
  'revisionId: string',
  'bytes?: Uint8Array',
  'revision?: HistoryRevisionLocator',
]);

const stateTxPath = 'src/core/document-history/stateTransaction.ts';
const stateTx = read(stateTxPath);
requireContains(stateTx, stateTxPath, [
  'hasDurableRevision',
  'revisionStoreId',
  'activeRevisionId',
  'revision:',
]);
forbidContains(stateTx, stateTxPath, [
  'const sharedBytes = session.workingBytes',
]);

const documentTxPath =
  'src/core/commands/transaction/documentTransaction.ts';
const documentTx = read(documentTxPath);
requireContains(documentTx, documentTxPath, [
  'revisionHistoryBacking',
  'beforeRevisionBacking',
  'afterRevisionBacking',
  'previousAfter?.bytes',
]);

const undoPath = 'src/core/document-history/transactions.ts';
const undo = read(undoPath);
requireContains(undo, undoPath, [
  'resolveHistoryPdfBytes',
  'resolveWorkingRevisionStore',
  'materializeDocumentSource',
  'state.revision.storeId',
  'state.revision.revisionId',
  'const targetPdf = await resolveHistoryPdfBytes(target)',
]);
const resolveIndex = undo.indexOf(
  'const targetPdf = await resolveHistoryPdfBytes(target)',
);
const persistIndex = undo.indexOf(
  'await persistHistoryState(target)',
);
const stackIndex = undo.indexOf(
  "direction === 'undo'\n      ? useHistoryStore.getState().undo()",
);
if (
  resolveIndex < 0
  || persistIndex < 0
  || stackIndex < 0
  || !(resolveIndex < persistIndex && persistIndex < stackIndex)
) {
  fail(
    'Undo/redo must resolve the target revision before persistence and stack movement.',
  );
}

const budgetPath = 'src/core/document-history/historyBudget.ts';
const budget = read(budgetPath);
requireContains(budget, budgetPath, [
  'if (!bytes || seenSnapshots.has(bytes)) return 0',
  'if (transaction.before.bytes)',
  'if (transaction.after.bytes)',
]);

const policyPath = 'src/core/document-history/historyPolicy.ts';
const policy = read(policyPath);
requireContains(policy, policyPath, [
  "strategy: 'revision-preferred-byte-budgeted'",
]);

const mutationTestPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const mutationTest = read(mutationTestPath);
requireContains(mutationTest, mutationTestPath, [
  'transaction?.before.bytes).toBeUndefined()',
  'transaction?.after.bytes).toBeUndefined()',
  'does not consume undo history when the target revision store is unavailable',
  'retainedBytes: 0',
]);

const budgetTestPath =
  'src/core/document-history/__tests__/historyBudget.test.ts';
const budgetTest = read(budgetTestPath);
requireContains(budgetTest, budgetTestPath, [
  'does not charge immutable revision locators against the inline byte budget',
  'expect(retainedBytesForTransactions(transactions)).toBe(0)',
]);

const annotationTestPath = 'src/core/annotations/store.test.ts';
const annotationTest = read(annotationTestPath);
requireContains(annotationTest, annotationTestPath, [
  'records revision-aware annotation mutations without retaining PDF bytes',
  'expect(history.retainedBytes).toBe(0)',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-revision] revision-backed history retention and legacy byte fallback guards passed',
);
