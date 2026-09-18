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
      failures.push(`${file}: forbidden product-surface marker remains: ${marker}`);
    }
  }
}

requireMarkers('src/components/sidebar/SidebarPanel.tsx', [
  "case 'macros':     return 'Automate'",
  '<AutomateSidebar />',
]);

forbidMarkers('src/components/sidebar/SidebarPanel.tsx', [
  '<PsIsonoteRecipeBuilder />',
  '<MacrosSidebar />',
]);

requireMarkers('src/components/toolbar/ToolbarMacro.tsx', [
  'Open Automate',
  "setSidebarTab('macros')",
  'data-testid="open-automate"',
]);

forbidMarkers('src/components/toolbar/ToolbarMacro.tsx', [
  'BUILTIN_MACROS',
  'Rotate 90',
  'Page Numbers',
  'Built-ins',
  'Macro Panel',
]);

requireMarkers('src/components/sidebar/AutomateSidebar.tsx', [
  'Quick Actions',
  'My Workflows',
  'Build',
  'Specialized workflows',
  'Generate Document',
  'MacroGenerateDocumentPanel',
  'MacroBatchRunPanel',
  'Batch Process PDFs',
  'MacroOutputQueue',
  'setMacroBuilderSource',
]);

forbidMarkers('src/components/sidebar/AutomateSidebar.tsx', [
  'Advanced macro tools',
  'MacrosSidebar',
  'MacroExpertWorkspace',
  'MacroPresetExecutionPanel',
  'MacroPresetParameters',
]);

forbidMarkers('src/components/toolbar/ToolbarOrganize.tsx', [
  'Batch Run Recipe',
  'BatchRunDialog',
  'runMacroBatch',
  'BUILTIN_MACROS',
]);

requireMarkers('src/components/macro/advanced/MacroBatchRunPanel.tsx', [
  'Batch Process PDFs',
  'FileAdapter.pickPdfFileSources(true)',
  'runMacroBatch({',
  'onOutput:',
  'FileAdapter.downloadBytes',
  'onBusyChange',
]);

requireMarkers('src/components/dialogs/BatchRunDialog.tsx', [
  'getBuiltInMacroRecipes',
  'isRunnerSafeBuiltInRecipe',
  'analyzeMacroWorkflowRisk',
  'usesSelectedPageSelector',
]);

requireMarkers('src/components/sidebar/PsIsonoteRecipeBuilder.tsx', [
  'onBusyChange',
  'workflowBusy',
  'isScanning || isRunning || isPackaging',
]);

requireMarkers('src/components/sidebar/AutomateSidebar.tsx', [
  'specializedBusy',
  'onBusyChange={setSpecializedBusy}',
]);

requireMarkers('src/core/macro/recipes/builtInRecipes.ts', [
  "'header-file-name-selected'",
  "'file-date-page-footer-selected'",
  "'review-copy-selected'",
  "'review-pack-header-footer'",
  "'insert-blank-after-current'",
  "position: { mode: 'after-current' }",
]);

requireMarkers('src/components/macro/builder/MacroRecipeBuilder.tsx', [
  'Workflow Builder',
  '<MacroBuilderExecutionPanel',
  'Save Workflow',
  'data-testid="macro-builder-advanced"',
  'Workflow ID',
]);

requireMarkers('src/core/macro/risk.ts', [
  "'remove_pages'",
  "'split_pages'",
  "'replace_page'",
  "'reorder_pages'",
  "'preview-required'",
]);

requireMarkers('src/components/macro/builder/MacroBuilderExecutionPanel.tsx', [
  'Test Run',
  'Impact summary',
  'runMacroRecipeAgainstSession',
  'validateRecipeBeforeRun',
  'dryRun: true',
  'dryRun: false',
  "riskAnalysis.risk === 'preview-required'",
  'lastTestedRecipeSignature === recipeSignature',
]);

for (const file of [
  'src/components/macro/builder/MacroStepList.tsx',
  'src/components/macro/builder/MacroStepsTable.tsx',
  'src/components/macro/builder/MacroStepEditor.tsx',
  'src/components/macro/builder/MacroNestedBranchEditor.tsx',
]) {
  forbidMarkers(file, [
    'Operation: {step.op}',
    '>{step.op}</div>',
  ]);
}

requireMarkers('src/components/shell/TopNav.tsx', [
  "label: 'Automate'",
  "label: 'Open Automate'",
  "setSidebarTab('macros')",
]);

forbidMarkers('src/components/shell/CtxBar.tsx', [
  '<ToolbarMacro />',
  "from '@/components/toolbar/ToolbarMacro'",
]);

requireMarkers('src/components/shell/ModeBar.tsx', [
  "label: 'Automate'",
  "setSidebarTab('macros')",
  'setMobileDrawerOpen(true)',
]);

requireMarkers('src/components/shell/ToolbarBand.tsx', [
  'label="Automate"',
]);

requireMarkers('src/components/shell/LeftRail.tsx', [
  "label: 'Automate'",
  "if (id === 'macros') setActiveMode('generate')",
]);

if (failures.length > 0) {
  console.error('\nAutomate Phase 3 audit failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Automate Phase 3 audit passed.');
