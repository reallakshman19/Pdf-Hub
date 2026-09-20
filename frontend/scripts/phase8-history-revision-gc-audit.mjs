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
    `[phase8-history-revision-gc] ${message}`,
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

const revisionTypesPath =
  'src/core/revision-store/types.ts';
const revisionTypes =
  read(revisionTypesPath);
requireContains(
  revisionTypes,
  revisionTypesPath,
  [
    'listRevisionIds(): Promise<string[]>',
    'remove(revisionId: string): Promise<void>',
  ],
);

const memoryRevisionPath =
  'src/adapters/revision-store/MemoryRevisionStore.ts';
const memoryRevision =
  read(memoryRevisionPath);
requireContains(
  memoryRevision,
  memoryRevisionPath,
  [
    'async listRevisionIds()',
    '[...this.revisions.keys()].sort()',
  ],
);

const opfsRevisionPath =
  'src/adapters/revision-store/OpfsRevisionStore.ts';
const opfsRevision =
  read(opfsRevisionPath);
requireContains(
  opfsRevision,
  opfsRevisionPath,
  [
    'listCommittedOpfsRevisionIds',
    'pending: this.pending',
    'async listRevisionIds()',
  ],
);
if (
  opfsRevision.split('\n').length
  > 300
) {
  fail(
    `${opfsRevisionPath} exceeds the inherited 300-line storage adapter boundary`,
  );
}

const opfsInventoryPath =
  'src/adapters/revision-store/opfsRevisionInventory.ts';
const opfsInventory =
  read(opfsInventoryPath);
requireContains(
  opfsInventory,
  opfsInventoryPath,
  [
    'listCommittedOpfsRevisionIds',
    '!input.pending.has(',
    'decodeURIComponent',
    'return ids.sort()',
    'clearCommittedOpfsRevisionFiles',
  ],
);

const journalStorePath =
  'src/core/document-history/journal/store.ts';
const journalStore =
  read(journalStorePath);
requireContains(
  journalStore,
  journalStorePath,
  [
    'listAll(): Promise<HistoryJournalManifest[]>',
  ],
);

const memoryJournalPath =
  'src/adapters/history-journal/MemoryHistoryJournalStore.ts';
const memoryJournal =
  read(memoryJournalPath);
requireContains(
  memoryJournal,
  memoryJournalPath,
  [
    'async listAll()',
    'left.journalId.localeCompare(',
    '.map(cloneHistoryJournalManifest)',
  ],
);

const indexedJournalPath =
  'src/adapters/history-journal/IndexedDbHistoryJournalStore.ts';
const indexedJournal =
  read(indexedJournalPath);
requireContains(
  indexedJournal,
  indexedJournalPath,
  [
    'async listAll()',
    "await db.getAll('manifests')",
    'left.journalId.localeCompare(',
    '.map(cloneHistoryJournalManifest)',
  ],
);

const reachabilityPath =
  'src/core/document-history/revision-gc/reachability.ts';
const reachability =
  read(reachabilityPath);
requireContains(
  reachability,
  reachabilityPath,
  [
    'planRevisionReachability',
    "'SESSION_ORIGINAL'",
    "'SESSION_ACTIVE'",
    "'HISTORY_UNDO_BEFORE'",
    "'HISTORY_REDO_AFTER'",
    "'JOURNAL_ORIGINAL'",
    "'JOURNAL_ACTIVE'",
    "'JOURNAL_ENTRY_BEFORE'",
    "'JOURNAL_ENTRY_AFTER'",
    "'JOURNAL_CHECKPOINT'",
    "'RUNTIME_PIN'",
    "'MISSING_REFERENCED_REVISION'",
    'safeToDelete:',
  ],
);
forbidContains(
  reachability,
  reachabilityPath,
  [
    '.remove(',
    'Date.now(',
    'setTimeout(',
    'setInterval(',
  ],
);

const pinsPath =
  'src/core/revision-store/pins.ts';
const pins = read(pinsPath);
requireContains(pins, pinsPath, [
  'RevisionRuntimePin',
  'acquireRevisionPin',
  'listRevisionPins',
  'release()',
]);
forbidContains(pins, pinsPath, [
  '@/core/document-history/',
  '@/core/session/',
]);

const exclusionPath =
  'src/core/revision-store/exclusion.ts';
const exclusion =
  read(exclusionPath);
requireContains(
  exclusion,
  exclusionPath,
  [
    'navigator',
    '.locks',
    "'exclusive'",
    "'shared'",
    'requireCrossContext',
    'RevisionStoreLockUnavailableError',
    'RevisionStoreGcBlockedError',
    'revisionStoreGcBlockerLockName',
    'ifAvailable: true',
    'acquireLocalExclusiveLease',
  ],
);

