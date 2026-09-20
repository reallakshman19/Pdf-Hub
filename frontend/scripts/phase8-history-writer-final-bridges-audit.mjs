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
    `[phase8-history-writer-final-bridges] ${message}`,
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

const commandsPath =
  'src/core/writer-v2/writerCommands.ts';
const commands = read(commandsPath);
requireContains(commands, commandsPath, [
  "type: 'BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS'",
  'updates: WriterElementBatchPatch[]',
  'elements: WriterElementV2[]',
]);

const commandStorePath =
  'src/core/writer-v2/writerCommandStore.ts';
const commandStore = read(commandStorePath);
requireContains(commandStore, commandStorePath, [
  "case 'BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS':",
  "'Atomic Writer batch contains no changes.'",
  'cannot update',
  'cannot add duplicate',
  'Atomically updated',
]);

const commandTestsPath =
  'src/core/writer-v2/writerCommandStore.test.ts';
const commandTests = read(commandTestsPath);
requireContains(commandTests, commandTestsPath, [
  'atomically updates existing elements and adds a replacement',
  'rejects an atomic mixed batch without applying any partial changes',
  'expect(result.state).toBe(state)',
]);

const storePath =
  'src/core/writer-v2/writerV2Store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  "'PDF-backed Writer mutations require durable dispatch.'",
  'allowPdfOverlayMutation?: boolean',
  'allowPdfOverlayMutation: true',
  "BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS",
  "'Consolidate Writer elements'",
]);

const durableTestsPath =
  'src/core/writer-v2/writerV2Store.durableHistory.test.ts';
const durableTests = read(durableTestsPath);
requireContains(durableTests, durableTestsPath, [
  'rejects public synchronous mutations in PDF-overlay mode',
  'keeps the durable API working for PDF-overlay compatibility fallback sessions',
  'records one durable transaction for an atomic update-and-add batch',
  'PDF-backed Writer mutations require durable dispatch.',
]);

const ocrPath =
  'src/core/ocr/ocrWriterBridge.ts';
const ocr = read(ocrPath);
forbidContains(ocr, ocrPath, [
  'dispatchWriterCommand(',
]);
requireContains(ocr, ocrPath, [
  'export async function insertOcrWriterElementsIntoWriterV2Store',
  'export async function insertOcrWriterQueueIntoWriterV2Store',
  'await writerStore.dispatchWriterCommandDurable(',
  'commandApplied: false',
  'failureReason:',
]);

const ocrPanelPath =
  'src/components/ocr/OcrWriterInsertPanel.tsx';
const ocrPanel = read(ocrPanelPath);
requireContains(ocrPanel, ocrPanelPath, [
  'const insertElements = async () => {',
  'await onInsertElements?.(',
  'clearOcrWriterInsertionQueue()',
  'Preserve the queue',
]);

const ocrWorkspacePath =
  'src/components/ocr/workflow/OcrReviewWorkspace.tsx';
const ocrWorkspace = read(ocrWorkspacePath);
requireContains(ocrWorkspace, ocrWorkspacePath, [
  'onInsertWriterElements?: (',
  ') => void | Promise<void>;',
  'await onInsertWriterElements?.(',
  'setLastInsertedWriterCount(',
]);

const ocrConnectedPath =
  'src/components/ocr/OcrPanelWriterConnected.tsx';
const ocrConnected = read(ocrConnectedPath);
requireContains(ocrConnected, ocrConnectedPath, [
  'const insertIntoWriter = React.useCallback(',
  'await insertOcrWriterQueueIntoWriterV2Store({',
  'if (!result.commandApplied) {',
  "'OCR Writer insertion was not committed.'",
]);

const ocrTestsPath =
  'src/core/ocr/__tests__/ocrWriterBridge.test.ts';
const ocrTests = read(ocrTestsPath);
requireContains(ocrTests, ocrTestsPath, [
  'does not report insertion when durable Writer dispatch rejects',
  'journal write failed',
]);

const consolidationPath =
  'src/core/writer-v2/writerLegacyObjectConsolidation.ts';
const consolidation = read(consolidationPath);
forbidContains(consolidation, consolidationPath, [
  'dispatchWriterCommand(',
]);
requireContains(consolidation, consolidationPath, [
  "'Writer legacy consolidation'",
  'dispatchDurableWriterHelperLatest(',
  "type:\n            'BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS'",
  'updates: candidates.map(',
  'elements: [replacement]',
  'selectIds: [',
]);

const consolidationTestsPath =
  'src/core/writer-v2/writerLegacyObjectConsolidation.test.ts';
const consolidationTests = read(consolidationTestsPath);
requireContains(consolidationTests, consolidationTestsPath, [
  'expect(state.undoStack).toHaveLength(1)',
  'leaves every legacy object untouched when durable consolidation fails',
  'journal write failed',
]);

const selectionTypes = new Set([
  'SET_ACTIVE_WRITER_ELEMENT',
  'SET_WRITER_SELECTION',
  'CLEAR_WRITER_SELECTION',
]);
const blankMutationAllowlist = new Map([
  [
    'src/components/writer-v2/WriterBlankPageCanvas.tsx',
    new Set([
      'ADD_WRITER_ELEMENT',
      'CLEAR_WRITER_SELECTION',
    ]),
  ],
  [
    'src/components/writer-v2/WriterBlankImageInsertButton.tsx',
    new Set([
      'ADD_WRITER_ELEMENT',
    ]),
  ],
]);
const storeInternal =
  'src/core/writer-v2/writerV2Store.ts';

function sourceFiles(dir) {
  const entries =
    fs.readdirSync(
      path.join(root, dir),
      { withFileTypes: true },
    );
  const results = [];

  for (const entry of entries) {
    const relative =
      path.posix.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name === '__tests__'
        || entry.name === 'test'
        || entry.name === 'tests'
      ) {
        continue;
      }
      results.push(...sourceFiles(relative));
      continue;
    }

    if (
      !/\.(ts|tsx)$/.test(entry.name)
      || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)
    ) {
      continue;
    }

    results.push(relative);
  }

  return results;
}

for (const relativePath of sourceFiles('src')) {
  const source = read(relativePath);
  let index = 0;

  while (
    (
      index =
        source.indexOf(
          'dispatchWriterCommand(',
          index,
        )
    ) >= 0
  ) {
    if (relativePath === storeInternal) {
      index += 1;
      continue;
    }

    const window =
      source.slice(index, index + 500);
    const match =
      window.match(
        /type\s*:\s*['"]([A-Z_]+)['"]/,
      );

    if (!match) {
      fail(
        `${relativePath} has unclassified synchronous Writer dispatch near offset ${index}`,
      );
      index += 1;
      continue;
    }

    const type = match[1];
    const blankAllowed =
      blankMutationAllowlist
        .get(relativePath)
        ?.has(type)
      ?? false;

    if (
      !selectionTypes.has(type)
      && !blankAllowed
    ) {
      fail(
        `${relativePath} synchronously dispatches document mutation ${type}`,
      );
    }

    index += 1;
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-final-bridges] final Writer mutation-boundary guards passed',
);
