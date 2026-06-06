import {
  describe,
  expect,
  it,
} from 'vitest';
import type { OcrDocumentResult } from '../types';
import type { OcrWorkerClient } from '../workers/ocrWorkerClient';
import type { OcrRasterWorkerClient } from '../workers/ocrRasterWorkerClient';
import {
  createPlaceholderOcrPageInputs,
  getOcrPipelineModeOption,
  resolveOcrPipelineMode,
  resolveOcrPipelinePageInputs,
  runOcrPipeline,
} from '../ocrPipelineMode';

describe('ocrPipelineMode', () => {
  it('returns pipeline option metadata', () => {
    expect(getOcrPipelineModeOption('main').label).toBe('Main thread');
    expect(getOcrPipelineModeOption('worker-ocr').usesWorkerOcr).toBe(true);
    expect(getOcrPipelineModeOption('worker-raster-worker-ocr').usesWorkerRaster).toBe(true);
  });

  it('resolves main mode as-is', () => {
    const resolved = resolveOcrPipelineMode({
      requestedMode: 'main',
      capabilities: {
        workerSupported: false,
        ocrWorkerSupported: false,
        rasterWorkerSupported: false,
      },
    });

    expect(resolved.effectiveMode).toBe('main');
    expect(resolved.diagnostics.some((item) => item.code === 'OCR_PIPELINE_MODE_READY')).toBe(true);
  });

  it('falls back when OCR worker is unavailable', () => {
    const resolved = resolveOcrPipelineMode({
      requestedMode: 'worker-ocr',
      capabilities: {
        workerSupported: false,
        ocrWorkerSupported: false,
        rasterWorkerSupported: false,
      },
    });

    expect(resolved.effectiveMode).toBe('main');
    expect(resolved.diagnostics.some((item) => item.code === 'OCR_PIPELINE_WORKER_UNAVAILABLE')).toBe(true);
  });

  it('falls back from full worker mode when raster worker is unavailable', () => {
    const resolved = resolveOcrPipelineMode({
      requestedMode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: false,
      },
    });

    expect(resolved.effectiveMode).toBe('worker-ocr');
    expect(resolved.diagnostics.some((item) => item.code === 'OCR_PIPELINE_RASTER_WORKER_UNAVAILABLE')).toBe(true);
  });

  it('creates placeholder page inputs', () => {
    const pages = createPlaceholderOcrPageInputs([0, 2]);

    expect(pages).toHaveLength(2);
    expect(pages[0].pageIndex).toBe(0);
    expect(pages[1].pageIndex).toBe(2);
    expect(pages[0].width).toBe(595);
  });

  it('uses explicit pages before rasterization', async () => {
    const explicitPages = createPlaceholderOcrPageInputs([0]);

    const pages = await resolveOcrPipelinePageInputs(
      {
        id: 'pipeline-test',
        documentFingerprint: 'doc-pipeline',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        mode: 'worker-raster-worker-ocr',
        explicitPages,
        pageIndexes: [0],
        rasterScale: 2,
        maxCanvasPixels: 16_000_000,
      },
      'worker-raster-worker-ocr',
    );

    expect(pages).toBe(explicitPages);
  });

  it('uses raster worker client when full worker pipeline resolves page inputs', async () => {
    const rasterClient = {
      async rasterizePages(payload) {
        expect(payload.pageIndexes).toEqual([0, 1]);
        return createPlaceholderOcrPageInputs([0, 1]);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const pages = await resolveOcrPipelinePageInputs(
      {
        id: 'pipeline-raster-worker',
        documentFingerprint: 'doc-pipeline',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        mode: 'worker-raster-worker-ocr',
        pdfBytes: new Uint8Array([1, 2, 3]),
        pageIndexes: [0, 1],
        rasterScale: 2,
        maxCanvasPixels: 16_000_000,
        rasterWorkerClient: rasterClient,
      },
      'worker-raster-worker-ocr',
    );

    expect(pages).toHaveLength(2);
    expect(pages[1].pageIndex).toBe(1);
  });

  it('runs worker OCR pipeline with fake worker client', async () => {
    const workerClient = {
      async recognizePages(payload, options) {
        expect(payload.engineId).toBe('mock');

        options?.onProgress?.({
          status: 'running',
          completedPages: 0,
          totalPages: payload.pages.length,
          message: 'Worker OCR running.',
        });

        return makeOcrResult(payload.documentFingerprint);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrWorkerClient, 'recognizePages' | 'dispose'>;

    const messages: string[] = [];

    const result = await runOcrPipeline({
      id: 'pipeline-worker-ocr',
      documentFingerprint: 'doc-pipeline',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      mode: 'worker-ocr',
      explicitPages: createPlaceholderOcrPageInputs([0]),
      pageIndexes: [0],
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
      workerClient,
      capabilities: {
        ocrWorkerSupported: true,
      },
      onProgress: (snapshot) => {
        messages.push(snapshot.job.status);
      },
    });

    expect(result.mode.effectiveMode).toBe('worker-ocr');
    expect(result.result.documentFingerprint).toBe('doc-pipeline');
    expect(messages).toContain('running');
  });
});

function makeOcrResult(documentFingerprint: string): OcrDocumentResult {
  return {
    documentFingerprint,
    createdAt: '2026-01-01T00:00:00.000Z',
    engineId: 'mock',
    profileId: 'clean-scan',
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        status: 'success',
        pageType: 'scanned',
        orientationDeg: 0,
        languageHints: ['eng'],
        width: 595,
        height: 842,
        words: [],
        lines: [],
        blocks: [],
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
}
