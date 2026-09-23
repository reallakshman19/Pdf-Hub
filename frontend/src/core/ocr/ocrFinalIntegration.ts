import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { OcrProfileId } from './ocrProfiles';
import type {
  OcrDiagnostic,
  OcrDocumentResult,
  OcrPageResult,
} from './types';
import {
  createOcrExecutionPlan,
  type OcrExecutionPolicy,
} from './ocrExecutionPolicy';
import {
  createOcrPipelineBatchPlan,
  type OcrPipelineBatchPlan,
} from './ocrPipelineBatchPlanner';
import {
  createPlaceholderOcrPageInputs,
  runOcrPipeline,
  type OcrPipelineCapabilities,
  type OcrPipelineMode,
} from './ocrPipelineMode';
import {
  createOcrBatchTasksFromPages,
  runOcrBatchScheduler,
  type OcrBatchSchedulerSnapshot,
  type OcrBatchTask,
} from './ocrBatchScheduler';
import {
  resumeOcrBatchTasks,
  type OcrResumeTokenV1,
} from './ocrResumeState';
import type { OcrWorkerClient } from './workers/ocrWorkerClient';
import type { OcrRasterWorkerClient } from './workers/ocrRasterWorkerClient';
import type { OcrJobRunnerSnapshot } from './ocrJobRunner';

export interface RunFinalOcrIntegrationJobInput {
  id: string;
  documentFingerprint: string;
  engineId: string;
  requestedProfileId: OcrProfileId;
  resumeToken?: OcrResumeTokenV1 | null;
  existingResult?: OcrDocumentResult | null;
  forceOcr?: boolean;

  mode: OcrPipelineMode;
  capabilities?: Partial<OcrPipelineCapabilities>;

  pdfBytes?: Uint8Array | null;
  explicitPages?: OcrEnginePageInput[];

  requestedPageIndexes: number[];
  totalPages: number;

  policy: OcrExecutionPolicy;
  batchSize?: number;
  batchConcurrency?: number;

  workerClient?: Pick<OcrWorkerClient, 'recognizePages' | 'dispose'>;
  rasterWorkerClient?: Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

  signal?: AbortSignal;

  onProgress?: (snapshot: OcrJobRunnerSnapshot) => void;
  onBatchSnapshot?: (snapshot: OcrBatchSchedulerSnapshot<OcrEnginePageInput[]>) => void;
  onDiagnostic?: (diagnostic: OcrFinalIntegrationDiagnostic) => void;
}

export interface RunFinalOcrIntegrationJobResult {
  id: string;
  documentFingerprint: string;
  mode: OcrPipelineMode;
  batchPlan: OcrPipelineBatchPlan;
  result: OcrDocumentResult;
  diagnostics: OcrFinalIntegrationDiagnostic[];
  batchSnapshot: OcrBatchSchedulerSnapshot<OcrEnginePageInput[]>;
}

export interface OcrFinalIntegrationDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_FINAL_EXECUTION_PLAN_READY'
    | 'OCR_FINAL_EXECUTION_PLAN_FAILED'
    | 'OCR_FINAL_BATCH_PLAN_READY'
    | 'OCR_FINAL_BATCH_RUN_STARTED'
    | 'OCR_FINAL_BATCH_RUN_COMPLETED'
    | 'OCR_FINAL_RESUME_APPLIED'
    | 'OCR_FINAL_RESUME_INVALID'
    | 'OCR_FINAL_RESULT_MERGED'
    | 'OCR_FINAL_NO_RESULTS'
    | 'OCR_FINAL_CANCELLED';
  message: string;
}

