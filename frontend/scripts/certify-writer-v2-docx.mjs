import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const startedAt = new Date().toISOString();

const checks = [
  {
    name: 'writer-v2-docx-integration',
    command: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/writer-v2/export/docx/writerDocxExporter.integration.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
    ],
  },
];

const results = [];

for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  results.push({
    name: check.name,
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
  certification: 'writer-v2-docx',
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: results,
  assertions: {
    docxZipIntegrity: statusForCheck('writer-v2-docx-integration'),
    contentTypesXmlExists: statusForCheck('writer-v2-docx-integration'),
    documentXmlExists: statusForCheck('writer-v2-docx-integration'),
    stylesXmlExists: statusForCheck('writer-v2-docx-integration'),
    imageRelationshipsExist: statusForCheck('writer-v2-docx-integration'),
    imageMediaExists: statusForCheck('writer-v2-docx-integration'),
    paragraphTextExists: statusForCheck('writer-v2-docx-integration'),
    tableXmlExists: statusForCheck('writer-v2-docx-integration'),
    imageDrawingXmlExists: statusForCheck('writer-v2-docx-integration'),
    pageBreakXmlExists: statusForCheck('writer-v2-docx-integration'),
    noObjectObjectLeak: statusForCheck('writer-v2-docx-integration'),
    noMojibake: statusForCheck('writer-v2-docx-integration'),
    noUnescapedXmlCorruption: statusForCheck('writer-v2-docx-integration'),
  },
};

const artifactDir = join(process.cwd(), 'artifacts');
mkdirSync(artifactDir, { recursive: true });

const reportPath = join(artifactDir, 'writer-v2-docx-certification.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));

if (status !== 'pass') {
  process.exit(1);
}

function statusForCheck(name) {
  const result = results.find((item) => item.name === name);
  return result?.status ?? 'fail';
}

function tail(value, maxLines = 80) {
  if (!value) return '';
  return value
    .split(/\r?\n/)
    .slice(-maxLines)
    .join('\n');
}
