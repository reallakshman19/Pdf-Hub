import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'writer-overlay-v2-final-certification.json');

const commands = [
  {
    name: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
  },
  {
    name: 'final-smoke-focused-test',
    command: executable('vitest'),
    args: [
      'run',
      'src/core/writer-v2/finalSmoke/writerOverlayV2FinalSmoke.test.ts',
    ],
  },
  {
    name: 'disabled-tools-audit',
    command: 'node',
    args: ['scripts/writer-v2-disabled-tools-audit.mjs'],
  },
  {
    name: 'writer-overlay-v2-certification',
    command: 'npm',
    args: ['run', 'certify:writer-overlay-v2'],
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
  name: 'Writer Overlay V2 Final Certification',
  wave: 'Wave 12 — Final Smoke Proof',
  finalVerdict: failed ? 'FAIL' : 'PASS',
  gates: {
    createSamplePdf: 'PASS_REQUIRED',
    createWriterTextBox: 'PASS_REQUIRED',
    editAndSaveWriterTextBox: 'PASS_REQUIRED',
    createTextCallout: 'PASS_REQUIRED',
    exportFlattenedPdf: 'PASS_REQUIRED',
    exportEditableProjectZip: 'PASS_REQUIRED',
    importEditableProjectZip: 'PASS_REQUIRED',
    freshStoreRestoreEditableObjects: 'PASS_REQUIRED',
    disabledOldAnnotationToolsAudit: 'PASS_REQUIRED',
    fullVitestSuite: 'PASS_REQUIRED',
    build: 'PASS_REQUIRED',
  },
  startedAt,
  finishedAt: new Date().toISOString(),
  results,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nFinal certification report written to ${normalize(path.relative(root, reportPath))}`);
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