export async function runFinalOcrIntegrationJob(
  input: RunFinalOcrIntegrationJobInput,
): Promise<RunFinalOcrIntegrationJobResult> {
  const diagnostics: OcrFinalIntegrationDiagnostic[] = [];

  const emitDiagnostic = (diagnostic: OcrFinalIntegrationDiagnostic) => {
    diagnostics.push(diagnostic);
    input.onDiagnostic?.(diagnostic);
  };

  const executionPlan = createOcrExecutionPlan({
    requestedPageIndexes: input.requestedPageIndexes,
    totalPages: input.totalPages,
    policy: input.policy,
  });

  if (executionPlan.diagnostics.some((item) => item.level === 'error')) {
    const message =
      executionPlan.diagnostics.find((item) => item.level === 'error')?.message
      ?? 'OCR execution plan failed.';

    emitDiagnostic({
      level: 'error',
      code: 'OCR_FINAL_EXECUTION_PLAN_FAILED',
      message,
    });

    throw new Error(message);
  }

  emitDiagnostic({
    level: 'info',
    code: 'OCR_FINAL_EXECUTION_PLAN_READY',
    message: `${executionPlan.allowedPageIndexes.length} page(s) accepted by OCR execution policy.`,
  });

  const batchSize =
    input.batchSize
    ?? Math.max(1, Math.min(5, input.policy.maxPagesPerJob));

  let deferredResumePageIndexes: number[] = [];

  if (input.resumeToken) {
    try {
      const semanticTasks = createOcrBatchTasksFromPages({
        pages: createPlaceholderOcrPageInputs(
          executionPlan.allowedPageIndexes,
        ),
        batchSize,
        idPrefix: 'ocr-resume-plan',
      });

      const semanticResumeTasks = resumeOcrBatchTasks({
        token: input.resumeToken,
        documentFingerprint: input.documentFingerprint,
        engineId: input.engineId,
        profileId: input.requestedProfileId,
        executionConfig: {
          forceOcr: input.forceOcr ?? false,
          rasterScale: input.policy.rasterScale,
          maxCanvasPixels: input.policy.maxCanvasPixels,
        },
        tasks: semanticTasks,
      });

      assertPersistedResultsCoverCompletedTasks(
        semanticResumeTasks,
        input.existingResult ?? null,
        {
          documentFingerprint: input.documentFingerprint,
          engineId: input.engineId,
          profileId: input.requestedProfileId,
        },
      );

      deferredResumePageIndexes = semanticResumeTasks
        .filter((task) => task.status === 'completed')
        .flatMap((task) => task.pageIndexes);
    } catch (error) {
      emitDiagnostic({
        level: 'error',
        code: 'OCR_FINAL_RESUME_INVALID',
        message: error instanceof Error
          ? error.message
          : 'OCR resume state is invalid.',
      });
      throw error;
    }
  }

  const batchPlan = await createOcrPipelineBatchPlan({
    mode: input.mode,
    capabilities: input.capabilities,
    pdfBytes: input.pdfBytes,
    explicitPages: input.explicitPages,
    pageIndexes: executionPlan.allowedPageIndexes,
    deferredPageIndexes: deferredResumePageIndexes,
    batchSize,
    rasterScale: input.policy.rasterScale,
    maxCanvasPixels: input.policy.maxCanvasPixels,
    rasterWorkerClient: input.rasterWorkerClient,
    signal: input.signal,
    onRasterProgress: (progress) => {
      emitDiagnostic({
        level: 'info',
        code: 'OCR_FINAL_BATCH_PLAN_READY',
        message: progress.message ?? `Rasterized ${progress.completedPages}/${progress.totalPages} page(s).`,
      });
    },
  });

  if (batchPlan.batchTasks.length === 0) {
    emitDiagnostic({
      level: 'error',
      code: 'OCR_FINAL_NO_RESULTS',
      message: 'OCR final integration job has no batch tasks to run.',
    });

    throw new Error('OCR final integration job has no batch tasks to run.');
  }

  emitDiagnostic({
    level: 'info',
    code: 'OCR_FINAL_BATCH_PLAN_READY',
    message: `${batchPlan.batchTasks.length} OCR batch task(s) prepared using ${batchPlan.rasterPlanKind}.`,
  });

  let executableTasks = batchPlan.batchTasks;
  if (input.resumeToken) {
    try {
      executableTasks = resumeOcrBatchTasks({
        token: input.resumeToken,
        documentFingerprint: input.documentFingerprint,
        engineId: input.engineId,
        profileId: input.requestedProfileId,
        executionConfig: {
          forceOcr: input.forceOcr ?? false,
          rasterScale: input.policy.rasterScale,
          maxCanvasPixels: input.policy.maxCanvasPixels,
        },
        tasks: batchPlan.batchTasks,
      });
      emitDiagnostic({
        level: 'info',
        code: 'OCR_FINAL_RESUME_APPLIED',
        message: `OCR resume state applied: ${executableTasks.filter((task) => task.status === 'completed').length} completed batch(es) preserved without rerun.`,
      });
    } catch (error) {
      emitDiagnostic({
        level: 'error',
        code: 'OCR_FINAL_RESUME_INVALID',
        message: error instanceof Error
          ? error.message
          : 'OCR resume state is invalid.',
      });
      throw error;
    }
  }

  emitDiagnostic({
    level: 'info',
    code: 'OCR_FINAL_BATCH_RUN_STARTED',
    message: 'OCR batch execution started.',
  });

  const batchRun = await runOcrBatchScheduler<OcrEnginePageInput[], OcrDocumentResult>({
    tasks: executableTasks,
    concurrency: input.batchConcurrency ?? 1,
    signal: input.signal,
    runTask: async (task, signal) => {
      const pipelineResult = await runOcrPipeline({
        id: task.id,
        documentFingerprint: input.documentFingerprint,
        engineId: input.engineId,
        requestedProfileId: input.requestedProfileId,
        forceOcr: input.forceOcr,
        mode: batchPlan.resolvedMode.effectiveMode,
        explicitPages: task.input,
        pageIndexes: task.pageIndexes,
        rasterScale: input.policy.rasterScale,
        maxCanvasPixels: input.policy.maxCanvasPixels,
        workerClient: input.workerClient,
        rasterWorkerClient: input.rasterWorkerClient,
        signal,
        onProgress: input.onProgress,
      });

      const failedPageIndexes = pipelineResult.result.pages
        .filter((page) => page.status === 'failed')
        .map((page) => page.pageIndex);

      if (failedPageIndexes.length > 0) {
        throw new Error(
          `OCR batch ${task.id} returned failed page(s): ${failedPageIndexes.join(', ')}.`,
        );
      }

      return pipelineResult.result;
    },
    onSnapshot: input.onBatchSnapshot,
  });

  if (input.signal?.aborted) {
    emitDiagnostic({
      level: 'warning',
      code: 'OCR_FINAL_CANCELLED',
      message: 'OCR final integration job was cancelled.',
    });

    throw new Error('OCR final integration job was cancelled.');
  }

  emitDiagnostic({
    level: 'info',
    code: 'OCR_FINAL_BATCH_RUN_COMPLETED',
    message: `OCR batch execution finished with status ${batchRun.snapshot.status}.`,
  });

  const merged = mergeOcrDocumentResults({
    documentFingerprint: input.documentFingerprint,
    engineId: input.engineId,
    profileId: input.requestedProfileId,
    results: [
      ...(input.resumeToken && input.existingResult
        ? [input.existingResult]
        : []),
      ...batchRun.results.map((item) => item.output),
    ],
    diagnostics: [
      ...mapFinalDiagnosticsToOcrDiagnostics(diagnostics),
      ...batchPlan.resolvedMode.diagnostics.map((diagnostic) => ({
        level: diagnostic.level,
        code: diagnostic.code,
        message: diagnostic.message,
      } satisfies OcrDiagnostic)),
      ...batchPlan.diagnostics.map((diagnostic) => ({
        level: diagnostic.level,
        code: diagnostic.code,
        message: diagnostic.message,
      } satisfies OcrDiagnostic)),
    ],
  });

  emitDiagnostic({
    level: 'info',
    code: 'OCR_FINAL_RESULT_MERGED',
    message: `${merged.pages.length} OCR page result(s) merged.`,
  });

  return {
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    mode: batchPlan.resolvedMode.effectiveMode,
    batchPlan,
    result: {
      ...merged,
      diagnostics: [
        ...merged.diagnostics,
        ...mapFinalDiagnosticsToOcrDiagnostics(diagnostics),
      ],
    },
    diagnostics,
    batchSnapshot: batchRun.snapshot,
  };
}

