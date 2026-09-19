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
    `[phase8-history-writer-table-drag] ${message}`,
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

const overlayPath =
  'src/components/writer-v2/WriterTableInteractionOverlay.tsx';
const overlay = read(overlayPath);

requireContains(overlay, overlayPath, [
  'data-writer-table-resize-preview="column"',
  'data-writer-table-resize-preview="row"',
  'buildWriterTableDragResizeCommand({',
  'dispatchDurableWriterUiCommand(',
  "'WriterTableInteractionOverlay column resize'",
  "'WriterTableInteractionOverlay row resize'",
  'onPointerCancel={onPointerCancel}',
  "type: 'SET_ACTIVE_WRITER_ELEMENT'",
]);

const moveStart = overlay.indexOf(
  'const onPointerMove',
);
const upStart = overlay.indexOf(
  'const onPointerUp',
);
const cancelStart = overlay.indexOf(
  'const onPointerCancel',
);
const renderStart = overlay.indexOf(
  'return (',
  cancelStart,
);

if (
  moveStart < 0
  || upStart < 0
  || cancelStart < 0
  || renderStart < 0
) {
  fail(
    'Writer table pointer handler boundaries are missing.',
  );
} else {
  const moveBlock = overlay.slice(
    moveStart,
    upStart,
  );
  forbidContains(
    moveBlock,
    overlayPath,
    [
      'dispatchWriterCommand',
      'dispatchDurableWriterUiCommand',
      'buildResizeTableColumnCommand',
      'buildResizeTableRowCommand',
    ],
  );
  requireContains(
    moveBlock,
    overlayPath,
    [
      'setDragState((current) =>',
      'previewX: point.x',
      'previewY: point.y',
    ],
  );

  const upBlock = overlay.slice(
    upStart,
    cancelStart,
  );
  requireContains(
    upBlock,
    overlayPath,
    [
      'buildWriterTableDragResizeCommand({',
      'useWriterV2Store.getState().elements',
      'dispatchDurableWriterUiCommand(',
    ],
  );

  const cancelBlock = overlay.slice(
    cancelStart,
    renderStart,
  );
  forbidContains(
    cancelBlock,
    overlayPath,
    [
      'dispatchWriterCommand',
      'dispatchDurableWriterUiCommand',
      'buildWriterTableDragResizeCommand',
    ],
  );
}

const helperPath =
  'src/core/writer-v2/table-pro/writerTableDragResize.ts';
const helper = read(helperPath);
requireContains(helper, helperPath, [
  'buildWriterTableDragResizeCommand',
  'computeResizedColumnWidths',
  'buildResizeTableColumnCommand',
  'buildResizeTableRowCommand',
  "'Writer table resize target is unavailable.'",
]);

const testPath =
  'src/core/writer-v2/table-pro/writerTableDragResize.test.ts';
const tests = read(testPath);
requireContains(tests, testPath, [
  'builds one final column update from captured widths and pointer-up position',
  'builds one final row update from captured height and pointer-up position',
  'returns no command when the table target disappears before commit',
  "width: 130",
  "height: 60",
]);

const inheritedPath =
  'scripts/phase8-history-writer-ui-one-shot-audit.mjs';
const inherited = read(inheritedPath);
forbidContains(inherited, inheritedPath, [
  "'src/components/writer-v2/WriterTableInteractionOverlay.tsx',",
]);
requireContains(inherited, inheritedPath, [
  "'src/components/writer-v2/WriterV2Inspector.tsx'",
  "'src/components/writer-v2/WriterTablePropertiesPanel.tsx'",
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-table-drag] table drag resize coalescing guards passed',
);
