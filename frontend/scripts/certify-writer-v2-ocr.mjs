#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

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
  'src/core/ocr/workers/ocrWorkerTypes.ts',
  'src/core/ocr/workers/ocrWorkerClient.ts',
  'src/core/ocr/workers/ocrWorkerEntrypoint.ts',
  'src/core/ocr/workers/ocrRasterWorkerTypes.ts',
  'src/core/ocr/workers/ocrRasterWorkerClient.ts',
  'src/core/ocr/workers/ocrRasterWorkerEntrypoint.ts',
  'src/components/ocr/OcrPanel.tsx',
  'src/components/ocr/OcrPanelWriterConnected.tsx',
  'src/components/ocr/OcrPipelineModePanel.tsx',
  'src/components/ocr/OcrExecutionSettingsPanel.tsx',
  'src/components/ocr/OcrBatchQueuePanel.tsx',
  'src/components/ocr/OcrSearchablePdfExportPanel.tsx',
  'src/components/ocr/OcrProjectRestorePanel.tsx',
  'src/components/ocr/workflow/useOcrRunWorkflow.ts',
  'src/components/ocr/workflow/OcrPageScopeControl.tsx',
  'src/components/ocr/workflow/OcrReviewWorkspace.tsx',
  'src/core/ocr/fixtures/ocrDemoFixtures.ts',
  'src/components/ocr/OcrDemoFixturePanel.tsx',
  'src/components/ocr/OcrUnifiedPanel.tsx',
  'src/components/ocr/OcrSourceSummaryCard.tsx',
  'src/components/sidebar/SidebarPanel.tsx',
  'src/components/ocr/sections/OcrSectionShell.tsx',
  'src/components/ocr/sections/OcrRunSection.tsx',
  'src/components/ocr/sections/OcrReviewSection.tsx',
  'src/components/ocr/sections/OcrExportSection.tsx',
  'src/components/ocr/sections/OcrProjectSection.tsx',
  'src/components/ocr/sections/OcrDiagnosticsSection.tsx',
  'src/components/ocr/sections/index.ts',
  'src/core/ocr/ocrFinalIntegration.ts',
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
  'src/components/ocr/__tests__/OcrDemoFixturePanel.test.tsx',
  'src/components/ocr/__tests__/OcrUnifiedPanel.test.tsx',
  'src/components/ocr/__tests__/OcrSourceSummaryCard.test.tsx',
  'src/components/ocr/__tests__/OcrSections.test.tsx',
  'src/components/ocr/__tests__/OcrPageScopeControl.test.tsx',
  'src/components/ocr/__tests__/useOcrRunWorkflow.test.tsx',
  'src/components/ocr/__tests__/OcrReviewWorkspace.test.tsx',
  'src/core/ocr/__tests__/ocrFinalIntegration.test.ts',
];

const checks = [];

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

function listSourceFiles(dir) {
  const start = absolute(dir);

  if (!fs.existsSync(start)) {
    return [];
  }

  const out = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage' || entry.name === '.git') {
          continue;
        }

        walk(full);
        continue;
      }

      if (/\.(ts|tsx|js|jsx|mjs|json|md)$/.test(entry.name)) {
        out.push(path.relative(root, full).replaceAll(path.sep, '/'));
      }
    }
  };

  walk(start);
  return out;
}

function assertFilesPresent(label, files) {
  const missing = files.filter((file) => !exists(file));

  if (missing.length === 0) {
    pass(`${label}_FILES_PRESENT`, `${files.length} ${label} file(s) found.`);
    return;
  }

  fail(`${label}_FILES_MISSING`, `Missing ${label} file(s): ${missing.join(', ')}`);
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
    return;
  }

  fail(code, `${file} is missing marker(s): ${missing.join(', ')}`);
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
    return;
  }

  fail(code, `${file} contains forbidden marker(s): ${found.join(', ')}`);
}

