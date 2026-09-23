import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { OcrPipelineMode } from './ocrPipelineMode';
import {
  createPlaceholderOcrPageInputs,
  resolveOcrPipelineMode,
  type OcrPipelineCapabilities,
  type ResolvedOcrPipelineMode,
} from './ocrPipelineMode';
import {
  rasterizeForOcrWithOptionalWorker,
} from './ocrWorkerRasterBridge';
import {
  createOcrBatchTasksFromPages,
  type OcrBatchTask,
} from './ocrBatchScheduler';
import type { OcrRasterWorkerClient } from './workers/ocrRasterWorkerClient';
import type { OcrRasterWorkerProgressPayload } from './workers/ocrRasterWorkerTypes';

export type OcrPipelineRasterPlanKind =
  | 'explicit-pages'
  | 'placeholder-pages'
  | 'main-thread-raster'
  | 'worker-raster';

export interface OcrPipelineBatchPlannerInput {
  mode: OcrPipelineMode;
  capabilities?: Partial<OcrPipelineCapabilities>;

  pdfBytes?: Uint8Array | null;
  explicitPages?: OcrEnginePageInput[];

  pageIndexes: number[];
  /**
   * Pages proven complete by a validated resume checkpoint. These retain
   * batch topology using inert placeholder inputs but are not rasterized.
   */
  deferredPageIndexes?: number[];
  batchSize: number;

  rasterScale: number;
  maxCanvasPixels: number;

  rasterWorkerClient?: Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;
  signal?: AbortSignal;
  onRasterProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
}

export interface OcrPipelineBatchPlan {
  resolvedMode: ResolvedOcrPipelineMode;
  rasterPlanKind: OcrPipelineRasterPlanKind;
  pageInputs: OcrEnginePageInput[];
  batchTasks: OcrBatchTask<OcrEnginePageInput[]>[];
  diagnostics: OcrPipelineBatchPlannerDiagnostic[];
}

export interface OcrPipelineBatchPlannerDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_PIPELINE_BATCH_READY'
    | 'OCR_PIPELINE_BATCH_EMPTY'
    | 'OCR_PIPELINE_EXPLICIT_PAGES_USED'
    | 'OCR_PIPELINE_PLACEHOLDER_PAGES_USED'
    | 'OCR_PIPELINE_MAIN_RASTER_USED'
    | 'OCR_PIPELINE_WORKER_RASTER_USED'
    | 'OCR_PIPELINE_RESUME_PAGES_DEFERRED'
    | 'OCR_PIPELINE_BATCH_SIZE_NORMALIZED';
  message: string;
}

export async function createOcrPipelineBatchPlan(
  input: OcrPipelineBatchPlannerInput,
): Promise<OcrPipelineBatchPlan> {
  const resolvedMode = resolveOcrPipelineMode({
    requestedMode: input.mode,
    capabilities: input.capabilities,
  });

  const diagnostics: OcrPipelineBatchPlannerDiagnostic[] = [];
  const pageIndexes = normalizePipelinePageIndexes(input.pageIndexes);
  const batchSize = normalizeBatchSize(input.batchSize);

  if (batchSize !== input.batchSize) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_BATCH_SIZE_NORMALIZED',
      message: `OCR batch size normalized to ${batchSize}.`,
    });
  }

  if (pageIndexes.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'OCR_PIPELINE_BATCH_EMPTY',
      message: 'No OCR pages are available for pipeline batch planning.',
    });

    return {
      resolvedMode,
      rasterPlanKind: 'placeholder-pages',
      pageInputs: [],
      batchTasks: [],
      diagnostics,
    };
  }

  const deferredPageIndexes = normalizePipelinePageIndexes(
    input.deferredPageIndexes ?? [],
  ).filter((pageIndex) => pageIndexes.includes(pageIndex));

  const { rasterPlanKind, pageInputs } = await resolvePipelinePageInputsForBatchPlan({
    ...input,
    pageIndexes,
    deferredPageIndexes,
    effectiveMode: resolvedMode.effectiveMode,
  });

  if (deferredPageIndexes.length > 0) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_RESUME_PAGES_DEFERRED',
      message: `${deferredPageIndexes.length} completed OCR page(s) retained in batch topology without rasterization.`,
    });
  }

  if (rasterPlanKind === 'explicit-pages') {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_EXPLICIT_PAGES_USED',
      message: `${pageInputs.length} explicit OCR page input(s) used.`,
    });
  }

  if (rasterPlanKind === 'placeholder-pages') {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PIPELINE_PLACEHOLDER_PAGES_USED',
      message: `${pageInputs.length} placeholder OCR page input(s) used because PDF bytes were unavailable.`,
    });
  }

  if (rasterPlanKind === 'main-thread-raster') {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_MAIN_RASTER_USED',
      message: `${pageInputs.length} OCR page input(s) rasterized on main thread.`,
    });
  }

  if (rasterPlanKind === 'worker-raster') {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_WORKER_RASTER_USED',
      message: `${pageInputs.length} OCR page input(s) rasterized through worker path.`,
    });
  }

  const batchTasks = createOcrBatchTasksFromPages({
    pages: pageInputs,
    batchSize,
    idPrefix: `ocr-pipeline-batch-${Date.now()}`,
  });

  diagnostics.push({
    level: 'info',
    code: 'OCR_PIPELINE_BATCH_READY',
    message: `${batchTasks.length} OCR pipeline batch task(s) created.`,
  });

  return {
    resolvedMode,
    rasterPlanKind,
    pageInputs,
    batchTasks,
    diagnostics,
  };
}

