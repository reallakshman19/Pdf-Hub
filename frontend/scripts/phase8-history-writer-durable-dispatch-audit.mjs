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
    `[phase8-history-writer-durable-dispatch] ${message}`,
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

function collectSourceFiles(directory) {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolute));
      continue;
    }

    if (
      !entry.isFile()
      || !/\.(?:ts|tsx)$/.test(entry.name)
      || /\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      continue;
    }

    files.push(absolute);
  }

  return files;
}

const storePath =
  'src/core/writer-v2/writerV2Store.ts';
const store = read(storePath);

requireContains(store, storePath, [
  'dispatchWriterCommandDurable',
  'commitDurableStateMutation',
  'usesDurableWriterHistory',
  'executeWriterCommandForSession',
  'writerStoreSnapshot',
  'nextStore.undoStack = []',
  'nextStore.redoStack = []',
  "type: 'WRITER_CHANGE'",
  'writerHistoryState(beforeStore)',
  'writerHistoryState(afterStore)',
  'await commitDurableStateMutation',
  'set(writerStoreSnapshot(beforeStore))',
]);

const durableStart = store.indexOf(
  'function usesDurableWriterHistory',
);
const durableEnd = store.indexOf(
  'function writerStoreSnapshot',
  durableStart,
);
const durablePredicate = store.slice(
  durableStart,
  durableEnd,
);
if (durablePredicate.includes('workingBytes')) {
  fail(
    'Durable Writer history predicate must not depend on compatibility workingBytes.',
  );
}

requireContains(store, storePath, [
  'const hasDurableRevision = Boolean(',
  'session.revisionStoreId',
  'session.activeRevisionId',
  '(hasDurableRevision || session.workingBytes)',
]);

const testsPath =
  'src/core/writer-v2/writerV2Store.durableHistory.test.ts';
const tests = read(testsPath);
requireContains(tests, testsPath, [
  'returns the committed result and persists a Writer state checkpoint',
  'serializes rapid durable Writer commands against committed state',
  'rolls Writer and history state back when journal save fails',
  'does not require compatibility working bytes in a revision-backed session',
  'delegates selection commands and blank-document mutations to the synchronous store path',
]);

const srcRoot = path.join(root, 'src');
for (const absolute of collectSourceFiles(srcRoot)) {
  const relative = path.relative(root, absolute);
  if (
    relative === storePath
    || relative.endsWith(
      'writerV2Store.durableHistory.test.ts',
    )
  ) {
    continue;
  }

  const source = fs.readFileSync(
    absolute,
    'utf8',
  );
  if (
    source.includes(
      'dispatchWriterCommandDurable(',
    )
  ) {
    fail(
      `C1 must not migrate production Writer callers yet: ${relative}`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-durable-dispatch] durable Writer dispatch primitive guards passed',
);
