import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/phase3b2-lockfile.json',
  JSON.stringify(
    {
      encoding: 'base64',
      content: readFileSync('../pnpm-lock.yaml').toString('base64'),
    },
    null,
    2,
  ),
  'utf8',
);