const gcPath =
  'src/core/document-history/revision-gc/gc.ts';
const gc = read(gcPath);
requireContains(gc, gcPath, [
  'planLiveRevisionGarbageCollection',
  'executeRevisionGarbageCollection',
  'enqueueDocumentOperation',
  'listRevisionIds()',
  'listAll()',
  'listRevisionPins(',
  'acquireRevisionStoreExclusiveLease',
  'requireCrossContext:',
  'acquireRevisionStoreGcClearanceLease',
  'assertCompatiblePlan',
  "'UNSAFE_REACHABILITY'",
  "'STALE_PLAN'",
  'await revisionStore.remove(',
  "status: 'partial'",
]);
requireOrder(
  gc,
  gcPath,
  'acquireRevisionStoreExclusiveLease({',
  'planLiveRevisionGarbageCollection({',
);
requireOrder(
  gc,
  gcPath,
  'assertCompatiblePlan(',
  'await revisionStore.remove(',
);
forbidContains(gc, gcPath, [
  'maxAge',
  'createdAt <',
  'Date.now() -',
  'setTimeout(',
  'setInterval(',
]);

const mutationPath =
  'src/core/commands/transaction/documentTransaction.ts';
const mutation = read(mutationPath);
requireContains(
  mutation,
  mutationPath,
  [
    'acquireRevisionStoreExclusiveLease',
    'const revisionLease =',
    'publishedRevisionId = await publishMutationRevision(',
    'await preparedJournal.store.save(',
    'revisionLease?.release()',
  ],
);
requireOrder(
  mutation,
  mutationPath,
  'const revisionLease =',
  'publishedRevisionId = await publishMutationRevision(',
);
requireOrder(
  mutation,
  mutationPath,
  'await preparedJournal.store.save(',
  'revisionLease?.release()',
);

const admissionPath =
  'src/core/admission/openPdf.ts';
const admission = read(admissionPath);
requireContains(
  admission,
  admissionPath,
  [
    'acquireRevisionStoreExclusiveLease',
    'acquireRevisionStoreGcBlockerLease',
    'revisionStore.capabilities.persistent',
    '!historyJournalPersistent',
    'installActiveSessionRevisionGcBlocker(',
    'revisionLease.release()',
  ],
);
requireOrder(
  admission,
  admissionPath,
  'const revisionLease =',
  'ensureStoredRevision({',
);
requireOrder(
  admission,
  admissionPath,
  'journalStore.save(manifest)',
  'revisionLease.release()',
);

const sessionPath =
  'src/core/session/store.ts';
const session = read(sessionPath);
requireContains(
  session,
  sessionPath,
  [
    'releaseActiveSessionRevisionGcBlocker',
    'clearDocument: () => {',
  ],
);

const reachabilityTestPath =
  'src/core/document-history/revision-gc/__tests__/reachability.test.ts';
const reachabilityTests =
  read(reachabilityTestPath);
requireContains(
  reachabilityTests,
  reachabilityTestPath,
  [
    'protects all journals, live session, undo/redo and runtime pins in one shared store',
    'protects journal-only recovery references after a process restart',
    'fails closed when any retained reference is missing from inventory',
  ],
);

const gcTestPath =
  'src/core/document-history/revision-gc/__tests__/gc.test.ts';
const gcTests = read(gcTestPath);
requireContains(
  gcTests,
  gcTestPath,
  [
    'deletes only revisions unreachable from every retained journal',
    'rejects a stale plan before deleting when a candidate becomes journal-reachable',
    'returns partial failure and safely retries the same plan',
    'fails closed before remove when retained journal references are missing',
    'fails closed if complete journal inventory becomes unavailable after planning',
  ],
);

const exclusionTestPath =
  'src/core/revision-store/__tests__/exclusion.test.ts';
const exclusionTests =
  read(exclusionTestPath);
requireContains(
  exclusionTests,
  exclusionTestPath,
  [
    'serializes local writers when Web Locks is unavailable',
    'requires origin-wide locking before persistent destructive work',
    'fails fast when an unjournaled session holds the GC blocker',
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
    'Phase 8E.5C4 makes working-revision deletion reference-aware',
    'complete journal-store inventory',
    'Web Locks',
    'GC-blocker',
    'No age-only deletion',
    'WP-8E still requires closure/recovery certification',
  ],
);

const docsPath =
  '../Docs/WORKING_REVISION_STORE.md';
const docs = read(docsPath);
requireContains(
  docs,
  docsPath,
  [
    'Phase 8E.5C4',
    'listRevisionIds()',
    'document-history GC policy',
    'shared across documents',
    'fails closed',
    'Web Locks',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-history-revision-gc] reference-aware revision GC guards passed',
);