function assertNoForbiddenAcrossSource() {
  const files = [
    ...listSourceFiles('src'),
    ...listSourceFiles('scripts'),
  ].filter((file) => file !== 'scripts/certify-writer-v2-ocr.mjs' && file !== 'scripts/no-mojibake-audit.mjs');

  const forbidden = [
    { pattern: '[object Object]', code: 'OBJECT_OBJECT_LEAK' },
    { pattern: '\uFFFD', code: 'UNICODE_REPLACEMENT_CHAR' },
    { pattern: '\u00E2\u20AC\u2122', code: 'MOJIBAKE_APOSTROPHE' },
    { pattern: '\u00E2\u20AC\u0153', code: 'MOJIBAKE_OPEN_QUOTE' },
    { pattern: '\u00E2\u20AC', code: 'MOJIBAKE_GENERAL' },
  ];

  const violations = [];

  for (const file of files) {
    const text = read(file);
    const isTestFile = file.includes('.test.');

    for (const item of forbidden) {
      if (item.code === 'OBJECT_OBJECT_LEAK' && isTestFile) {
        continue;
      }

      if (text.includes(item.pattern)) {
        violations.push(`${file}: ${item.code}`);
      }
    }
  }

  if (violations.length === 0) {
    pass('NO_SOURCE_CORRUPTION', `Scanned ${files.length} source file(s); no corruption markers found.`);
    return;
  }

  fail('SOURCE_CORRUPTION_FOUND', violations.join('\n'));
}

function assertLegacyOcrRetired() {
  assertContains(
    'src/core/ocr/legacyOcrCompat.ts',
    ['createLegacyOcrRetirementNotice', 'shouldDisableLegacyPreviewOcr', 'Legacy preview OCR is retired'],
    'LEGACY_COMPAT_MARKERS',
  );

  assertContains(
    'src/components/ocr/OcrLauncher.tsx',
    ['legacy-ocr-launcher-retired', 'createLegacyOcrLaunchPlan', 'Run preview OCR retired'],
    'LEGACY_LAUNCHER_RETIRED',
  );

  assertNotContains(
    'src/components/ocr/OcrLauncher.tsx',
    ['ocrStore.startJob(', 'hasPreviewOcr'],
    'LEGACY_LAUNCHER_NO_ACTIVE_START',
  );

  assertContains(
    'src/components/sidebar/OcrJobsPanel.tsx',
    ['legacy-ocr-jobs-panel-retired', 'OcrPanelWriterConnected'],
    'LEGACY_JOBS_PANEL_RETIRED',
  );

  assertNotContains(
    'src/core/ocr/store.ts',
    ["from '../../adapters/ocr-preview/TesseractAdapter'", 'recognizePages({'],
    'LEGACY_STORE_NO_PREVIEW_ADAPTER',
  );
}

function assertSidebarUsesConnectedOcr() {
  assertContains(
    'src/components/sidebar/SidebarPanel.tsx',
    ['OcrPanelWriterConnected', '<OcrPanelWriterConnected'],
    'SIDEBAR_USES_CONNECTED_OCR',
  );

  assertNotContains(
    'src/components/sidebar/SidebarPanel.tsx',
    ['<OcrJobsPanel', 'ocrStore'],
    'SIDEBAR_NO_LEGACY_OCR_PANEL',
  );
}

function assertPdfSourceBridge() {
  assertContains(
    'src/core/ocr/ocrPdfSourceBridge.ts',
    ['workingBytes', 'originalBytes', 'sessionPageNumbersToOcrPageIndexes', 'selectedPageIndexes', 'OCR_PDF_SOURCE_READY'],
    'PDF_SOURCE_BRIDGE_READY',
  );

  assertContains(
    'src/components/ocr/OcrPanelWriterConnected.tsx',
    ['useSessionStore', 'getOcrPdfSourceFromSessionState', 'pdfBytes={effectivePdfBytes}', 'selectedPageIndexes={effectiveSelectedPageIndexes}', 'ocr-pdf-source-summary'],
    'WRITER_CONNECTED_PDF_SOURCE_READY',
  );
}

