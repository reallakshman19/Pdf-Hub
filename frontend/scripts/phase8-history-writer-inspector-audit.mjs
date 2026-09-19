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
    `[phase8-history-writer-inspector] ${message}`,
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

const inspectorPath =
  'src/components/writer-v2/WriterV2Inspector.tsx';
const inspector = read(inspectorPath);

requireContains(inspector, inspectorPath, [
  'inspectorCommitTailRef',
  'queueInspectorPatch',
  'dispatchDurableWriterUiCommand(',
  'useWriterV2Store\n                .getState()\n                .elements',
  'function DraftNumberInput',
  'function DraftOpacityInput',
  'function DraftColorPicker',
  'resetKey={selected.id}',
  "type: 'CLEAR_WRITER_SELECTION'",
  "'WriterV2Inspector style'",
  "'WriterV2Inspector transform'",
  "'WriterV2Inspector callout'",
]);

forbidContains(inspector, inspectorPath, [
  "dispatchWriterCommand({\n      type: 'UPDATE_WRITER_ELEMENT'",
  "dispatchWriterCommand({\n        type: 'UPDATE_WRITER_ELEMENT'",
  '<NumberInput',
]);

const queueStart = inspector.indexOf(
  'const queueInspectorPatch',
);
const selectedStart = inspector.indexOf(
  'const selected =',
  queueStart,
);
const queueBlock = inspector.slice(
  queueStart,
  selectedStart,
);
requireContains(queueBlock, inspectorPath, [
  'inspectorCommitTailRef.current.then(',
  'useWriterV2Store',
  '.getState()',
  '.elements',
  'patch: buildPatch(element)',
  'inspectorCommitTailRef.current =',
  'run.then(',
]);

const numberStart = inspector.indexOf(
  'function DraftNumberInput',
);
const opacityStart = inspector.indexOf(
  'function DraftOpacityInput',
);
const colorStart = inspector.indexOf(
  'function DraftColorPicker',
);
const componentStart = inspector.indexOf(
  'export const WriterV2Inspector',
);
if (
  numberStart < 0
  || opacityStart < 0
  || colorStart < 0
  || componentStart < 0
) {
  fail('Inspector draft component boundaries are missing.');
} else {
  const numberBlock = inspector.slice(
    numberStart,
    opacityStart,
  );
  requireContains(numberBlock, inspectorPath, [
    'onBlur={commit}',
    "event.key === 'Enter'",
    "event.key === 'Escape'",
    'cancelBlurRef.current = true',
  ]);

  const opacityBlock = inspector.slice(
    opacityStart,
    colorStart,
  );
  requireContains(opacityBlock, inspectorPath, [
    'onPointerUp={commit}',
    'onKeyUp={(event) =>',
    'lastCommittedRef',
    'onBlur={commit}',
  ]);

  const colorBlock = inspector.slice(
    colorStart,
    componentStart,
  );
  requireContains(colorBlock, inspectorPath, [
    'window.setTimeout(',
    'window.clearTimeout(',
    '250,',
    'onChange={scheduleCommit}',
  ]);
}

const testPath =
  'src/components/writer-v2/WriterV2Inspector.test.tsx';
const tests = read(testPath);
requireContains(tests, testPath, [
  'keeps transform edits local until blur, then commits them',
  'serializes rapid transform commits against latest canonical Writer state',
  'cancels a numeric draft on Escape without mutating Writer state',
  "target: { value: '42' }",
  "x: 30",
  "y: 55",
]);

const inheritedPath =
  'scripts/phase8-history-writer-ui-one-shot-audit.mjs';
const inherited = read(inheritedPath);
forbidContains(inherited, inheritedPath, [
  "'src/components/writer-v2/WriterV2Inspector.tsx',",
]);
requireContains(inherited, inheritedPath, [
  "'src/components/writer-v2/WriterTablePropertiesPanel.tsx'",
]);

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-inspector] Writer Inspector coalescing guards passed',
);
