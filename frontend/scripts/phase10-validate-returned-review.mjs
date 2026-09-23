#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

const inputArg = process.argv[2];
const reportArg = process.argv[3];

if (!inputArg) {
  console.error(
    'Usage: node scripts/phase10-validate-returned-review.mjs <returned-review.pdf> [report.json]',
  );
  process.exit(2);
}

const inputPath = path.resolve(process.cwd(), inputArg);
const reportPath = reportArg
  ? path.resolve(process.cwd(), reportArg)
  : `${inputPath}.phase10-return-evidence.json`;

if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
  console.error(`INVALID INPUT: returned review PDF does not exist: ${inputPath}`);
  process.exit(2);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = spawnSync(
  pnpm,
  [
    'exec',
    'vitest',
    'run',
    'src/core/pdf-annotations/viewerReturnedReviewProbe.test.ts',
    '--pool=forks',
    '--maxWorkers=1',
  ],
  {
    cwd: frontendRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    env: {
      ...process.env,
      PHASE10_RETURN_PROBE_MODE: '1',
      PHASE10_RETURNED_REVIEW_PDF: inputPath,
      PHASE10_RETURN_REPORT_PATH: reportPath,
    },
  },
);

if (run.error) {
  console.error(`RETURN PROBE ERROR: ${run.error.message}`);
  process.exit(2);
}

if (run.status !== 0) {
  console.error('RETURN SEMANTICS NOT QUALIFIED');
  process.exit(run.status ?? 1);
}

if (!fs.existsSync(reportPath)) {
  console.error('RETURN PROBE ERROR: test passed without producing the evidence report');
  process.exit(2);
}

console.log('RETURN SEMANTICS QUALIFIED');
console.log(`Evidence report: ${reportPath}`);
