import { spawnSync } from 'node:child_process';

const testFiles = [
  'src/core/macro/generateDocument/generationRecipes.test.ts',
  'src/core/macro/generateDocument/templateLibraryValidation.test.ts',
  'src/core/macro/generateDocument/buildGenerationRecipe.test.ts',
  'src/core/macro/generateDocument/generateDocumentOutputName.test.ts',
  'src/core/macro/generateDocument/generateDocumentCertification.test.ts',
  'src/components/sidebar/MacrosSidebar.generateDocument.test.tsx',
];

console.log('GD-2B Generate Document Certification');
console.log('Checks:');
for (const file of testFiles) {
  console.log(`- ${file}`);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', ...testFiles],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
