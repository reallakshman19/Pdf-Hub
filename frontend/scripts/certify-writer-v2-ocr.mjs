#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [];

const requiredFiles = [
  'src/core/ocr/ocrPdfSourceBridge.ts',
  'src/core/ocr/ocrPipelineMode.ts',
  'src/core/ocr/ocrPipelineBatchPlanner.ts',
  'src/core/ocr/ocrSearchablePdfExport.ts',
  'src/core/ocr/ocrProjectCodec.ts',
  'src/core/ocr/ocrHydrationBridge.ts',
  'src/core/ocr/ocrExecutionPolicy.ts',
  'src/core/ocr/ocrBatchScheduler.ts',
  'src/core/ocr/ocrWorkerJobRunner.ts',
  'src/core/ocr/ocrWorkerRasterBridge.ts',
  'src/core/ocr/legacyOcrCompat.ts',
  'src/core/ocr/fixtures/ocrDemoFixtures.ts',
  'src/core/ocr/workers/ocrWorkerTypes.ts',
  'src/core/ocr/workers/ocrWorkerClient.ts',
  'src/core/ocr/workers/ocrWorkerEntrypoint.ts',
  'src/core/ocr/workers/ocrRasterWorkerTypes.ts',
  'src/core/ocr/workers/ocrRasterWorkerClient.ts',
  'src/core/ocr/workers/ocrRasterWorkerEntrypoint.ts',
  'src/components/ocr/OcrPanel.tsx',
  'src/components/ocr/OcrPanelWriterConnected.tsx',
  'src/components/ocr/OcrPanelEngineControls.tsx',
  'src/components/ocr/useOcrRunCoordinator.ts',
  'src/components/ocr/useOcrReviewCoordinator.ts',
  'src/components/ocr/OcrPipelineModePanel.tsx',
  'src/components/ocr/OcrExecutionSettingsPanel.tsx',
  'src/components/ocr/OcrBatchQueuePanel.tsx',
  'src/components/ocr/OcrSearchablePdfExportPanel.tsx',
  'src/components/ocr/OcrProjectRestorePanel.tsx',
  'src/components/ocr/OcrDemoFixturePanel.tsx',
  'src/components/ocr/OcrSourceSummaryCard.tsx',
  'src/components/ocr/workflow/OcrAssistantShell.tsx',
  'src/components/ocr/workflow/OcrHeaderSummary.tsx',
  'src/components/ocr/workflow/OcrPrimaryActionBar.tsx',
  'src/components/ocr/workflow/OcrResultWorkspace.tsx',
  'src/components/ocr/workflow/OcrSourcePanel.tsx',
  'src/components/ocr/workflow/OcrAdvancedPanel.tsx',
  'src/components/ocr/workflow/OcrWorkflowStatus.tsx',
  'src/components/ocr/workflow/OcrWorkflowTypes.ts',
  'src/components/ocr/workflow/index.ts',
  'src/components/sidebar/SidebarPanel.tsx',
];

const requiredTestFiles = [
  'src/core/ocr/__tests__/ocrPdfSourceBridge.test.ts',
  'src/core/ocr/__tests__/ocrPipelineMode.test.ts',
  'src/core/ocr/__tests__/ocrPipelineBatchPlanner.test.ts',
  'src/core/ocr/__tests__/ocrSearchablePdfExport.test.ts',
  'src/core/ocr/__tests__/ocrProjectCodec.test.ts',
  'src/core/ocr/__tests__/ocrHydrationBridge.test.ts',
  'src/core/ocr/__tests__/ocrWorkerClient.test.ts',
  'src/core/ocr/__tests__/ocrWorkerEntrypoint.test.ts',
  'src/core/ocr/__tests__/ocrRasterWorkerClient.test.ts',
  'src/core/ocr/__tests__/ocrWorkerRasterBridge.test.ts',
  'src/core/ocr/__tests__/legacyOcrCompat.test.ts',
  'src/core/ocr/__tests__/ocrDemoFixtures.test.ts',
  'src/components/ocr/__tests__/OcrPanel.test.tsx',
  'src/components/ocr/__tests__/OcrPanelWriterConnected.test.tsx',
  'src/components/ocr/__tests__/OcrBrowserWorkflow.test.tsx',
  'src/components/ocr/__tests__/OcrDemoFixturePanel.test.tsx',
  'src/components/ocr/__tests__/OcrSourceSummaryCard.test.tsx',
];

