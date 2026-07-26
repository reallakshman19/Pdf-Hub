import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const typecheck = spawnSync('pnpm', ['exec', 'tsc', '-b', '--pretty', 'false'], {
  encoding: 'utf8',
});
const tests = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    'src/core/admission/zip/zipResourcePolicy.test.ts',
    'src/core/admission/zip/zipDeclaredResourceAdmission.test.ts',
    'src/core/admission/zip/zipBoundedExtraction.test.ts',
    'src/core/admission/zip/zipMemberSet.test.ts',
    'src/core/writer-v2/export/projectImportResourceAdmission.test.ts',
    'src/core/writer-v2/export/projectImportStructuralAdmission.test.ts',
    'src/core/writer-v2/export/projectImportController.test.ts',
    'src/core/writer-v2/export/projectZip.test.ts',
    'src/core/ocr/__tests__/ocrProjectCodec.test.ts',
    '--pool=forks',
    '--maxWorkers=1',
  ],
  { encoding: 'utf8' },
);

mkdirSync('artifacts', { recursive: true });
for (const [name, result] of [
  ['phase3b2-typecheck.json', typecheck],
  ['phase3b2-focused-tests.json', tests],
]) {
  writeFileSync(
    `artifacts/${name}`,
    JSON.stringify({
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message ?? null,
    }, null, 2),
    'utf8',
  );
}
