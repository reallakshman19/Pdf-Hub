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

const sidebarSize = Buffer.byteLength(
  read('src/components/sidebar/MacrosSidebar.tsx'),
  'utf8',
);

if (sidebarSize >= 50_000) {
  failures.push(
    `src/components/sidebar/MacrosSidebar.tsx: expected decomposition below 50 KB, found ${sidebarSize} bytes`,
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