function assertPipelineReady() {
  assertContains(
    'src/core/ocr/ocrPipelineMode.ts',
    ['worker-raster-worker-ocr', 'runOcrPipeline', 'resolveOcrPipelinePageInputs', 'runOcrPipelineRecognition'],
    'PIPELINE_MODE_READY',
  );

  assertContains(
    'src/core/ocr/ocrPipelineBatchPlanner.ts',
    ['createOcrPipelineBatchPlan', 'worker-raster', 'main-thread-raster', 'createOcrBatchTasksFromPages'],
    'PIPELINE_BATCH_PLANNER_READY',
  );

  assertContains(
    'src/components/ocr/OcrPipelineModePanel.tsx',
    ['ocr-pipeline-mode-panel', 'ocr-pipeline-mode-select', 'Effective mode'],
    'PIPELINE_MODE_PANEL_READY',
  );
}

function assertExportsReady() {
  assertContains(
    'src/core/ocr/ocrSearchablePdfExport.ts',
    ['exportSearchableOcrPdf', 'OCR_TEXT_LAYER_ADDED', 'visibilityMode', 'layerMode'],
    'SEARCHABLE_PDF_EXPORT_READY',
  );

  assertContains(
    'src/core/ocr/ocrProjectCodec.ts',
    ['createOcrProjectPayload', 'validateOcrProjectPayload', 'writerInsertionQueue'],
    'OCR_PROJECT_CODEC_READY',
  );

  assertContains(
    'src/core/ocr/ocrHydrationBridge.ts',
    ['hydrateOcrStoreFromProjectPayload', 'createOcrProjectPayloadFromStore', 'WRITER_INSERTION_QUEUE_RESTORED'],
    'OCR_HYDRATION_READY',
  );
}

function assertWorkerProtocolsReady() {
  assertContains(
    'src/core/ocr/workers/ocrWorkerTypes.ts',
    ['RECOGNIZE_PAGES', 'RECOGNIZE_RESULT', 'CANCEL_REQUEST'],
    'OCR_WORKER_TYPES_READY',
  );

  assertContains(
    'src/core/ocr/workers/ocrWorkerEntrypoint.ts',
    ['installOcrWorkerEntrypoint', 'recognizePagesWithProgress', 'REQUEST_CANCELLED'],
    'OCR_WORKER_ENTRYPOINT_READY',
  );

  assertContains(
    'src/core/ocr/workers/ocrRasterWorkerTypes.ts',
    ['RASTERIZE_PAGES', 'RASTERIZE_REGION', 'RASTERIZE_RESULT'],
    'RASTER_WORKER_TYPES_READY',
  );

  assertContains(
    'src/core/ocr/workers/ocrRasterWorkerEntrypoint.ts',
    ['installOcrRasterWorkerEntrypoint', 'handleRasterizePagesRequest', 'handleRasterizeRegionRequest'],
    'RASTER_WORKER_ENTRYPOINT_READY',
  );
}

function assertPackageScripts() {
  if (!exists('package.json')) {
    fail('PACKAGE_JSON_MISSING', 'package.json missing.');
    return;
  }

  const json = JSON.parse(read('package.json'));
  const scripts = json.scripts ?? {};
  const expected = ['typecheck', 'test:ci'];
  const missing = expected.filter((script) => !scripts[script]);

  if (missing.length > 0) {
    fail('PACKAGE_BASE_SCRIPTS_MISSING', `Missing package scripts: ${missing.join(', ')}`);
    return;
  }

  pass('PACKAGE_BASE_SCRIPTS_READY', 'Base package scripts found.');

  if (scripts['certify:writer-v2-ocr']) {
    pass('PACKAGE_OCR_CERT_SCRIPT_READY', 'certify:writer-v2-ocr package script found.');
  } else {
    fail('PACKAGE_OCR_CERT_SCRIPT_MISSING', 'Add package script certify:writer-v2-ocr.');
  }
}

