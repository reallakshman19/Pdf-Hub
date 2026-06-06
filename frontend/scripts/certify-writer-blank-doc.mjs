import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const startedAt = new Date().toISOString();

const requiredFiles = [
  'src/core/writer-v2/writerDocumentMode.ts',
  'src/core/writer-v2/writerBlankDocumentLayout.ts',
  'src/core/writer-v2/writerDocumentTitle.ts',
  'src/core/writer-v2/writerImageAsset.ts',
  'src/core/writer-v2/export/exportLiveBlankWriterDocx.ts',
  'src/components/writer-v2/WriterBlankDocumentCanvas.tsx',
  'src/components/writer-v2/WriterBlankPageCanvas.tsx',
  'src/components/writer-v2/BlankDocumentCreateDialog.tsx',
  'src/components/writer-v2/BlankDocumentPageSetupDialog.tsx',
  'src/components/writer-v2/BlankDocumentRenameDialog.tsx',
  'src/components/writer-v2/WriterBlankImageInsertButton.tsx',
  'src/components/writer-v2/WriterSelectionQuickActions.tsx',
  'src/components/writer-v2/WriterSelectionHandles.tsx',
];

const testGroups = [
  {
    name: 'document-model',
    assertions: [
      'blankDocumentMeta',
      'pageSetupModel',
      'pageOperations',
      'documentTitle',
      'imageAssetCreation',
    ],
    files: [
      'src/core/writer-v2/__tests__/writerDocumentMode.test.ts',
      'src/core/writer-v2/__tests__/writerDocumentTitle.test.ts',
      'src/core/writer-v2/__tests__/writerImageAsset.test.ts',
      'src/core/writer-v2/__tests__/writerV2StoreBlankDocument.test.ts',
      'src/core/writer-v2/__tests__/writerBlankDocumentLayout.test.ts',
    ],
  },
  {
    name: 'blank-document-ui',
    assertions: [
      'blankCanvasRender',
      'pageControls',
      'createDialog',
      'pageSetupDialog',
      'renameDialog',
      'imageInsertButton',
      'imageElementRender',
      'selectionQuickActions',
      'resizeHandles',
      'elementResize',
    ],
    files: [
      'src/components/writer-v2/__tests__/WriterBlankPageCanvas.test.tsx',
      'src/components/writer-v2/__tests__/BlankDocumentCreateDialog.test.tsx',
      'src/components/writer-v2/__tests__/BlankDocumentPageSetupDialog.test.tsx',
      'src/components/writer-v2/__tests__/WriterBlankDocumentPageSetupFlow.test.tsx',
      'src/components/writer-v2/__tests__/BlankDocumentRenameDialog.test.tsx',
      'src/components/writer-v2/__tests__/WriterBlankDocumentRenameFlow.test.tsx',
      'src/components/writer-v2/__tests__/WriterBlankImageInsertButton.test.tsx',
      'src/components/writer-v2/__tests__/WriterRichElementBoxImage.test.tsx',
      'src/components/writer-v2/__tests__/WriterSelectionQuickActions.test.tsx',
      'src/components/writer-v2/__tests__/WriterSelectionHandles.test.tsx',
      'src/components/writer-v2/__tests__/WriterElementBoxResize.test.tsx',
      'src/components/writer-v2/WriterV2ToolbarControls.test.tsx',
    ],
  },
  {
    name: 'project-roundtrip',
    assertions: [
      'projectZipExport',
      'projectZipImport',
      'blankMetadataRoundtrip',
      'assetRoundtrip',
    ],
    files: [
      'src/core/writer-v2/export/exportCurrentWriterProject.test.ts',
      'src/core/writer-v2/export/projectImportController.test.ts',
      'src/core/writer-v2/export/projectZip.test.ts',
    ],
  },
  {
    name: 'blank-export',
    assertions: [
      'blankPdfExport',
      'blankDocxExport',
      'imagePdfExport',
      'imageDocxExport',
      'tablePdfExport',
      'tableDocxExport',
      'noMojibake',
      'noObjectObjectLeak',
    ],
    files: [
      'src/core/writer-v2/export/__tests__/writerBlankDocumentExport.test.ts',
      'src/core/writer-v2/export/__tests__/writerImageExport.test.ts',
      'src/core/writer-v2/export/__tests__/writerTableExport.test.ts',
    ],
  },
];

const checks = [
  {
    name: 'required-files',
    type: 'static',
    assertions: ['requiredFilesExist'],
    run: () => {
      const missing = requiredFiles.filter((file) => !existsSync(join(process.cwd(), file)));

      return {
        status: missing.length === 0 ? 'pass' : 'fail',
        details: {
          required: requiredFiles.length,
          missing,
        },
      };
    },
  },
  ...testGroups.map((group) => ({
    name: group.name,
    type: 'command',
    assertions: group.assertions,
    command: 'npx',
    args: [
      'vitest',
      'run',
      ...group.files,
      '--pool=forks',
      '--maxWorkers=1',
    ],
  })),
];

const results = [];

for (const check of checks) {
  if (check.type === 'static') {
    const result = check.run();

    results.push({
      name: check.name,
      type: check.type,
      assertions: check.assertions,
      status: result.status,
      details: result.details,
    });

    continue;
  }

  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  results.push({
    name: check.name,
    type: check.type,
    assertions: check.assertions,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  });
}

const failed = results.filter((result) => result.status !== 'pass');
const status = failed.length === 0 ? 'pass' : 'fail';

const assertionStatuses = Object.fromEntries(
  checks.flatMap((check) => check.assertions.map((assertion) => [assertion, statusFor(check.name)])),
);

const report = {
  certification: 'writer-blank-doc',
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  summary: {
    checks: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    failed: failed.length,
  },
  assertions: assertionStatuses,
  results,
};

const artifactDir = join(process.cwd(), 'artifacts');
mkdirSync(artifactDir, { recursive: true });

const reportPath = join(artifactDir, 'writer-blank-doc-certification.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));

if (status !== 'pass') {
  process.exit(1);
}

function statusFor(name) {
  return results.find((result) => result.name === name)?.status ?? 'fail';
}

function tail(value, maxLines = 80) {
  if (!value) return '';

  return value
    .split(/\r?\n/)
    .slice(-maxLines)
    .join('\n');
}
