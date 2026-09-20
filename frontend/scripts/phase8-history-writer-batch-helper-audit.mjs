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
    `[phase8-history-writer-batch-helper] ${message}`,
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

const selectionPath =
  'src/core/writer-v2/writerSelectionActions.ts';
const selection = read(selectionPath);
forbidContains(selection, selectionPath, [
  'dispatchWriterCommand({',
]);
requireContains(selection, selectionPath, [
  'export async function duplicateSelectedWriterElements',
  'export async function deleteSelectedWriterElements',
  'export async function toggleLockSelectedWriterElements',
  'export async function hideSelectedWriterElements',
  'export async function showAllWriterElements',
  'export async function bringSelectedWriterElementToFront',
  'export async function sendSelectedWriterElementToBack',
  'export async function nudgeSelectedWriterElements',
  'export async function alignSelectedWriterElements',
  'export async function distributeSelectedWriterElements',
  'dispatchDurableWriterHelperLatest(',
  'selectedIdsAtInvocation',
  'editableElementsForIds',
  "type:\n            'BATCH_ADD_WRITER_ELEMENTS'",
  "type:\n            'BATCH_DELETE_WRITER_ELEMENTS'",
  "type:\n            'BATCH_UPDATE_WRITER_ELEMENTS'",
]);

const clipboardPath =
  'src/core/writer-v2/writerClipboardActions.ts';
const clipboard = read(clipboardPath);
forbidContains(clipboard, clipboardPath, [
  'dispatchWriterCommand({',
]);
requireContains(clipboard, clipboardPath, [
  'export function copySelectedWriterElementsToClipboard',
  'export async function pasteWriterClipboardElements',
  'const sourceElements =',
  "'Writer clipboard paste'",
  'dispatchDurableWriterHelperLatest(',
  'if (result.changed) {',
  'clipboard = {',
]);

const keyboardPath =
  'src/components/writer-v2/WriterKeyboardHandler.tsx';
const keyboard = read(keyboardPath);
requireContains(keyboard, keyboardPath, [
  'void pasteWriterClipboardElements()',
  'void nudgeSelectedWriterElements(',
  'void deleteSelectedWriterElements()',
  'void duplicateSelectedWriterElements()',
  "type: 'CLEAR_WRITER_SELECTION'",
]);

const quickPath =
  'src/components/writer-v2/WriterSelectionQuickActions.tsx';
const quick = read(quickPath);
requireContains(quick, quickPath, [
  'const run = async (',
  '| Promise<WriterSelectionActionResult>',
  'const resolved = await result',
  'void run(pasteWriterClipboardElements())',
  'void run(duplicateSelectedWriterElements())',
]);

const layersPath =
  'src/components/writer-v2/WriterLayersPanel.tsx';
const layers = read(layersPath);
requireContains(layers, layersPath, [
  'void showAllWriterElements()',
  'void duplicateSelectedWriterElements()',
  'void toggleLockSelectedWriterElements()',
  'void hideSelectedWriterElements()',
  'void bringSelectedWriterElementToFront()',
  'void sendSelectedWriterElementToBack()',
  'void deleteSelectedWriterElements()',
  "type: 'SET_ACTIVE_WRITER_ELEMENT'",
  "type: 'SET_WRITER_SELECTION'",
  "type: 'CLEAR_WRITER_SELECTION'",
]);

const inspectorPath =
  'src/components/writer-v2/WriterV2Inspector.tsx';
const inspector = read(inspectorPath);
requireContains(inspector, inspectorPath, [
  "void alignSelectedWriterElements('left')",
  "void distributeSelectedWriterElements('horizontal')",
  'void nudgeSelectedWriterElements(-1, 0)',
  'void bringSelectedWriterElementToFront()',
  'void duplicateSelectedWriterElements()',
  'void toggleLockSelectedWriterElements()',
  'void showAllWriterElements()',
  'void hideSelectedWriterElements()',
  'void deleteSelectedWriterElements()',
]);

const selectionTestsPath =
  'src/core/writer-v2/writerSelectionActions.objectControl.test.ts';
const selectionTests = read(selectionTestsPath);
requireContains(selectionTests, selectionTestsPath, [
  'applies rapid nudges against the latest committed geometry',
  'await nudgeSelectedWriterElements(',
]);

const clipboardTestsPath =
  'src/core/writer-v2/__tests__/writerClipboardActions.test.ts';
const clipboardTests = read(clipboardTestsPath);
requireContains(clipboardTests, clipboardTestsPath, [
  'await pasteWriterClipboardElements()',
  'copies the latest pasted elements so repeated paste cascades',
]);

const durableTestsPath =
  'src/core/writer-v2/writerV2Store.durableHistory.test.ts';
const durableTests = read(durableTestsPath);
requireContains(durableTests, durableTestsPath, [
  'records one durable history transaction for a multi-element selection mutation',
  'expect(manifest?.entries).toHaveLength(1)',
  "checkpoint.kind === 'BARRIER'",
]);

const inheritedPath =
  'scripts/phase8-history-writer-single-helper-audit.mjs';
const inherited = read(inheritedPath);
forbidContains(inherited, inheritedPath, [
  "'src/core/writer-v2/writerSelectionActions.ts'",
  "'src/core/writer-v2/writerClipboardActions.ts'",
]);
requireContains(inherited, inheritedPath, [
  "'src/core/ocr/ocrWriterBridge.ts'",
  "'src/core/writer-v2/writerLegacyObjectConsolidation.ts'",
]);

for (const deferredPath of [
  'src/core/ocr/ocrWriterBridge.ts',
  'src/core/writer-v2/writerLegacyObjectConsolidation.ts',
]) {
  const source = read(deferredPath);
  if (!source.includes('dispatchWriterCommand(')) {
    fail(
      `C2C2 deferred mutation boundary unexpectedly moved: ${deferredPath}`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-batch-helper] batch Writer helper durability guards passed',
);
