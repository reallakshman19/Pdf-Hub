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
  'Advanced macro tools',
  'setMacroBuilderSource',
]);

requireMarkers('src/components/macro/builder/MacroRecipeBuilder.tsx', [
  'Workflow Builder',
  '<MacroBuilderExecutionPanel',
  'Save Workflow',
  'data-testid="macro-builder-advanced"',
  'Workflow ID',
]);

requireMarkers('src/components/macro/builder/MacroBuilderExecutionPanel.tsx', [
  'Test Run',
  'Impact summary',
  'runMacroRecipeAgainstSession',
  'validateRecipeBeforeRun',
  'dryRun: true',
  'dryRun: false',
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
]);

requireMarkers('src/components/shell/ModeBar.tsx', [
  "label: 'Automate'",
]);

if (failures.length > 0) {
  console.error('\nAutomate Phase 3 audit failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Automate Phase 3 audit passed.');
