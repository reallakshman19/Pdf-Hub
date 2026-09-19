import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(
    `[phase8-history-annotation-durable] ${message}`,
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

const storePath = 'src/core/annotations/store.ts';
const store = read(storePath);

requireContains(store, storePath, [
  'commitDurableStateMutation',
  'createAnnotationTransactionInput',
  'recordAnnotationMutation',
  'usesDurableAnnotationHistory',
  'runMutation',
  'annotationStateSnapshot',
  "'Durable annotation mutation failed'",
  'session.revisionStoreId',
  'session.activeRevisionId',
  'session.historyJournalStoreId',
  'session.historyJournalId',
]);

const mutationActions = [
  'addAnnotation',
  'updateAnnotation',
  'updateManyAnnotations',
  'deleteAnnotation',
  'deleteSelection',
  'applyPageRemap',
  'pasteClipboard',
  'duplicateSelection',
  'alignSelection',
  'distributeSelection',
  'setReviewStatusForSelection',
  'setReviewStatus',
  'addReviewReply',
  'toggleLockSelection',
  'updateStyleForSelection',
];

const implementationStart = store.indexOf(
  'export const useAnnotationStore',
);
if (implementationStart < 0) {
  fail('Annotation store implementation export is missing');
}

const implementation = store.slice(implementationStart);

for (let index = 0; index < mutationActions.length; index += 1) {
  const action = mutationActions[index];
  const start = implementation.indexOf(
    `  ${action}:`,
  );
  const nextAction = mutationActions
    .slice(index + 1)
    .map((name) =>
      implementation.indexOf(
        `  ${name}:`,
        start + 1,
      )
    )
    .filter((position) => position > start)
    .sort((a, b) => a - b)[0]
    ?? implementation.length;
  if (start < 0) {
    fail(`Missing annotation mutation action ${action}`);
    continue;
  }
  const block = implementation.slice(
    start,
    nextAction,
  );
  if (!block.includes('runMutation')) {
    fail(
      `Annotation mutation action ${action} does not route through runMutation`,
    );
  }
}

requireContains(
  implementation,
  storePath,
  [
    "setActiveAnnotationId: (id) =>\n    set(",
    "setSelection: (ids) =>\n    set(",
    "toggleSelection: (id) =>\n    set(",
    "clearSelection: () =>\n    set({",
    "setAnnotations: (annotations) =>\n    set({",
    "copySelection: () =>\n    set(",
  ],
);

requireContains(store, storePath, [
  'const targetIds = [',
  'const sourceClipboard = get().clipboard.map',
  'const invocationState = get()',
]);

const writerStorePath =
  'src/core/writer-v2/writerV2Store.ts';
const writerStore = read(writerStorePath);
forbidContains(writerStore, writerStorePath, [
  'commitDurableStateMutation',
]);

const testPath =
  'src/core/annotations/store.durableHistory.test.ts';
const tests = read(testPath);
requireContains(tests, testPath, [
  'commits a journal-aware annotation edit with a state checkpoint',
  'derives rapid queued annotation edits from sequential committed state',
  'rejects unsafe custom stamp data before applying annotation state',
  'rolls annotation, history and session dirty state back when journal save fails',
  'keeps legacy no-journal annotation mutation synchronous',
  'keeps selection and hydration operations synchronous',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-annotation-durable] durable annotation state history guards passed',
);
