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
    `[phase8-history-writer-table-properties] ${message}`,
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

const panelPath =
  'src/components/writer-v2/WriterTablePropertiesPanel.tsx';
const panel = read(panelPath);

requireContains(panel, panelPath, [
  'tableCommitTailRef',
  'runDurableCommand',
  'dispatchDurableWriterUiCommand(',
  'useWriterV2Store\n                .getState()\n                .elements',
  'function TableDraftTextInput',
  'function TableDraftNumberInput',
  'function TableDraftColorInput',
  'resolveLatestTableCellStyle',
  "'WriterTableProperties cell text'",
  "'WriterTableProperties padding'",
  "'WriterTableProperties border'",
  "'WriterTableProperties column width'",
]);

forbidContains(panel, panelPath, [
  'dispatchWriterCommand',
  'onChange={(event) => updateCellText(',
  'onChange={(event) => setPadding(',
  'onChange={(event) => resizeColumn(',
]);

const queueStart = panel.indexOf(
  'const runDurableCommand',
);
const tableStart = panel.indexOf(
  'const table = React.useMemo',
  queueStart,
);
const queueBlock = panel.slice(
  queueStart,
  tableStart,
);
requireContains(queueBlock, panelPath, [
  'tableCommitTailRef.current.then(',
  'useWriterV2Store',
  '.getState()',
  '.elements',
  'const result = builder(',
  'tableCommitTailRef.current =',
  'run.then(',
]);

const textStart = panel.indexOf(
  'function TableDraftTextInput',
);
const numberStart = panel.indexOf(
  'function TableDraftNumberInput',
);
const colorStart = panel.indexOf(
  'function TableDraftColorInput',
);
const componentStart = panel.indexOf(
  'export const WriterTablePropertiesPanel',
);
if (
  textStart < 0
  || numberStart < 0
  || colorStart < 0
  || componentStart < 0
) {
  fail(
    'Table Properties draft component boundaries are missing.',
  );
} else {
  const textBlock = panel.slice(
    textStart,
    numberStart,
  );
  requireContains(textBlock, panelPath, [
    'onBlur={commit}',
    "event.key === 'Enter'",
    "event.key === 'Escape'",
    'cancelBlurRef.current = true',
  ]);

  const numberBlock = panel.slice(
    numberStart,
    colorStart,
  );
  requireContains(numberBlock, panelPath, [
    'onBlur={commit}',
    "event.key === 'Enter'",
    "event.key === 'Escape'",
    'Number.isFinite(parsed)',
  ]);

  const colorBlock = panel.slice(
    colorStart,
    componentStart,
  );
  requireContains(colorBlock, panelPath, [
    'window.setTimeout(',
    'window.clearTimeout(',
    '250,',
    'scheduleCommit(',
  ]);
}

const actionStart = panel.indexOf(
  'const freezeSelection',
);
const renderStart = panel.indexOf(
  '\n\n  return (',
  actionStart,
);
const actions = panel.slice(
  actionStart,
  renderStart,
);
forbidContains(actions, panelPath, [
  'buildSetTableCellHorizontalAlignmentCommand(\n          elements,',
  'buildSetTableCellVerticalAlignmentCommand(\n          elements,',
  'buildSetTableCellFillCommand(\n          elements,',
  'buildSetTableCellPaddingCommand(\n          elements,',
  'buildSetTableCellBorderCommand(\n          elements,',
  'buildResizeTableColumnCommand(\n          elements,',
  'buildUpdateTableCellTextCommand(\n          elements,',
]);

requireContains(actions, panelPath, [
  'const selectionAtInvocation =',
  'const columnId = currentColumn.id',
  'resolveLatestTableCellStyle(',
  'patch.style\n              ?? latestBorder?.style',
  'patch.color\n              ?? latestBorder?.color',
  'patch.width\n              ?? latestBorder?.width',
]);

for (const label of [
  'Selected table cell text',
  'Table cell fill',
  'Table cell padding',
  'Table border color',
  'Table border width',
  'Table column width',
]) {
  if (!panel.includes(label)) {
    fail(
      `Table Properties input accessibility/guard label missing: ${label}`,
    );
  }
}

const testPath =
  'src/components/writer-v2/WriterTablePropertiesPanel.structure.test.tsx';
const tests = read(testPath);
requireContains(tests, testPath, [
  'keeps cell text local until blur, then commits it',
  'serializes rapid padding and column-width commits against latest table state',
  'cancels a cell-text draft on Escape without mutating Writer state',
  'waitFor',
  "'Draft value'",
  "padding",
  "width",
]);

const oneShotPath =
  'scripts/phase8-history-writer-ui-one-shot-audit.mjs';
const oneShot = read(oneShotPath);
forbidContains(oneShot, oneShotPath, [
  'C2B1 must not migrate high-frequency surface before coalescing',
]);
requireContains(oneShot, oneShotPath, [
  'tableCommitTailRef',
]);

const inspectorPath =
  'scripts/phase8-history-writer-inspector-audit.mjs';
const inspector = read(inspectorPath);
requireContains(inspector, inspectorPath, [
  'tableCommitTailRef',
  'dispatchDurableWriterUiCommand(',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-table-properties] Writer Table Properties coalescing guards passed',
);
