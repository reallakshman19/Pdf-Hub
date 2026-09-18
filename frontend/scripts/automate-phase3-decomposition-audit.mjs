import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function requireMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${file}: missing required marker: ${marker}`);
    }
  }
}

function forbidMarkers(file, markers) {
  const content = read(file);
  for (const marker of markers) {
    if (content.includes(marker)) {
      failures.push(`${file}: retired responsibility returned: ${marker}`);
    }
  }
}

function forbidFile(file) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`${file}: retired compatibility file still exists`);
  }
}

for (const file of [
  'src/components/sidebar/MacrosSidebar.tsx',
  'src/components/sidebar/MacrosSidebar.generateDocument.test.tsx',
  'src/components/macro/advanced/MacroExpertWorkspace.tsx',
  'src/components/macro/advanced/MacroExpertWorkspace.test.tsx',
  'src/components/macro/advanced/MacroPresetExecutionPanel.tsx',
  'src/components/macro/advanced/MacroPresetExecutionPanel.test.tsx',
  'src/components/macro/advanced/MacroPresetParameters.tsx',
  'src/components/macro/advanced/MacroPresetParameters.test.tsx',
  'src/core/macro/presetOverrides.ts',
  'src/core/macro/presetOverrides.test.ts',
]) {
  forbidFile(file);
}

requireMarkers('src/components/sidebar/AutomateSidebar.tsx', [
  'Quick Actions',
  'My Workflows',
  'Build',
  'Generate Document',
  'MacroGenerateDocumentPanel',
  'MacroOutputQueue',
  'Specialized workflows',
  'setMacroBuilderSource',
]);

forbidMarkers('src/components/sidebar/AutomateSidebar.tsx', [
  'Advanced macro tools',
  'MacrosSidebar',
  'MacroExpertWorkspace',
  'MacroPresetExecutionPanel',
  'MacroPresetParameters',
  'Expert JSON Builder',
]);

requireMarkers('src/components/macro/advanced/MacroGenerateDocumentPanel.tsx', [
  'Generate Document',
  'GENERATION_TEMPLATES',
  'buildGenerationRecipe',
  'dryRun: false',
  'onBusyChange',
  'onOutputsProduced',
]);

requireMarkers('src/components/macro/advanced/MacroOutputQueue.tsx', [
  'Output Queue',
  'FileAdapter.savePdfBytes',
  'Save All',
]);

requireMarkers('src/core/macro/recipes/builtInRecipes.ts', [
  "'header-file-name-selected'",
  "'file-date-page-footer-selected'",
  "'review-copy-selected'",
  "'review-pack-header-footer'",
  "'insert-blank-after-current'",
]);

if (failures.length > 0) {
  console.error('\nAutomate Phase 3 retirement audit failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Automate Phase 3 retirement audit passed.');
