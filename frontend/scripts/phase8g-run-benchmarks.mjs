import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const nodeObservation =
  process.env.PHASE8G_NODE_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-observation.json';
const nodeReport =
  process.env.PHASE8G_NODE_REPORT_PATH
  ?? 'performance/results/phase8g-node-report.json';
const browserObservation =
  process.env.PHASE8G_BROWSER_OBSERVATION_PATH
  ?? 'performance/results/phase8g-browser-observation.json';
const browserReport =
  process.env.PHASE8G_BROWSER_REPORT_PATH
  ?? 'performance/results/phase8g-browser-report.json';

function run(args, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (
  process.env.PHASE8G_SKIP_GENERATE
  !== '1'
) {
  const args = [
    'scripts/phase8g-generate-fixtures.mjs',
  ];
  if (process.env.PHASE8G_KINDS) {
    args.push(
      '--kinds='
      + process.env.PHASE8G_KINDS,
    );
  }
  if (process.env.PHASE8G_PAGES) {
    args.push(
      '--pages='
      + process.env.PHASE8G_PAGES,
    );
  }
  run(args);
}

if (
  process.env.PHASE8G_SKIP_NODE
  !== '1'
) {
  run([
    path.join(
      'node_modules',
      'vitest',
      'vitest.mjs',
    ),
    'run',
    'src/performance/phase8gBenchmark.test.ts',
    '--pool=forks',
    '--maxWorkers=1',
  ], {
    PHASE8G_BENCHMARK: '1',
    PHASE8G_OBSERVATION_PATH:
      nodeObservation,
  });

  run([
    'scripts/phase8g-benchmark-harness.mjs',
    '--input=' + nodeObservation,
    '--out=' + nodeReport,
  ]);
}

if (
  process.env.PHASE8G_SKIP_BROWSER
  !== '1'
) {
  run([
    path.join(
      'node_modules',
      '@playwright',
      'test',
      'cli.js',
    ),
    'test',
    'e2e/phase8g-browser-performance.spec.ts',
    '--project=chromium',
  ], {
    PHASE8G_BROWSER_BENCHMARK:
      '1',
    PHASE8G_BROWSER_OBSERVATION_PATH:
      browserObservation,
  });

  run([
    'scripts/phase8g-benchmark-harness.mjs',
    '--input='
      + browserObservation,
    '--out='
      + browserReport,
  ]);
}

console.log(
  '[phase8g-benchmark] node='
  + nodeReport
  + ' browser='
  + browserReport,
);
