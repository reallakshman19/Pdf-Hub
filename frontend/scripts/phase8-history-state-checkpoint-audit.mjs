import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-state-checkpoint] ${message}`);
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

const codecPath =
  'src/core/document-history/journal/stateCheckpoint.ts';
const codec = read(codecPath);
requireContains(codec, codecPath, [
  'HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION = 1',
  'createHistoryStateCheckpointPayload',
  'assertHistoryStateCheckpointPayload',
  'cloneHistoryStateCheckpointPayload',
  'DATA_URI_PATTERN',
  'ArrayBuffer.isView',
  "typeof Blob !== 'undefined'",
  'Object.getOwnPropertySymbols',
  'Number.isFinite',
  'new WeakSet<object>()',
  'non-plain object',
]);
forbidContains(codec, codecPath, [
  'WriterAssetRecordV2',
  'dataUrl:',
  'Uint8Array(',
  'save(',
]);

const journalTypesPath =
  'src/core/document-history/journal/types.ts';
const journalTypes = read(journalTypesPath);
requireContains(journalTypes, journalTypesPath, [
  'statePayload?: HistoryStateCheckpointPayload',
  'assertHistoryStateCheckpointPayload',
  "checkpoint.kind === 'ADMISSION'",
  'Admission checkpoints cannot contain statePayload',
]);

const stateTxPath =
  'src/core/document-history/stateTransaction.ts';
const stateTx = read(stateTxPath);
forbidContains(stateTx, stateTxPath, [
  'HistoryJournalStore',
  'statePayload',
  'prepareHistory',
  'await ',
]);

const testsPath =
  'src/core/document-history/journal/__tests__/stateCheckpoint.test.ts';
const tests = read(testsPath);
requireContains(tests, testsPath, [
  'accepts clone-safe annotations and Writer asset references',
  'rejects annotation stamp data URIs',
  'rejects generic data URIs without an explicit media type',
  'rejects data URIs buried inside Writer serialized editor state',
  'rejects typed binary data, non-finite numbers and cycles',
  'rejects symbol-keyed structured state',
  'rejects non-plain object instances and unsupported values',
  'clones without retaining mutable aliases',
]);

const manifestTestsPath =
  'src/core/document-history/journal/types.test.ts';
const manifestTests = read(manifestTestsPath);
requireContains(manifestTests, manifestTestsPath, [
  'validates state checkpoint payloads embedded in manifests',
  'forbids state payloads on admission checkpoints',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-state-checkpoint] binary-safe state checkpoint payload guards passed',
);
