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
      failures.push(`${file}: embedded responsibility remains: ${marker}`);
    }
  }
}

requireMarkers('src/components/sidebar/MacrosSidebar.tsx', [
  '<MacroExpertWorkspace',
  '<MacroOutputQueue',
  '<MacroPresetExecutionPanel',
  '<MacroPresetParameters',
  '<MacroGenerateDocumentPanel',
  'onOutputsProduced',
]);

forbidMarkers('src/components/sidebar/MacrosSidebar.tsx', [
  'Expert JSON Builder',
  'expertRecipeJson',
  'expertAbortControllerRef',
  'parseExpertRecipe',
  'runExpertRecipe',
  'runExpertDryRun',
  'saveExpertPreset',
  'const saveOutput =',
  'const saveAllOutputs =',
  'validateRecipeBeforeRun',
  'runAbortControllerRef',
  'runSelectedMacro',
  'preflightReport',
  'GENERATION_TEMPLATES',
  'buildGenerationRecipe',
  'brandImageDataUrl',
  'selectedGenerationId',
  'generationLogs',
  'generationError',
  'headerFooterOpacity',
  'Target pages',
  'function createDefaultOverrides',
  'function applyOverridesToRecipe',
  "from '@/adapters/file/FileAdapter'",
]);

requireMarkers('src/components/macro/advanced/MacroExpertWorkspace.tsx', [
  'Expert workflow source',
  'Validate + Dry Run',
  'Run Expert',
  'analyzeMacroWorkflowRisk',
  'lastTestedSignature',
  'dryRun: true',
  'dryRun: false',
  'onOutputsProduced',
]);

requireMarkers('src/components/macro/advanced/MacroOutputQueue.tsx', [
  'Output Queue',
  'FileAdapter.savePdfBytes',
  'Save All',
  'onError',
]);

requireMarkers('src/components/macro/advanced/MacroPresetExecutionPanel.tsx', [
  'Test and run',
  'Test Run',
  'analyzeMacroWorkflowRisk',
  'lastTestedSignature',
  'dryRun: true',
  'dryRun: false',
  'onOutputsProduced',
]);

requireMarkers('src/components/macro/advanced/MacroPresetParameters.tsx', [
  'Parameters',
  'Target pages',
  'Reset Parameters',
  'Header/Footer opacity',
  'Blank page count',
]);

requireMarkers('src/core/macro/presetOverrides.ts', [
  'export interface RecipeOverrides',
  'export function createDefaultOverrides',
  'export function applyOverridesToRecipe',
  'headerFooterOpacity',
  'toPageSelector',
]);

requireMarkers('src/components/macro/advanced/MacroGenerateDocumentPanel.tsx', [
  'Generate Document',
  'GENERATION_TEMPLATES',
  'buildGenerationRecipe',
  'dryRun: false',
  'onBusyChange',
  'onOutputsProduced',
]);

const sidebarSize = Buffer.byteLength(
  read('src/components/sidebar/MacrosSidebar.tsx'),
  'utf8',
);

if (sidebarSize >= 10_000) {
  failures.push(
    `src/components/sidebar/MacrosSidebar.tsx: expected composer below 10 KB, found ${sidebarSize} bytes`,
  );
}

if (failures.length > 0) {
  console.error('\nAutomate Phase 3 decomposition audit failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Automate Phase 3 decomposition audit passed. MacrosSidebar is ${sidebarSize} bytes.`,
);
