import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  ['exec', 'tsc', '-b', '--pretty', 'false'],
  { encoding: 'utf8' },
);

mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/phase3b2-typecheck.json',
  JSON.stringify(
    {
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message ?? null,
    },
    null,
    2,
  ),
  'utf8',
);

process.exit(0);
