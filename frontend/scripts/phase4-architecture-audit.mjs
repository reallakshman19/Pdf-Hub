import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

const retiredPaths = [
  'src/core/commands/store.ts',
  'src/core/commands/registry.ts',
  'src/core/commands/history.ts',
  'src/core/commands/preview.ts',
  'src/components/commands/HistoryPanel.tsx',
  'src/components/commands/CommandPreviewModal.tsx',
];

for (const retired of retiredPaths) {
  if (exists(retired)) fail(`retired Phase 4 path returned: ${retired}`);
}

const annotationStore = read('src/core/annotations/store.ts');
for (const token of [
  'history: PdfAnnotation[][]',
  'future: PdfAnnotation[][]',
  'undo: () =>',
  'redo: () =>',
  'reviewStatus: status',
]) {
  if (annotationStore.includes(token)) {
    fail(`annotation store contains retired/local history or legacy review token: ${token}`);
  }
}
for (const required of [
  'recordStateTransaction',
  "'ANNOTATION_CHANGE'",
  'withAnnotationReviewStatus',
  'normalizeAnnotationReviews',
]) {
  if (!annotationStore.includes(required)) {
    fail(`annotation store missing canonical behavior: ${required}`);
  }
}

const writerStore = read('src/core/writer-v2/writerV2Store.ts');
for (const required of [
  "'WRITER_CHANGE'",
  "'writer-store'",
  "documentMeta?.mode === 'pdfOverlay'",
  'nextStore.undoStack = []',
  'nextStore.redoStack = []',
]) {
  if (!writerStore.includes(required)) {
    fail(`Writer store missing Phase 4 global-history behavior: ${required}`);
  }
}

const canonicalHistorySurfaces = [
  'src/components/shell/TopNav.tsx',
  'src/components/toolbar/ToolbarComment.tsx',
  'src/components/toolbar/ToolbarWriter.tsx',
  'src/hooks/useKeyboardShortcuts.ts',
];
for (const surface of canonicalHistorySurfaces) {
  const source = read(surface);
  if (!source.includes('applyUndo') || !source.includes('applyRedo')) {
    fail(`${surface} does not route undo/redo through canonical document history`);
  }
  if (/state\.(history|future|undo|redo)\b/.test(source)) {
    fail(`${surface} still reads annotation-local history fields`);
  }
}

const writerKeyboard = read('src/components/writer-v2/WriterKeyboardHandler.tsx');
if (!writerKeyboard.includes("documentMeta?.mode !== 'blankDocument'")) {
  fail('WriterKeyboardHandler must reserve local undo/redo for blank documents only');
}

const macroRunner = read('src/core/macro/sessionRunner.ts');
if (!macroRunner.includes('commandBus.execute')) {
  fail('macro session commits must execute through CommandBus');
}

const srcRoot = path.join(root, 'src');
for (const absolutePath of walk(srcRoot)) {
  const relative = path.relative(root, absolutePath).replaceAll(path.sep, '/');
  if (
    relative.includes('/__tests__/')
    || /\.test\.[cm]?[jt]sx?$/.test(relative)
    || relative === 'src/core/commands/bus.ts'
    || relative === 'src/core/commands/dispatch.ts'
  ) {
    continue;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  if (
    source.includes("from '@/core/commands/dispatch'")
    || source.includes('from "../commands/dispatch"')
    || source.includes("from '../commands/dispatch'")
  ) {
    fail(`product code bypasses CommandBus by importing dispatch directly: ${relative}`);
  }
}

const commandBus = read('src/core/commands/bus.ts');
if (!commandBus.includes('dispatchCommand')) {
  fail('CommandBus must remain the controlled bridge to the dispatcher');
}

if (failures.length > 0) {
  console.error('Phase 4 architecture audit FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 4 architecture audit passed.');