function assertPersistedResultsCoverCompletedTasks(
  tasks: OcrBatchTask<OcrEnginePageInput[]>[],
  existingResult: OcrDocumentResult | null,
  expected: {
    documentFingerprint: string;
    engineId: string;
    profileId: OcrProfileId;
  },
): void {
  const completedPageIndexes = new Set(
    tasks
      .filter((task) => task.status === 'completed')
      .flatMap((task) => task.pageIndexes),
  );

  if (completedPageIndexes.size === 0) return;

  if (!existingResult) {
    throw new Error(
      'OCR resume state preserves completed batches but no persisted OCR result is available.',
    );
  }

  if (
    existingResult.documentFingerprint !== expected.documentFingerprint
    || existingResult.engineId !== expected.engineId
    || existingResult.profileId !== expected.profileId
  ) {
    throw new Error(
      'OCR persisted result does not match the resume document/engine/profile configuration.',
    );
  }

  const persistedPageIndexes = new Set(
    existingResult.pages.map((page) => page.pageIndex),
  );

  const missing = [...completedPageIndexes].filter(
    (pageIndex) => !persistedPageIndexes.has(pageIndex),
  );

  if (missing.length > 0) {
    throw new Error(
      `OCR resume state references completed page(s) without persisted OCR results: ${missing.join(', ')}.`,
    );
  }
}

export function mergeOcrDocumentResults(input: {
  documentFingerprint: string;
  engineId: string;
  profileId: OcrProfileId;
  results: OcrDocumentResult[];
  diagnostics?: OcrDiagnostic[];
}): OcrDocumentResult {
  const pagesByIndex = new Map<number, OcrPageResult>();
  const diagnostics: OcrDiagnostic[] = [...(input.diagnostics ?? [])];

  for (const result of input.results) {
    for (const page of result.pages) {
      const pageIdx = page.pageIndex ?? (page.pageNumber - 1);
      pagesByIndex.set(pageIdx, page);
    }

    diagnostics.push(...result.diagnostics);
  }

  const pages = [...pagesByIndex.values()].sort(
    (a, b) => (a.pageIndex ?? (a.pageNumber - 1)) - (b.pageIndex ?? (b.pageNumber - 1)),
  );

  return {
    documentFingerprint: input.documentFingerprint,
    createdAt: new Date().toISOString(),
    engineId: input.engineId,
    profileId: input.profileId,
    pages,
    diagnostics,
  };
}

export function mapFinalDiagnosticsToOcrDiagnostics(
  diagnostics: OcrFinalIntegrationDiagnostic[],
): OcrDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    level: diagnostic.level,
    code: diagnostic.code,
    message: diagnostic.message,
  }));
}
