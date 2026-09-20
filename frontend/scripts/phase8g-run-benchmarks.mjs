import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const observation =
  process.env.PHASE8G_OBSERVATION_PATH
  ?? 'performance/results/phase8g-observation.json';
const report =
  process.env.PHASE8G_REPORT_PATH
  ?? 'performance/results/phase8g-report.json';

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
    observation,
});

run([
  'scripts/phase8g-benchmark-harness.mjs',
  '--input=' + observation,
  '--out=' + report,
]);

console.log(
  '[phase8g-benchmark] observation='
  + observation
  + ' report='
  + report,
);