function assertDemoFixturesReady() {
  assertContains(
    'src/core/ocr/fixtures/ocrDemoFixtures.ts',
    ['createOcrDemoFixture', 'createOcrDemoPdfBytes', 'createOcrDemoResult', 'simple-table'],
    'OCR_DEMO_FIXTURES_READY',
  );

  assertContains(
    'src/components/ocr/OcrDemoFixturePanel.tsx',
    ['ocr-demo-fixture-panel', 'onFixtureLoaded', 'Load demo fixture'],
    'OCR_DEMO_FIXTURE_PANEL_READY',
  );
}

function assertUnifiedOcrUxReady() {
  assertContains(
    'src/components/ocr/OcrUnifiedPanel.tsx',
    ['ocr-unified-panel', 'ocr-unified-section-source', 'ocr-unified-section-run', 'ocr-unified-section-diagnostics'],
    'OCR_UNIFIED_PANEL_READY',
  );

  assertContains(
    'src/components/ocr/OcrSourceSummaryCard.tsx',
    ['ocr-source-summary-card', 'Active OCR Source', 'PDF bytes'],
    'OCR_SOURCE_SUMMARY_CARD_READY',
  );
}

function assertPrimaryOcrFlowReady() {
  assertContains(
    'src/components/ocr/OcrPanel.tsx',
    ['OcrPageScopeControl', 'ocr-advanced-workflow', 'runDisabled={!runWorkflow.canRun}', 'hasReviewWorkspace', 'hasCurrentResult'],
    'OCR_PRIMARY_FLOW_READY',
  );

  assertContains(
    'src/components/ocr/workflow/OcrRunControls.tsx',
    ['Recognize text', 'Recognizing', 'cancel-ocr-button', 'runDisabled'],
    'OCR_PRIMARY_ACTIONS_READY',
  );

  assertContains(
    'src/components/ocr/workflow/OcrPageScopeControl.tsx',
    ["'current' | 'selected' | 'resume' | 'all'", 'ocr-page-scope', 'No pages selected'],
    'OCR_PAGE_SCOPE_READY',
  );

  assertContains(
    'src/components/ocr/workflow/useOcrRunWorkflow.ts',
    ['hasInputSource', 'pdfBytes || (pages && pages.length > 0)', 'canRun = !isRunning && hasInputSource'],
    'OCR_REAL_INPUT_REQUIRED',
  );

  assertContains(
    'src/components/ocr/OcrSearchablePdfExportPanel.tsx',
    ['ocr-searchable-advanced-settings', 'Searchable PDF settings', 'Create searchable PDF'],
    'OCR_EXPORT_PRIMARY_ACTION_READY',
  );

  assertNotContains(
    'src/components/ocr/sections/OcrRunSection.tsx',
    ['setAdvancedOpen(true)', 'diagnostics arriving after the run plan'],
    'OCR_SETTINGS_DO_NOT_AUTO_OPEN',
  );
}

function assertOcrSectionsReady() {
  assertContains(
    'src/components/ocr/sections/OcrRunSection.tsx',
    ['ocr-run-section', 'engineControls', 'batchQueue', 'runControls'],
    'OCR_RUN_SECTION_READY',
  );

  assertContains(
    'src/components/ocr/sections/OcrReviewSection.tsx',
    ['ocr-review-section', 'correctionsPanel', 'regionTools', 'writerInsertion'],
    'OCR_REVIEW_SECTION_READY',
  );

  assertContains(
    'src/components/ocr/sections/OcrExportSection.tsx',
    ['ocr-export-section', 'searchablePdfExport', 'projectExport'],
    'OCR_EXPORT_SECTION_READY',
  );

  assertContains(
    'src/components/ocr/sections/OcrProjectSection.tsx',
    ['ocr-project-section', 'restorePanel', 'projectActions'],
    'OCR_PROJECT_SECTION_READY',
  );

  assertContains(
    'src/components/ocr/sections/OcrDiagnosticsSection.tsx',
    ['ocr-diagnostics-section', 'OcrDiagnosticsMessage', 'ocr-diagnostics-message'],
    'OCR_DIAGNOSTICS_SECTION_READY',
  );
}

