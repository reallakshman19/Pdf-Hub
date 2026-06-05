import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const startedAt = new Date().toISOString();

const requiredFiles = [
  'src/core/writer-v2/table-pro/writerTableSelection.ts',
  'src/core/writer-v2/table-pro/writerTableStyleActions.ts',
  'src/core/writer-v2/table-pro/writerTableStructureActions.ts',
  'src/core/writer-v2/table-pro/writerTableCommandBridge.ts',
  'src/core/writer-v2/table-pro/writerTableGeometry.ts',
  'src/core/writer-v2/table-pro/writerTableVisualStyles.ts',
  'src/components/writer-v2/WriterTablePropertiesPanel.tsx',
  'src/components/writer-v2/WriterTableBoxContent.tsx',
  'src/core/writer-v2/table-pro/writerTablePro.certification.test.ts',
];

const checks = [
  {
    name: 'required-files',
    type: 'static',
    run: () => {
      const missing = requiredFiles.filter((file) =>
        !existsSync(join(process.cwd(), file)),
      );

      return {
        status: missing.length === 0 ? 'pass' : 'fail',
        details: {
          required: requiredFiles.length,
          missing,
        },
      };
    },
  },
  {
    name: 'table-style-actions',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTableStyleActions.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-structure-actions',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTableStructureActions.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-command-bridge',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTableCommandBridge.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-geometry',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTableGeometry.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-visual-styles',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTableVisualStyles.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-docx-xml',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/export/docx/renderTableBlock.pro.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-flattened-pdf',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/export/flattenedPdfExport.tablePro.test.ts',
      'src/core/writer-v2/export/flattenedPdfExport.tableProMerged.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
  {
    name: 'table-pro-end-to-end',
    type: 'command',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/table-pro/writerTablePro.certification.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
];

const results = [];

for (const check of checks) {
  if (check.type === 'static') {
    const result = check.run();

    results.push({
      name: check.name,
      type: check.type,
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
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  });
}

const failed = results.filter((result) => result.status !== 'pass');
const status = failed.length === 0 ? 'pass' : 'fail';

const report = {
  certification: 'writer-table-pro',
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  summary: {
    checks: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    failed: failed.length,
  },
  assertions: {
    requiredFilesExist: statusFor('required-files'),
    cellStyleActions: statusFor('table-style-actions'),
    structuralActions: statusFor('table-structure-actions'),
    commandBridge: statusFor('table-command-bridge'),
    geometryHitTesting: statusFor('table-geometry'),
    visualModel: statusFor('table-visual-styles'),
    docxXml: statusFor('table-docx-xml'),
    flattenedPdf: statusFor('table-flattened-pdf'),
    endToEnd: statusFor('table-pro-end-to-end'),
  },
  results,
};

const artifactDir = join(process.cwd(), 'artifacts');
mkdirSync(artifactDir, { recursive: true });

const reportPath = join(artifactDir, 'writer-table-pro-certification.json');
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
