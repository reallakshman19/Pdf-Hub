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
    `[phase8-history-writer-ui-one-shot] ${message}`,
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

const helperPath =
  'src/core/writer-v2/durableWriterUiDispatch.ts';
const helper = read(helperPath);
requireContains(helper, helperPath, [
  'dispatchDurableWriterUiCommand',
  '.dispatchWriterCommandDurable(command)',
  "'Durable Writer UI mutation failed'",
  'commandType: command.type',
  'throw error',
]);

const boxPath =
  'src/components/writer-v2/WriterElementBox.tsx';
const box = read(boxPath);
requireContains(box, boxPath, [
  "'WriterElementBox drag move'",
  "'WriterElementBox drag resize'",
  "'WriterElementBox editor save'",
  'await dispatchDurableWriterUiCommand(',
  'removeWriterAsset(assetId)',
  'dirty: previousDirty',
  "type: 'SET_ACTIVE_WRITER_ELEMENT'",
]);
forbidContains(box, boxPath, [
  "dispatchWriterCommand({\n        type: 'MOVE_WRITER_ELEMENT'",
  "dispatchWriterCommand({\n        type: 'RESIZE_WRITER_ELEMENT'",
  "dispatchWriterCommand({\n      type: 'UPDATE_WRITER_ELEMENT'",
]);

const overlayPath =
  'src/components/writer-v2/WriterOverlayLayer.tsx';
const overlay = read(overlayPath);
requireContains(overlay, overlayPath, [
  'const placeWriterElement = async (',
  "'WriterOverlayLayer placement'",
  "type: 'ADD_WRITER_ELEMENT'",
  'if (result.changed) {',
  "setActiveWriterTool('select')",
  "type: 'CLEAR_WRITER_SELECTION'",
]);
const overlayDurableIndex =
  overlay.indexOf(
    'await dispatchDurableWriterUiCommand(',
  );
const overlaySelectIndex =
  overlay.indexOf(
    "setActiveWriterTool('select')",
    overlayDurableIndex,
  );
if (
  overlayDurableIndex < 0
  || overlaySelectIndex < overlayDurableIndex
) {
  fail(
    'Writer placement must switch to select only after durable dispatch returns.',
  );
}
forbidContains(overlay, overlayPath, [
  "dispatchWriterCommand({\n      type: 'ADD_WRITER_ELEMENT'",
]);

const ribbonPath =
  'src/components/writer-v2/WriterRibbon.tsx';
const ribbon = read(ribbonPath);
requireContains(ribbon, ribbonPath, [
  "'WriterRibbon image asset link'",
  'await dispatchDurableWriterUiCommand(',
  'removeWriterAsset(asset.id)',
  'dirty: previousDirty',
  'await runOrQueueRichCommand(',
]);
forbidContains(ribbon, ribbonPath, [
  '.dispatchWriterCommand({',
]);

const selectBoxPath =
  'src/components/select-box-copy/SelectBoxCopyLayer.tsx';
const selectBox = read(selectBoxPath);
requireContains(selectBox, selectBoxPath, [
  "'SelectBoxCopy insert into Writer'",
  'await dispatchDurableWriterUiCommand(',
  'if (!insertResult.changed)',
  'removeWriterAsset(imageAssetId)',
  'dirty: previousWriterDirty',
  "completeSaveOperation(",
]);
const selectBoxDurableIndex =
  selectBox.indexOf(
    'await dispatchDurableWriterUiCommand(',
  );
const selectBoxSuccessIndex =
  selectBox.indexOf(
    "'Select Box Copy inserted into Writer V2.'",
    selectBoxDurableIndex,
  );
if (
  selectBoxDurableIndex < 0
  || selectBoxSuccessIndex < selectBoxDurableIndex
) {
  fail(
    'Select Box success notification must occur after durable Writer dispatch.',
  );
}
forbidContains(selectBox, selectBoxPath, [
  'dispatchWriterCommand',
]);

const helperTestPath =
  'src/core/writer-v2/durableWriterUiDispatch.test.ts';
const helperTests = read(helperTestPath);
requireContains(helperTests, helperTestPath, [
  'returns the committed durable Writer result',
  'logs context and command type before rethrowing a durable failure',
  "'journal write failed'",
  "source: 'writer'",
  "commandType:",
]);

const inheritedAuditPath =
  'scripts/phase8-history-writer-durable-dispatch-audit.mjs';
const inheritedAudit = read(inheritedAuditPath);
requireContains(
  inheritedAudit,
  inheritedAuditPath,
  [
    "'src/core/writer-v2/durableWriterUiDispatch.ts'",
    'Unapproved production durable Writer caller',
  ],
);

const tablePropertiesPath =
  'src/components/writer-v2/WriterTablePropertiesPanel.tsx';
const tableProperties = read(tablePropertiesPath);
requireContains(
  tableProperties,
  tablePropertiesPath,
  [
    'tableCommitTailRef',
    'dispatchDurableWriterUiCommand(',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-ui-one-shot] one-shot Writer UI durability guards passed',
);
