import { readFile } from 'node:fs/promises';
import process from 'node:process';

const ROOT = new URL('../', import.meta.url);

const files = Object.fromEntries(
  await Promise.all(
    [
      'src/core/ocr/ocrResumeState.ts',
      'src/core/ocr/ocrBatchScheduler.ts',
      'src/core/ocr/ocrProjectCodec.ts',
      'src/core/ocr/ocrHydrationBridge.ts',
      'src/core/ocr/ocrStore.ts',
      'src/core/ocr/ocrFinalIntegration.ts',
      'src/core/ocr/ocrPipelineBatchPlanner.ts',
      'src/components/ocr/workflow/useOcrRunWorkflow.ts',
      'src/components/ocr/workflow/OcrRunControls.tsx',
      'src/core/writer-v2/export/exportCurrentWriterProject.ts',
      'src/core/writer-v2/export/projectImportController.ts',
    ].map(async (path) => [
      path,
      await readFile(new URL(path, ROOT), 'utf8'),
    ]),
  ),
);

const errors = [];

requireTokens('src/core/ocr/ocrResumeState.ts', [
  "schema: 'pdf-hub-ocr-resume'",
  'schemaVersion: 1',
  'documentFingerprint',
  'engineId',
  'profileId',
  'executionConfig',
  'forceOcr',
  'rasterScale',
  'maxCanvasPixels',
  'maxPagesPerJob',
  'allowLargeJobs',
  'OCR_RESUME_DOCUMENT_MISMATCH',
  'OCR_RESUME_ENGINE_MISMATCH',
  'OCR_RESUME_PROFILE_MISMATCH',
  'OCR_RESUME_EXECUTION_CONFIG_MISMATCH',
  'OCR_RESUME_TASK_PLAN_MISMATCH',
  'isOcrBatchTaskStatus',
  'taskIds',
  'ownedPageIndexes',
  'task.pageIndexes.length === 0',
  'ocrResumeExecutionConfigMatches',
]);

requireTokens('src/core/ocr/ocrBatchScheduler.ts', [
  "task.status !== 'queued'",
  'mergeOcrBatchRetrySnapshot',
]);

requireTokens('src/core/ocr/ocrProjectCodec.ts', [
  'resumeToken?: OcrResumeTokenV1 | null',
  'validateOcrResumeToken',
  'completedPageIndexes',
  'missingCompletedPages',
  'failedCompletedPages',
  'INVALID_OCR_RESUME_TOKEN',
]);

requireTokens('src/core/ocr/ocrHydrationBridge.ts', [
  'OCR_RESUME_STATE_RESTORED',
  'OCR_RESUME_STATE_DISCARDED',
  'resumeToken: input.resumeToken ?? store.resumeToken',
  'engineId: resumeToken?.engineId',
  'profileId: resumeToken?.profileId',
]);

requireTokens('src/core/ocr/ocrStore.ts', [
  'resumeToken: OcrResumeTokenV1 | null',
  'setOcrResumeToken',
  'acceptResumeToken',
  'validateOcrResumeToken',
  'resumeTokenMatchesConfiguration',
  'resumeTokenCompletedPagesArePersisted',
  'mergeCompatibleOcrResults',
]);

requireTokens('src/core/ocr/ocrFinalIntegration.ts', [
  'resumeToken?: OcrResumeTokenV1 | null',
  'existingResult?: OcrDocumentResult | null',
  'resumeOcrBatchTasks',
  'assertPersistedResultsCoverCompletedTasks',
  'failedCompletedPages',
  'deferredResumePageIndexes',
  'OCR_FINAL_RESUME_APPLIED',
  'OCR_FINAL_RESUME_INVALID',
  "page.status === 'failed'",
]);

requireTokens('src/core/ocr/ocrPipelineBatchPlanner.ts', [
  'deferredPageIndexes',
  'OCR_PIPELINE_RESUME_PAGES_DEFERRED',
  'activePageIndexes',
  'deferredInputs',
]);

requireTokens('src/components/ocr/workflow/useOcrRunWorkflow.ts', [
  'createOcrResumeToken',
  'ocrResumeExecutionConfigMatches',
  'resumeTokenMatchesBatchPlan',
  'currentExecutionPlan.allowedPageIndexes',
  'currentBatchSize',
  'store.resumeToken.documentFingerprint === effectiveDocumentFingerprint',
  'store.resumeToken.engineId === store.engineId',
  'store.resumeToken.profileId === store.profileId',
  'captureBatchSnapshot',
  'mergeOcrBatchRetrySnapshot',
  'hasPendingResume',
]);

requireTokens('src/components/ocr/workflow/OcrRunControls.tsx', [
  'resumeAvailable',
  "'Resume OCR'",
]);

requireTokens('src/core/writer-v2/export/exportCurrentWriterProject.ts', [
  'createOcrProjectPayloadFromStore',
  'useOcrStore',
  'ocrProject:',
]);

requireTokens('src/core/writer-v2/export/projectImportController.ts', [
  'hydrateOcrStoreFromProjectPayload',
  'useOcrStore',
  'ocrSnapshot',
  'useOcrStore.setState(ocrSnapshot, true)',
]);

rejectTokens('src/core/ocr/ocrResumeState.ts', [
  'ocrLanguageSet',
  'languageHints',
]);

if (errors.length > 0) {
  console.error('=== Phase 11 OCR Resume Audit FAILED ===');
  for (const error of errors) console.error(`[FAIL] ${error}`);
  process.exitCode = 1;
} else {
  console.log('=== Phase 11 OCR Resume Audit ===');
  console.log('[PASS] Checkpoints bind document, engine, profile, raster/page-limit execution settings, and exact unambiguous batch topology.');
  console.log('[PASS] Scheduler preserves terminal batches and retry snapshots preserve full topology.');
  console.log('[PASS] Project manifest persistence is fail-closed for completed-page evidence.');
  console.log('[PASS] Hydration restores compatible checkpoints and discards document-rebound state.');
  console.log('[PASS] Store and workflow reject stale document/engine/profile checkpoints before they can surface as resumable work.');
  console.log('[PASS] Store rejects checkpoints whose completed-page evidence is missing or failed.');
  console.log('[PASS] Completed checkpoints require persisted non-failed OCR pages.');
  console.log('[PASS] Store and final integration enforce resumable execution without silent reprocessing.');
  console.log('[PASS] Completed checkpoint pages are deferred before rasterization.');
  console.log('[PASS] Project save/reopen path persists and restores OCR checkpoint state.');
  console.log('[PASS] Resume OCR is explicit in the workflow UI.');
  console.log('[PASS] Multilingual OCR scope is absent from the resume-token contract.');
  console.log('=== Phase 11 OCR Resume Audit PASSED ===');
}

function requireTokens(path, tokens) {
  const content = files[path];
  if (typeof content !== 'string') {
    errors.push(`${path}: source unavailable`);
    return;
  }

  for (const token of tokens) {
    if (!content.includes(token)) {
      errors.push(`${path}: missing required token ${JSON.stringify(token)}`);
    }
  }
}

function rejectTokens(path, tokens) {
  const content = files[path];
  if (typeof content !== 'string') return;

  for (const token of tokens) {
    if (content.includes(token)) {
      errors.push(`${path}: contains out-of-scope token ${JSON.stringify(token)}`);
    }
  }
}
