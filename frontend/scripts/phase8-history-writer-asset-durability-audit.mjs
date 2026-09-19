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
    `[phase8-history-writer-asset-durability] ${message}`,
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

const runtimePath =
  'src/core/writer-v2/persistence/writerPersistenceRuntime.ts';
const runtime = read(runtimePath);
requireContains(runtime, runtimePath, [
  'resolveWriterPersistenceAdapter',
  'createBestAvailableWriterPersistence',
  'setWriterPersistenceAdapterForTests',
  'resetWriterPersistenceAdapterForTests',
]);

const hookPath =
  'src/components/workspace/useWriterPersistence.ts';
const hook = read(hookPath);
requireContains(hook, hookPath, [
  'resolveWriterPersistenceAdapter',
  'const adapter = React.useMemo(',
]);
forbidContains(hook, hookPath, [
  'createBestAvailableWriterPersistence',
]);

const durabilityPath =
  'src/core/writer-v2/persistence/writerAssetDurability.ts';
const durability = read(durabilityPath);
requireContains(durability, durabilityPath, [
  'persistWriterAssetReferences',
  'resolveWriterPersistenceAdapter',
  'new Set(assetIds.filter(Boolean))',
  'Writer history cannot checkpoint missing asset',
  'await adapter.saveAsset({',
  'documentFingerprint,',
]);
forbidContains(durability, durabilityPath, [
  'markWriterPersisted',
  'saveDocument(',
]);

const storePath =
  'src/core/writer-v2/writerV2Store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  'persistWriterAssetReferences',
  'collectNewWriterAssetReferences',
  'collectWriterAssetReferences',
  'await commitDurableStateMutation(async () => {',
  'await persistWriterAssetReferences(',
]);

const persistIndex = store.indexOf(
  'await persistWriterAssetReferences(',
);
const resultIndex = store.indexOf(
  'committedResult = {',
  persistIndex,
);
const transactionReturnIndex = store.indexOf(
  'return {',
  resultIndex,
);
if (
  persistIndex < 0
  || resultIndex < 0
  || transactionReturnIndex < 0
  || !(persistIndex < resultIndex)
  || !(resultIndex < transactionReturnIndex)
) {
  fail(
    'Writer asset persistence must complete inside the lazy factory before it returns journal transaction input.',
  );
}

const testsPath =
  'src/core/writer-v2/writerV2Store.durableHistory.test.ts';
const tests = read(testsPath);
requireContains(tests, testsPath, [
  'persists newly referenced Writer assets before the journal checkpoint',
  "events.push('asset')",
  "events.push('journal')",
  "expect(events).toEqual([",
  "'asset',",
  "'journal',",
  'fails before Writer apply when a newly referenced asset record is missing',
  'cannot checkpoint missing asset',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-asset-durability] Writer asset-before-journal durability guards passed',
);