function pass(code, message) {
  checks.push({ ok: true, code, message });
}

function fail(code, message) {
  checks.push({ ok: false, code, message });
}

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function assertFilesPresent(label, files) {
  const missing = files.filter((file) => !exists(file));
  if (missing.length === 0) {
    pass(`${label}_FILES_PRESENT`, `${files.length} ${label} file(s) found.`);
  } else {
    fail(`${label}_FILES_MISSING`, `Missing ${label} file(s): ${missing.join(', ')}`);
  }
}

function assertContains(file, patterns, code) {
  if (!exists(file)) {
    fail(code, `${file} does not exist.`);
    return;
  }
  const text = read(file);
  const missing = patterns.filter((pattern) => !text.includes(pattern));
  if (missing.length === 0) {
    pass(code, `${file} contains required marker(s).`);
  } else {
    fail(code, `${file} is missing marker(s): ${missing.join(', ')}`);
  }
}

function assertNotContains(file, patterns, code) {
  if (!exists(file)) {
    fail(code, `${file} does not exist.`);
    return;
  }
  const text = read(file);
  const found = patterns.filter((pattern) => text.includes(pattern));
  if (found.length === 0) {
    pass(code, `${file} does not contain forbidden marker(s).`);
  } else {
    fail(code, `${file} contains forbidden marker(s): ${found.join(', ')}`);
  }
}

function listSourceFiles(dir) {
  const start = absolute(dir);
  if (!fs.existsSync(start)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) walk(full);
        continue;
      }
      if (/\.(ts|tsx|js|jsx|mjs|json)$/.test(entry.name)) {
        out.push(path.relative(root, full).replaceAll(path.sep, '/'));
      }
    }
  };
  walk(start);
  return out;
}

function assertNoForbiddenAcrossSource() {
  const files = [...listSourceFiles('src'), ...listSourceFiles('scripts')]
    .filter((file) => file !== 'scripts/certify-writer-v2-ocr.mjs');
  const forbidden = ['[object Object]', '\uFFFD', 'â€™', 'â€œ', 'â€'];
  const violations = [];
  for (const file of files) {
    const text = read(file);
    for (const pattern of forbidden) {
      if (text.includes(pattern) && !(pattern === '[object Object]' && file.includes('.test.'))) {
        violations.push(`${file}: ${pattern}`);
      }
    }
  }
  if (violations.length === 0) {
    pass('NO_SOURCE_CORRUPTION', `Scanned ${files.length} source file(s); no corruption markers found.`);
  } else {
    fail('SOURCE_CORRUPTION_FOUND', violations.join('\n'));
  }
}

function assertPackageScripts() {
  const json = JSON.parse(read('package.json'));
  const scripts = json.scripts ?? {};
  const required = ['typecheck', 'lint', 'test:ci', 'check:doc-hub', 'check:static', 'build', 'check:release'];
  const missing = required.filter((script) => !scripts[script]);
  if (missing.length === 0) pass('PACKAGE_RELEASE_SCRIPTS_READY', 'Release gate package scripts found.');
  else fail('PACKAGE_RELEASE_SCRIPTS_MISSING', `Missing package scripts: ${missing.join(', ')}`);
}

