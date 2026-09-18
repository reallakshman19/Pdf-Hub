import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'macro-enh2-certification-report.json');

const commands = [
  {
    name: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
  },
  {
    name: 'slice-tests',
    command: executable('vitest'),
    args: [
      'run',
      'src/core/macro/steps/page-ops.slice2.test.ts',
      'src/core/macro/steps/content-ops.slice3.test.ts',
      'src/core/macro/validator.slice4.test.ts',
      'src/core/macro/slice5-runtime.test.ts',
      'src/core/macro/schema/opSchema.slice6.test.ts',
      'src/core/macro/recipes/builtInRecipes.slice6.test.ts',
      'src/core/macro/recipes/recipeStorage.slice6.test.ts',
      'src/core/macro/builder/recipeBuilderState.slice7.test.ts',
      'src/components/macro/builder/MacroRecipeBuilder.slice8.test.tsx',
      'src/components/macro/builder/MacroBuilderExecutionPanel.test.tsx',
      'src/components/macro/advanced/MacroOutputQueue.test.tsx',
      'src/components/macro/advanced/MacroGenerateDocumentPanel.test.tsx',
      'src/components/macro/builder/MacroStepEditor.slice9.test.tsx',
      'src/components/macro/builder/MacroNestedBranchEditor.slice10.test.tsx',
      'src/pages/MacroBuilderPage.slice11.test.tsx',
      'src/App.slice11.test.tsx',
      'src/core/macro/store/presets.slice12.test.ts',
      'src/core/macro/sessionRunner.slice12.test.ts',
      'src/core/macro/risk.test.ts',
      'src/components/sidebar/AutomateSidebar.test.tsx',
      'src/components/toolbar/ToolbarMacro.test.tsx',
      'src/components/shell/TopNav.test.tsx',
      'src/components/shell/ModeBar.test.tsx',
    ],
  },
  {
    name: 'automate-phase3-audit',
    command: 'node',
    args: ['scripts/automate-phase3-audit.mjs'],
  },
  {
    name: 'automate-phase3-decomposition-audit',
    command: 'node',
    args: ['scripts/automate-phase3-decomposition-audit.mjs'],
  },
  {
    name: 'audit-no-placeholders',
    command: 'npm',
    args: ['run', 'audit:no-placeholders'],
  },
  {
    name: 'audit-active-placeholders',
    command: 'node',
    args: ['scripts/macro-enh2-active-placeholder-audit.mjs'],
  },
  {
    name: 'audit-contracts',
    command: 'npm',
    args: ['run', 'audit:contracts'],
  },
  {
    name: 'build',
    command: 'npm',
    args: ['run', 'build'],
  },
];

const startedAt = new Date().toISOString();
const results = [];
let failed = false;

fs.mkdirSync(reportDir, { recursive: true });

for (const item of commands) {
  console.log(`\n=== ${item.name} ===`);
  console.log(`$ ${item.command} ${item.args.join(' ')}`);

  const result = spawnSync(item.command, item.args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
    },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const passed = result.status === 0;

  process.stdout.write(stdout);

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }

  results.push({
    name: item.name,
    command: `${item.command} ${item.args.join(' ')}`,
    statusCode: result.status,
    passed,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  });

  if (!passed) {
    failed = true;
    console.error(`\n[FAIL] ${item.name}`);
    break;
  }

  console.log(`[PASS] ${item.name}`);
}

const report = {
  name: 'PDF Hub Macro Enhancement Certification',
  startedAt,
  finishedAt: new Date().toISOString(),
  finalVerdict: failed ? 'FAIL' : 'PASS',
  results,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nCertification report written to ${normalize(path.relative(root, reportPath))}`);
console.log(`Final verdict: ${report.finalVerdict}`);

if (failed) {
  process.exit(1);
}

function executable(binName) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(root, 'node_modules', '.bin', `${binName}${suffix}`);
}

function tail(text) {
  const lines = text
    .split(/\r?\n/)
    .filter(Boolean);

  return lines.slice(-60);
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}