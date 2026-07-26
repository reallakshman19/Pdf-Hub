import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const files = {
  lockfile: '../pnpm-lock.yaml',
  packageJson: 'package.json',
  boundedExtractionTest: 'src/core/admission/zip/zipBoundedExtraction.test.ts',
};

mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/phase3b2-cleanup-inputs.json',
  JSON.stringify(
    Object.fromEntries(
      Object.entries(files).map(([name, path]) => [
        name,
        {
          encoding: 'base64',
          content: readFileSync(path).toString('base64'),
        },
      ]),
    ),
    null,
    2,
  ),
  'utf8',
);
