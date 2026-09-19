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
    `[phase8-history-writer-async-callers] ${message}`,
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

const ensurePath =
  'src/core/writer-v2/ensureRichTextEditing.ts';
const ensure = read(ensurePath);
requireContains(ensure, ensurePath, [
  'await writer.dispatchWriterCommandDurable({',
  'if (!addResult.changed)',
  'beginEditingWriterElement(element.id)',
]);
forbidContains(ensure, ensurePath, [
  'writer.dispatchWriterCommand({',
]);

const stylePath =
  'src/core/writer-v2/writerRichBoxStyleActions.ts';
const style = read(stylePath);
requireContains(style, stylePath, [
  'await store.dispatchWriterCommandDurable({',
]);
forbidContains(style, stylePath, [
  'store.dispatchWriterCommand({',
]);

const fitPath =
  'src/core/writer-v2/writerRichBoxFitActions.ts';
const fit = read(fitPath);
requireContains(fit, fitPath, [
  'async function applyRichBoxFit(',
  '.dispatchWriterCommandDurable({',
]);
const awaitedFitCount =
  fit.match(/await applyRichBoxFit\(/g)?.length ?? 0;
if (awaitedFitCount !== 3) {
  fail(
    `Expected three awaited rich-box fit mutations; found ${awaitedFitCount}.`,
  );
}
forbidContains(fit, fitPath, [
  '.dispatchWriterCommand({',
]);

const imagePath =
  'src/core/writer-v2/writerImageBoxActions.ts';
const image = read(imagePath);
requireContains(image, imagePath, [
  'await store.dispatchWriterCommandDurable({',
  'const previousDirty = store.dirty',
  'removeWriterAsset(',
  'dirty: previousDirty',
  'catch (error)',
  'clearActiveImageBoxAsset',
]);
// clearActiveImageBoxAsset remains synchronous in C2A.
const durableIndex = image.indexOf(
  'await store.dispatchWriterCommandDurable({',
);
const clearIndex = image.indexOf(
  'export function clearActiveImageBoxAsset',
);
if (
  durableIndex < 0
  || clearIndex < 0
  || durableIndex > clearIndex
) {
  fail(
    'Async image replacement must use durable dispatch before the intentionally synchronous clear helper.',
  );
}

const imageTestPath =
  'src/core/writer-v2/writerImageBoxActions.test.ts';
const imageTests = read(imageTestPath);
requireContains(imageTests, imageTestPath, [
  'removes the admitted asset when durable Writer dispatch fails',
  "mockRejectedValueOnce(",
  "new Error('journal write failed')",
  'expect(useWriterV2Store.getState().assetRecords)',
  'expect(useWriterV2Store.getState().dirty)',
]);

const integrationTestPath =
  'src/core/writer-v2/writerAsyncDurableHelpers.test.ts';
const integrationTest = read(integrationTestPath);
requireContains(
  integrationTest,
  integrationTestPath,
  [
    'persists rich-box style helper changes through the durable Writer path',
    "command: {\n          type: 'WRITER_CHANGE'",
    "backgroundColor:\n                    '#eff6ff'",
  ],
);

const inheritedAuditPath =
  'scripts/phase8-history-writer-durable-dispatch-audit.mjs';
const inheritedAudit = read(inheritedAuditPath);
requireContains(inheritedAudit, inheritedAuditPath, [
  'approvedDurableCallers',
  "'src/core/writer-v2/ensureRichTextEditing.ts'",
  "'src/core/writer-v2/writerRichBoxStyleActions.ts'",
  "'src/core/writer-v2/writerRichBoxFitActions.ts'",
  "'src/core/writer-v2/writerImageBoxActions.ts'",
  'Unapproved production durable Writer caller',
  'Approved C2A durable Writer caller is missing',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-async-callers] async Writer helper migration guards passed',
);
