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
    `[phase8-history-journal] ${message}`,
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

const typesPath =
  'src/core/document-history/journal/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'HISTORY_JOURNAL_SCHEMA_VERSION = 1',
  'HistoryJournalManifestV1',
  'HistoryJournalCheckpoint',
  'HistoryJournalEntry',
  'createInitialHistoryJournalManifest',
  "kind: 'ADMISSION'",
  'revisionStoreId',
  'originalRevisionId',
  'activeRevisionId',
]);
forbidContains(types, typesPath, [
  'Uint8Array',
  'workingBytes',
  'originalBytes',
]);

const storePath =
  'src/core/document-history/journal/store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  'HistoryJournalStore',
  'persistent: boolean',
  'listByOriginalRevision',
]);

const registryPath =
  'src/core/document-history/journal/registry.ts';
const registry = read(registryPath);
requireContains(registry, registryPath, [
  'registerHistoryJournalStore',
  'resolveHistoryJournalStore',
  'releaseHistoryJournalStore',
]);

const indexedPath =
  'src/adapters/history-journal/IndexedDbHistoryJournalStore.ts';
const indexed = read(indexedPath);
requireContains(indexed, indexedPath, [
  "from 'idb'",
  "keyPath: 'journalId'",
  "'by-originalRevisionId'",
  'persistent: true',
]);

const memoryPath =
  'src/adapters/history-journal/MemoryHistoryJournalStore.ts';
const memory = read(memoryPath);
requireContains(memory, memoryPath, [
  'persistent: false',
  'cloneHistoryJournalManifest',
]);

const selectorPath =
  'src/adapters/history-journal/browserHistoryJournalStore.ts';
const selector = read(selectorPath);
requireContains(selector, selectorPath, [
  'PRIMARY_HISTORY_JOURNAL_STORE_ID',
  'IndexedDbHistoryJournalStore',
  'MemoryHistoryJournalStore',
  'store.probe()',
  'fallbackReason',
]);

const sessionTypesPath = 'src/core/session/types.ts';
const sessionTypes = read(sessionTypesPath);
requireContains(sessionTypes, sessionTypesPath, [
  'historyJournalStoreId: string | null',
  'historyJournalId: string | null',
  'historyJournalPersistent: boolean',
]);

const sessionStorePath = 'src/core/session/store.ts';
const sessionStore = read(sessionStorePath);
requireContains(sessionStore, sessionStorePath, [
  'assertOpenHistoryJournalMetadata',
  'resolveHistoryJournalStore',
  'releaseHistoryJournalStore',
  'historyJournalStoreId: null',
  'historyJournalId: null',
  'historyJournalPersistent: false',
  'does not match store capability',
]);

const admissionPath = 'src/core/admission/openPdf.ts';
const admission = read(admissionPath);
requireContains(admission, admissionPath, [
  'getBrowserHistoryJournalStore',
  'createHistoryJournalId',
  'createInitialHistoryJournalManifest',
  'open PDF: initialize history journal',
  'provisionalJournal',
  'after history journal initialization',
  'historyJournalPersistent',
]);

const revisionPublishIndex = admission.indexOf(
  'const initialRevision = await ensureStoredRevision',
);
const journalCreateIndex = admission.indexOf(
  'const journalId = createHistoryJournalId()',
);
const sessionCommitIndex = admission.indexOf(
  'commit(payload)',
);
if (
  revisionPublishIndex < 0
  || journalCreateIndex < 0
  || sessionCommitIndex < 0
  || !(revisionPublishIndex < journalCreateIndex)
  || !(journalCreateIndex < sessionCommitIndex)
) {
  fail(
    'Admission must publish the initial PDF revision before creating journal metadata and commit session only after journal initialization.',
  );
}

const openTestPath = 'src/core/admission/openPdf.test.ts';
const openTest = read(openTestPath);
requireContains(openTest, openTestPath, [
  'MemoryHistoryJournalStore',
  'historyJournalStoreId',
  "kind: 'ADMISSION'",
  'historyJournalPersistent: false',
]);

const sessionTestPath =
  'src/core/session/__tests__/session.test.ts';
const sessionTest = read(sessionTestPath);
requireContains(sessionTest, sessionTestPath, [
  'tracks and releases history journal identity with the document',
  'rejects incomplete or unregistered history journal metadata',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-journal] durable journal manifest, admission checkpoint and session identity guards passed',
);
