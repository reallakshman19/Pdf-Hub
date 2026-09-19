import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-history-state-lazy-factory] ${message}`);
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

const coordinatorPath =
  'src/core/document-history/durableStateTransaction.ts';
const coordinator = read(coordinatorPath);
requireContains(coordinator, coordinatorPath, [
  'DurableStateMutationFactory',
  'commitDurableStateMutation',
  'const input = await factory()',
  'if (!input) return false',
  'commitDurableStateTransactionWithinQueue',
  'useSessionStore.setState(sessionSnapshot)',
  'useHistoryStore.setState(historySnapshot)',
]);

const compatibilityIndex = coordinator.indexOf(
  'export async function commitDurableStateTransaction',
);
const lazyIndex = coordinator.indexOf(
  'export async function commitDurableStateMutation',
);
const coreIndex = coordinator.indexOf(
  'async function commitDurableStateTransactionWithinQueue',
);
if (
  compatibilityIndex < 0
  || lazyIndex < 0
  || coreIndex < 0
  || !(compatibilityIndex < coreIndex)
  || !(lazyIndex < coreIndex)
) {
  fail(
    'Both public coordinator APIs must delegate to one non-enqueuing transaction core.',
  );
}

const testPath =
  'src/core/document-history/__tests__/durableStateTransaction.test.ts';
const tests = read(testPath);
requireContains(tests, testPath, [
  'evaluates queued lazy mutation factories against sequential committed state',
  'expect(observedBefore).toEqual([0, 1])',
  'does not apply anything when a lazy mutation factory throws',
  'expect(useSessionStore.getState().isDirty).toBe(false)',
]);

const annotationStorePath =
  'src/core/annotations/store.ts';
const annotationStore = read(annotationStorePath);
requireContains(annotationStore, annotationStorePath, [
  'commitDurableStateMutation',
  'usesDurableAnnotationHistory',
  'runMutation',
]);

const writerStorePath =
  'src/core/writer-v2/writerV2Store.ts';
const writerStore = read(writerStorePath);
requireContains(writerStore, writerStorePath, [
  'commitDurableStateMutation',
  'dispatchWriterCommandDurable',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-state-lazy-factory] queued lazy state mutation factory guards passed',
);
