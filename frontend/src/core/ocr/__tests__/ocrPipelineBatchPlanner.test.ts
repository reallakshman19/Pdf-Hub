import {
  describe,
  expect,
  it,
} from 'vitest';
import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import type { OcrRasterWorkerClient } from '../workers/ocrRasterWorkerClient';
import {
  createOcrPipelineBatchPlan,
  filterExplicitPagesByPageIndexes,
  normalizeBatchSize,
  normalizePipelinePageIndexes,
  resolvePipelinePageInputsForBatchPlan,
} from '../ocrPipelineBatchPlanner';

describe('ocrPipelineBatchPlanner', () => {
  it('normalizes page indexes', () => {
    expect(
      normalizePipelinePageIndexes([3, 1, 1, -1, 0, 2]),
    ).toEqual([0, 1, 2, 3]);
  });

  it('normalizes batch size', () => {
    expect(normalizeBatchSize(0)).toBe(1);
    expect(normalizeBatchSize(2.9)).toBe(2);
    expect(normalizeBatchSize(Number.NaN)).toBe(1);
  });

  it('filters explicit pages by requested page indexes', () => {
    const pages = makePages([2, 0, 1]);

    const filtered = filterExplicitPagesByPageIndexes(pages, [1, 2]);

    expect(filtered.map((page) => page.pageIndex)).toEqual([1, 2]);
  });

  it('creates plan using explicit pages', async () => {
    const plan = await createOcrPipelineBatchPlan({
      mode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      explicitPages: makePages([0, 1, 2]),
      pageIndexes: [0, 1, 2],
      batchSize: 2,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    });

    expect(plan.rasterPlanKind).toBe('explicit-pages');
    expect(plan.pageInputs).toHaveLength(3);
    expect(plan.batchTasks).toHaveLength(2);
    expect(plan.batchTasks[0].pageIndexes).toEqual([0, 1]);
    expect(plan.batchTasks[1].pageIndexes).toEqual([2]);
    expect(plan.diagnostics.some((item) => item.code === 'OCR_PIPELINE_EXPLICIT_PAGES_USED')).toBe(true);
  });

  it('creates placeholder plan when pdfBytes are absent', async () => {
    const plan = await createOcrPipelineBatchPlan({
      mode: 'main',
      pageIndexes: [0, 1],
      batchSize: 1,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    });

    expect(plan.rasterPlanKind).toBe('placeholder-pages');
    expect(plan.pageInputs).toHaveLength(2);
    expect(plan.batchTasks).toHaveLength(2);
    expect(plan.diagnostics.some((item) => item.code === 'OCR_PIPELINE_PLACEHOLDER_PAGES_USED')).toBe(true);
  });

  it('returns empty error plan when no pages are supplied', async () => {
    const plan = await createOcrPipelineBatchPlan({
      mode: 'main',
      pageIndexes: [],
      batchSize: 1,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    });

    expect(plan.pageInputs).toHaveLength(0);
    expect(plan.batchTasks).toHaveLength(0);
    expect(plan.diagnostics.some((item) => item.code === 'OCR_PIPELINE_BATCH_EMPTY')).toBe(true);
  });

  it('uses worker raster path for full worker pipeline', async () => {
    const rasterClient = {
      async rasterizePages(payload) {
        expect(payload.pageIndexes).toEqual([0, 1]);
        expect(payload.scale).toBe(3);

        return makePages([0, 1]);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const pageInputs = await resolvePipelinePageInputsForBatchPlan({
      mode: 'worker-raster-worker-ocr',
      effectiveMode: 'worker-raster-worker-ocr',
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndexes: [0, 1],
      batchSize: 2,
      rasterScale: 3,
      maxCanvasPixels: 24_000_000,
      rasterWorkerClient: rasterClient,
    });

    expect(pageInputs.rasterPlanKind).toBe('worker-raster');
    expect(pageInputs.pageInputs.map((page) => page.pageIndex)).toEqual([0, 1]);
  });

  it('does not rasterize deferred completed resume pages', async () => {
    const rasterRequests: number[][] = [];
    const rasterClient = {
      async rasterizePages(payload) {
        rasterRequests.push([...payload.pageIndexes]);
        return makePages(payload.pageIndexes);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const plan = await createOcrPipelineBatchPlan({
      mode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndexes: [0, 1, 2, 3],
      deferredPageIndexes: [0, 1],
      batchSize: 2,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
      rasterWorkerClient: rasterClient,
    });

    expect(rasterRequests).toEqual([[2, 3]]);
    expect(plan.pageInputs.map((page) => page.pageIndex)).toEqual([0, 1, 2, 3]);
    expect(plan.batchTasks[0].pageIndexes).toEqual([0, 1]);
    expect(plan.batchTasks[1].pageIndexes).toEqual([2, 3]);
    expect(
      plan.diagnostics.some(
        (item) => item.code === 'OCR_PIPELINE_RESUME_PAGES_DEFERRED',
      ),
    ).toBe(true);
  });

  it('creates full worker-raster batch plan using worker raster client', async () => {
    const rasterClient = {
      async rasterizePages(payload, options) {
        options?.onProgress?.({
          status: 'running',
          completedPages: 0,
          totalPages: payload.pageIndexes.length,
          message: 'Worker raster started.',
        });

        return makePages(payload.pageIndexes);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const progress: string[] = [];

    const plan = await createOcrPipelineBatchPlan({
      mode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndexes: [0, 1, 2, 3],
      batchSize: 2,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
      rasterWorkerClient: rasterClient,
      onRasterProgress: (item) => {
        progress.push(item.message ?? '');
      },
    });

    expect(plan.resolvedMode.effectiveMode).toBe('worker-raster-worker-ocr');
    expect(plan.rasterPlanKind).toBe('worker-raster');
    expect(plan.pageInputs).toHaveLength(4);
    expect(plan.batchTasks).toHaveLength(2);
    expect(progress).toEqual(['Worker raster started.']);
    expect(plan.diagnostics.some((item) => item.code === 'OCR_PIPELINE_WORKER_RASTER_USED')).toBe(true);
  });

  it('falls back to non-worker raster kind when worker capability is unavailable', async () => {
    const plan = await createOcrPipelineBatchPlan({
      mode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: false,
        ocrWorkerSupported: false,
        rasterWorkerSupported: false,
      },
      explicitPages: makePages([0]),
      pageIndexes: [0],
      batchSize: 1,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    });

    expect(plan.resolvedMode.effectiveMode).toBe('main');
    expect(plan.rasterPlanKind).toBe('explicit-pages');
    expect(plan.resolvedMode.diagnostics.some((item) => item.level === 'warning')).toBe(true);
  });
});

function makePages(pageIndexes: number[]): OcrEnginePageInput[] {
  return pageIndexes.map((pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([pageIndex + 1]),
    width: 595,
    height: 842,
    imageCount: 1,
  }));
}
