import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'writer-overlay-v2-certification-report.json');

const commands = [
  {
    name: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
  },
  {
    name: 'writer-v2-focused-tests',
    command: executable('vitest'),
    args: [
      'run',
      'src/core/writer-v2/coordinateTransform.test.ts',
      'src/core/writer-v2/writerCommandStore.test.ts',
      'src/core/writer-v2/persistence/documentFingerprint.test.ts',
      'src/core/writer-v2/persistence/indexedDbWriterStore.test.ts',
      'src/core/writer-v2/editor/writerEditorState.test.ts',
      'src/core/writer-v2/writerElementFactory.test.ts',
      'src/components/writer-v2/WriterOverlayLayer.test.tsx',
      'src/components/writer-v2/WriterPopupEditor.test.tsx',
      'src/components/writer-v2/WriterCalloutElement.test.tsx',
      'src/core/tool-policy/disabledTools.test.ts',
      'src/core/writer-v2/clipboard/sanitizeClipboardHtml.test.ts',
      'src/core/writer-v2/clipboard/tableImport.test.ts',
      'src/core/writer-v2/clipboard/importClipboardData.test.ts',
      'src/components/writer-v2/WriterClipboardPlugin.test.tsx',
      'src/core/writer-v2/writerV2Store.test.ts',
      'src/core/writer-v2/persistence/writerPersistenceController.test.ts',
      'src/core/writer-v2/export/flattenedPdfExport.test.ts',
      'src/core/writer-v2/export/exportCurrentWriterPdf.test.ts',
      'src/core/writer-v2/export/projectZip.test.ts',
      'src/core/writer-v2/export/projectImportController.test.ts',
      'src/core/writer-v2/export/exportCurrentWriterProject.test.ts',
      'src/core/writer-v2/writerPlacement.test.ts',
      'src/core/writer-v2/export/downloadWriterFile.test.ts',
      'src/components/writer-v2/WriterV2ToolbarControls.test.tsx',
    ],
  },
  {
    name: 'boundary-audit',
    command: 'node',
    args: ['scripts/writer-v2-boundary-audit.mjs'],
  },
  {
    name: 'full-vitest-suite',
    command: 'npm',
    args: ['run', 'test'],
  },
  {
    name: 'build',
    command: 'npm',
    args: ['run', 'build'],
  },
];

fs.mkdirSync(reportDir, { recursive: true });

const startedAt = new Date().toISOString();
const results = [];
let failed = false;

for (const item of commands) {
  console.log(`\n=== ${item.name} ===`);
  console.log(`$ ${item.command} ${item.args.join(' ')}`);

  const result = spawnSync(item.command, item.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
    },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const passed = result.status === 0;

  process.stdout.write(stdout);

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }

  results.push({
    name: item.name,
    command: `${item.command} ${item.args.join(' ')}`,
    statusCode: result.status,
    passed,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  });

  if (!passed) {
    failed = true;
    console.error(`[FAIL] ${item.name}`);
    break;
  }

  console.log(`[PASS] ${item.name}`);
}

const report = {
  name: 'Writer Overlay V2 Certification',
  wave: 'Wave 10 — W10',
  gates: {
    coordinateEngine: 'PASS_REQUIRED',
    commandStore: 'PASS_REQUIRED',
    persistenceAdapter: 'PASS_REQUIRED',
    documentFingerprint: 'PASS_REQUIRED',
    overlayRender: 'PASS_REQUIRED',
    selectionMoveResizeShell: 'PASS_REQUIRED',
    richEditorShell: 'PASS_REQUIRED',
    editorSaveCancel: 'PASS_REQUIRED',
    editorSerialization: 'PASS_REQUIRED',
    writerElementFactory: 'PASS_REQUIRED',
    calloutVariantRender: 'PASS_REQUIRED',
    clipboardHtmlSanitizer: 'PASS_REQUIRED',
    clipboardRichTextPaste: 'PASS_REQUIRED',
    clipboardImageAssetCapture: 'PASS_REQUIRED',
    clipboardTableDetection: 'PASS_REQUIRED',
    persistenceIntegration: 'PASS_REQUIRED',
    sameBrowserReload: 'PASS_REQUIRED',
    imageAssetPersistence: 'PASS_REQUIRED',
    flattenedPdfExport: 'PASS_REQUIRED',
    flattenedCalloutExport: 'PASS_REQUIRED',
    flattenedImageAssetExport: 'PASS_REQUIRED',
    projectZipExport: 'PASS_REQUIRED',
    projectZipImport: 'PASS_REQUIRED',
    freshBrowserProjectRestore: 'PASS_REQUIRED',
    writerV2Toolbar: 'PASS_REQUIRED',
    writerV2Placement: 'PASS_REQUIRED',
    writerV2ExportButtons: 'PASS_REQUIRED',
  },
  startedAt,
  finishedAt: new Date().toISOString(),
  finalVerdict: failed ? 'FAIL' : 'PASS',
  results,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nCertification report written to ${normalize(path.relative(root, reportPath))}`);
console.log(`Final verdict: ${report.finalVerdict}`);

if (failed) {
  process.exit(1);
}

function executable(binName) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(root, 'node_modules', '.bin', `${binName}${suffix}`);
}

function tail(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-80);
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}
