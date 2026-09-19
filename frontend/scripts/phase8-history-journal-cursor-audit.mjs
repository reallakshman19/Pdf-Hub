import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-journal-cursor] ${message}`);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required marker: ${marker}`);
    }
  }
}

const typesPath =
  'src/core/document-history/journal/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'activeTransactionId?: string | null',
  'activeTransactionId: null',
  'resolveHistoryJournalActiveTransactionId',
  'duplicate transaction id',
  'null transaction cursor must point at the original revision',
  'active transaction does not match active revision',
  'Legacy history journal cannot infer a transaction cursor',
]);

const appendPath =
  'src/core/document-history/journal/appendMutation.ts';
const append = read(appendPath);
requireContains(append, appendPath, [
  'resolveHistoryJournalActiveTransactionId',
  'activeTransactionId === null',
  'entry.transactionId',
  'manifest.activeTransactionId =',
]);

const navigationPath =
  'src/core/document-history/journal/navigation.ts';
const navigation = read(navigationPath);
requireContains(navigation, navigationPath, [
  "direction: 'undo' | 'redo'",
  'transactionId: string',
  'candidateIndex',
  'previousTransactionId',
  'resolveHistoryJournalActiveTransactionId',
  "input.direction === 'undo'",
  'is not immediately before redo candidate',
  'manifest.activeTransactionId =',
]);

const historyPath =
  'src/core/document-history/transactions.ts';
const history = read(historyPath);
requireContains(history, historyPath, [
  'direction,',
  'transactionId: candidate.id',
]);

const navigationTestsPath =
  'src/core/document-history/journal/navigation.test.ts';
const navigationTests = read(navigationTestsPath);
requireContains(navigationTests, navigationTestsPath, [
  'moves the logical cursor when adjacent transactions share one PDF revision',
  "activeTransactionId: 'state-tx-1'",
  "activeTransactionId: 'state-tx-2'",
]);

const typesTestsPath =
  'src/core/document-history/journal/types.test.ts';
const typesTests = read(typesTestsPath);
requireContains(typesTests, typesTestsPath, [
  'infers the cursor for legacy manifests and validates explicit cursor consistency',
  'resolveHistoryJournalActiveTransactionId',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-journal-cursor] durable transaction cursor guards passed',
);