function assertWorkflowArchitecture() {
  assertContains('src/components/ocr/OcrPanel.tsx', [
    'OcrAssistantShell',
    'useOcrRunCoordinator',
    'useOcrReviewCoordinator',
    'OcrPanelEngineControls',
  ], 'OCR_PANEL_COORDINATOR_READY');

  assertContains('src/components/ocr/workflow/OcrAssistantShell.tsx', [
    'ocr-assistant-shell',
    'OcrHeaderSummary',
    'OcrPrimaryActionBar',
    'OcrResultWorkspace',
    'OcrSourcePanel',
    'OcrAdvancedPanel',
  ], 'OCR_ASSISTANT_SHELL_READY');

  assertContains('src/components/ocr/workflow/OcrHeaderSummary.tsx', [
    'OCR Assistant',
    'ocr-header-summary',
    'ocr-unified-summary',
    'Pages',
    'Selected',
  ], 'OCR_HEADER_SUMMARY_READY');

  assertContains('src/components/ocr/workflow/OcrPrimaryActionBar.tsx', [
    'ocr-primary-action-bar',
    'run-ocr-button',
    'Running OCR...',
    'Page scope:',
    'Profile:',
  ], 'OCR_PRIMARY_ACTION_READY');

  assertContains('src/components/ocr/workflow/OcrResultWorkspace.tsx', [
    'Review and use result',
    'ocr-result-workspace',
    'ocr-review-empty',
  ], 'OCR_RESULT_WORKSPACE_READY');

  assertContains('src/components/ocr/workflow/OcrAdvancedPanel.tsx', [
    'ocr-advanced-panel',
    'Advanced OCR settings',
    'forceOpen',
    'onToggle',
  ], 'OCR_ADVANCED_COLLAPSIBLE_READY');

  assertContains('src/components/ocr/workflow/OcrSourcePanel.tsx', [
    'ocr-source-panel',
    'Source details',
    'hasWarning',
    'onToggle',
  ], 'OCR_SOURCE_COLLAPSIBLE_READY');
}

function assertWorkflowLogicPreserved() {
  assertContains('src/components/ocr/useOcrRunCoordinator.ts', [
    'runFinalOcrIntegrationJob',
    'runOcrPipeline',
    'createOcrExecutionPlan',
    'runOcrBatchScheduler',
  ], 'OCR_RUN_LOGIC_PRESERVED');

  assertContains('src/components/ocr/useOcrReviewCoordinator.ts', [
    'resolveOcrRegionPageInput',
    'createReviewedOcrTableWriterElement',
    'createOcrWriterInsertionQueue',
    'upsertOcrWriterInsertionCandidate',
  ], 'OCR_REVIEW_LOGIC_PRESERVED');

  assertContains('src/components/ocr/OcrPanelWriterConnected.tsx', [
    'useSessionStore',
    'getOcrPdfSourceFromSessionState',
    'pdfBytes={effectivePdfBytes}',
    'selectedPageIndexes={effectiveSelectedPageIndexes}',
    'advancedFixtures',
    'ocr-pdf-source-summary',
  ], 'OCR_CONNECTED_SOURCE_READY');

  assertNotContains('src/components/ocr/OcrPanelWriterConnected.tsx', [
    'ocr-unified-panel',
    'OcrPanelWriterConnectedHeader',
  ], 'OCR_CONNECTED_NO_NESTED_WORKFLOW');
}

function assertBrowserWorkflowTest() {
  assertContains('src/components/ocr/__tests__/OcrBrowserWorkflow.test.tsx', [
    'ocr-assistant-shell',
    'run-ocr-button',
    'ocr-result-workspace',
    'ocr-review-search',
    'ocr-region-run',
    'ocr-writer-insert-button',
    'ocr-searchable-pdf-export-panel',
  ], 'OCR_BROWSER_WORKFLOW_TEST_READY');
}

function main() {
  assertFilesPresent('OCR_REQUIRED', requiredFiles);
  assertFilesPresent('OCR_REQUIRED_TEST', requiredTestFiles);
  assertPackageScripts();
  assertWorkflowArchitecture();
  assertWorkflowLogicPreserved();
  assertBrowserWorkflowTest();
  assertNoForbiddenAcrossSource();

  const failed = checks.filter((check) => !check.ok);
  const lines = [
    '',
    '# Writer V2 OCR Certification',
    '',
    `Total checks: ${checks.length}`,
    `Passed:       ${checks.length - failed.length}`,
    `Failed:       ${failed.length}`,
    '',
    ...checks.map((check) => `${check.ok ? 'PASS' : 'FAIL'} ${check.code}: ${check.message}`),
    '',
  ];
  console.log(lines.join('\n'));
  if (failed.length > 0) process.exitCode = 1;
}

main();