export async function resolvePipelinePageInputsForBatchPlan(
  input: OcrPipelineBatchPlannerInput & {
    pageIndexes: number[];
    deferredPageIndexes?: number[];
    effectiveMode: OcrPipelineMode;
  },
): Promise<{
  rasterPlanKind: OcrPipelineRasterPlanKind;
  pageInputs: OcrEnginePageInput[];
}> {
  const deferred = new Set(input.deferredPageIndexes ?? []);
  const activePageIndexes = input.pageIndexes.filter(
    (pageIndex) => !deferred.has(pageIndex),
  );
  const deferredInputs = createPlaceholderOcrPageInputs(
    input.pageIndexes.filter((pageIndex) => deferred.has(pageIndex)),
  );

  if (input.explicitPages && input.explicitPages.length > 0) {
    const activeInputs = filterExplicitPagesByPageIndexes(
      input.explicitPages,
      activePageIndexes,
    );
    return {
      rasterPlanKind: 'explicit-pages',
      pageInputs: mergePageInputs(activeInputs, deferredInputs),
    };
  }

  if (!input.pdfBytes || activePageIndexes.length === 0) {
    return {
      rasterPlanKind: 'placeholder-pages',
      pageInputs: mergePageInputs(
        createPlaceholderOcrPageInputs(activePageIndexes),
        deferredInputs,
      ),
    };
  }

  const useWorkerRaster = input.effectiveMode === 'worker-raster-worker-ocr';

  const activeInputs = await rasterizeForOcrWithOptionalWorker({
    pdfBytes: input.pdfBytes,
    pageIndexes: activePageIndexes,
    scale: input.rasterScale,
    maxCanvasPixels: input.maxCanvasPixels,
    useWorker: useWorkerRaster,
    workerClient: input.rasterWorkerClient,
    disposeClientAfterRun: false,
    signal: input.signal,
    onProgress: input.onRasterProgress,
  });

  return {
    rasterPlanKind: useWorkerRaster
      ? 'worker-raster'
      : 'main-thread-raster',
    pageInputs: mergePageInputs(activeInputs, deferredInputs),
  };
}

function mergePageInputs(
  active: OcrEnginePageInput[],
  deferred: OcrEnginePageInput[],
): OcrEnginePageInput[] {
  return [...active, ...deferred].sort(
    (left, right) => left.pageIndex - right.pageIndex,
  );
}

export function normalizePipelinePageIndexes(
  pageIndexes: number[],
): number[] {
  return [...new Set(
    pageIndexes.filter((pageIndex) =>
      Number.isInteger(pageIndex) && pageIndex >= 0,
    ),
  )].sort((a, b) => a - b);
}

export function normalizeBatchSize(
  batchSize: number,
): number {
  if (!Number.isFinite(batchSize)) {
    return 1;
  }

  return Math.max(1, Math.floor(batchSize));
}

export function filterExplicitPagesByPageIndexes(
  pages: OcrEnginePageInput[],
  pageIndexes: number[],
): OcrEnginePageInput[] {
  const allowed = new Set(pageIndexes);

  return pages
    .filter((page) => allowed.has(page.pageIndex))
    .sort((a, b) => a.pageIndex - b.pageIndex);
}