function assertRunWorkflowReady() {
  assertContains(
    'src/components/ocr/workflow/useOcrRunWorkflow.ts',
    ['runFinalOcrIntegrationJob', 'runOcrPipeline', 'createOcrExecutionPlan', 'runOcrBatchScheduler', 'createOcrAbortControllerWithTimeout'],
    'OCR_RUN_WORKFLOW_USES_FINAL_INTEGRATION',
  );
}

function assertReviewWorkspaceReady() {
  assertContains(
    'src/components/ocr/workflow/OcrReviewWorkspace.tsx',
    ['OcrResultSummary', 'OcrSearchMiniPanel', 'OcrLowConfidencePanel', 'OcrCorrectionPanel', 'ocr-region-document-guidance', 'focusOcrTarget', 'OcrRegionActionPanel', 'OcrTableReviewPanel', 'OcrWriterInsertPanel'],
    'OCR_REVIEW_WORKSPACE_READY',
  );

  assertNotContains(
    'src/components/ocr/workflow/OcrReviewWorkspace.tsx',
    ['OcrRegionTool', 'pageWidth={595}', 'pageHeight={842}', 'viewportWidth={240}', 'viewportHeight={340}'],
    'OCR_REVIEW_WORKSPACE_NO_SYNTHETIC_REGION_CANVAS',
  );

  assertContains(
    'src/components/writer/WriterOverlay.tsx',
    ['ocr-document-region-mode-picker', 'addOcrRegion', 'focusOcrTarget', "(['text', 'table', 'note'] as const)"],
    'OCR_REGION_SELECTION_USES_REAL_DOCUMENT',
  );

  assertContains(
    'src/components/ocr/OcrPanel.tsx',
    ['OcrReviewWorkspace', 'useOcrRunWorkflow', 'OcrExportSection', 'OcrProjectSection'],
    'OCR_PANEL_USES_REVIEW_WORKSPACE',
  );
}

function assertFinalIntegrationReady() {
  assertContains(
    'src/core/ocr/ocrFinalIntegration.ts',
    ['runFinalOcrIntegrationJob', 'mergeOcrDocumentResults', 'createOcrExecutionPlan', 'createOcrPipelineBatchPlan', 'runOcrBatchScheduler', 'runOcrPipeline'],
    'OCR_FINAL_INTEGRATION_READY',
  );

  assertRunWorkflowReady();

  assertNotContains(
    'src/components/ocr/OcrPanel.tsx',
    ['setUseWorkerOcr', 'presentationMode=', 'runWorkerOcrJob({'],
    'OCR_PANEL_NO_TRANSITIONAL_WORKER_TOGGLE',
  );

  assertContains(
    'src/components/ocr/OcrPanelWriterConnected.tsx',
    ['OcrPanel is mounted once only', '<OcrPanel'],
    'OCR_WRITER_CONNECTED_SINGLE_PANEL',
  );
}

function main() {
  assertFilesPresent('OCR_REQUIRED', requiredFiles);
  assertFilesPresent('OCR_REQUIRED_TEST', requiredTestFiles);

  assertLegacyOcrRetired();
  assertSidebarUsesConnectedOcr();
  assertPdfSourceBridge();
  assertPipelineReady();
  assertExportsReady();
  assertWorkerProtocolsReady();
  assertDemoFixturesReady();
  assertUnifiedOcrUxReady();
  assertPrimaryOcrFlowReady();
  assertOcrSectionsReady();
  assertFinalIntegrationReady();
  assertReviewWorkspaceReady();
  assertPackageScripts();
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

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
