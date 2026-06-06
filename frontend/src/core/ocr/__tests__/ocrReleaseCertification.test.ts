import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PDFDocument,
} from 'pdf-lib';
import {
  createOcrExecutionPolicy,
} from '../ocrExecutionPolicy';
import {
  createOcrPipelineBatchPlan,
} from '../ocrPipelineBatchPlanner';
import {
  createPlaceholderOcrPageInputs,
  resolveOcrPipelineMode,
  runOcrPipeline,
} from '../ocrPipelineMode';
import {
  createOcrProjectPayload,
  validateOcrProjectPayload,
} from '../ocrProjectCodec';
import {
  hydrateOcrStoreFromProjectPayload,
} from '../ocrHydrationBridge';
import {
  exportSearchableOcrPdf,
} from '../ocrSearchablePdfExport';
import {
  createLegacyOcrLaunchPlan,
} from '../legacyOcrCompat';
import {
  useOcrStore,
} from '../ocrStore';
import type {
  OcrDocumentResult,
} from '../types';
import type {
  OcrWorkerClient,
} from '../workers/ocrWorkerClient';
import type {
  OcrRasterWorkerClient,
} from '../workers/ocrRasterWorkerClient';

describe('ocrReleaseCertification', () => {
  it('certifies pipeline mode fallback rules', () => {
    expect(
      resolveOcrPipelineMode({
        requestedMode: 'main',
        capabilities: {
          workerSupported: false,
          ocrWorkerSupported: false,
          rasterWorkerSupported: false,
        },
      }).effectiveMode,
    ).toBe('main');

    expect(
      resolveOcrPipelineMode({
        requestedMode: 'worker-ocr',
        capabilities: {
          workerSupported: false,
          ocrWorkerSupported: false,
          rasterWorkerSupported: false,
        },
      }).effectiveMode,
    ).toBe('main');

    expect(
      resolveOcrPipelineMode({
        requestedMode: 'worker-raster-worker-ocr',
        capabilities: {
          workerSupported: true,
          ocrWorkerSupported: true,
          rasterWorkerSupported: false,
        },
      }).effectiveMode,
    ).toBe('worker-ocr');
  });

  it('certifies pre-batch worker raster planning', async () => {
    const rasterClient = {
      async rasterizePages(payload) {
        expect(payload.pageIndexes).toEqual([0, 1, 2]);
        return createPlaceholderOcrPageInputs(payload.pageIndexes);
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
      pageIndexes: [0, 1, 2],
      batchSize: 2,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
      rasterWorkerClient: rasterClient as unknown as OcrRasterWorkerClient,
    });

    expect(plan.resolvedMode.effectiveMode).toBe('worker-raster-worker-ocr');
    expect(plan.rasterPlanKind).toBe('worker-raster');
    expect(plan.batchTasks).toHaveLength(2);
    expect(plan.batchTasks[0].pageIndexes).toEqual([0, 1]);
    expect(plan.batchTasks[1].pageIndexes).toEqual([2]);
  });

  it('certifies worker OCR pipeline execution with fake worker client', async () => {
    const workerClient = {
      async recognizePages(payload, options) {
        options?.onProgress?.({
          status: 'running',
          completedPages: 0,
          totalPages: payload.pages.length,
          message: 'release worker running',
        });

        return makeOcrResult(payload.documentFingerprint, payload.pages.map((page) => page.pageIndex));
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrWorkerClient, 'recognizePages' | 'dispose'>;

    const messages: string[] = [];

    const result = await runOcrPipeline({
      id: 'release-worker-pipeline',
      documentFingerprint: 'doc-release',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      mode: 'worker-ocr',
      explicitPages: createPlaceholderOcrPageInputs([0, 1]),
      pageIndexes: [0, 1],
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
      workerClient: workerClient as unknown as OcrWorkerClient,
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      onProgress: (snapshot) => {
        if (snapshot.message) {
          messages.push(snapshot.message);
        }
      },
    });

    expect(result.mode.effectiveMode).toBe('worker-ocr');
    expect(result.result.documentFingerprint).toBe('doc-release');
    expect(result.result.pages).toHaveLength(2);
    expect(messages).toContain('release worker running');
  });

  it('certifies OCR project payload validation and hydration', () => {
    useOcrStore.getState().clearOcr();

    const result = makeOcrResult('doc-project', [0, 1]);

    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-project',
      result,
      corrections: [],
      regions: [],
      writerInsertionQueue: {
        candidates: [],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(true);

    const hydrated = hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint: 'doc-project',
    });

    expect(hydrated.restored).toBe(true);
    expect(useOcrStore.getState().result?.documentFingerprint).toBe('doc-project');
    expect(useOcrStore.getState().searchIndex).not.toBeNull();
  });

  it('certifies searchable OCR PDF export creates valid PDF bytes', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const pdfBytes = await pdf.save({
      useObjectStreams: false,
    });

    const result = makeOcrResultWithWords('doc-searchable');

    const exported = await exportSearchableOcrPdf({
      pdfBytes,
      ocrResult: result,
      layerMode: 'word',
      visibilityMode: 'invisible',
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBeGreaterThan(0);
    expect(exported.bytes.length).toBeGreaterThan(pdfBytes.length);
    expect(exported.diagnostics.some((item) => item.code === 'OCR_TEXT_LAYER_ADDED')).toBe(true);

    const loaded = await PDFDocument.load(exported.bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('certifies execution policy browser-safe defaults', () => {
    const policy = createOcrExecutionPolicy();

    expect(policy.preset).toBe('balanced');
    expect(policy.rasterScale).toBeGreaterThan(0);
    expect(policy.maxPagesPerJob).toBeGreaterThan(0);
    expect(policy.maxCanvasPixels).toBeGreaterThan(1_000_000);
    expect(policy.timeoutMs).toBeGreaterThanOrEqual(5_000);
  });

  it('certifies legacy preview OCR is blocked', () => {
    const plan = createLegacyOcrLaunchPlan({
      documentKey: 'doc-legacy',
      pageNumbers: [1, 2],
      now: 123,
    });

    expect(plan.allowed).toBe(false);
    expect(plan.job.status).toBe('cancelled');
    expect(plan.diagnostics.some((item) => item.code === 'LEGACY_OCR_RETIRED')).toBe(true);
  });
});

function makeOcrResult(
  documentFingerprint: string,
  pageIndexes: number[],
): OcrDocumentResult {
  return {
    documentFingerprint,
    createdAt: '2026-01-01T00:00:00.000Z',
    engineId: 'mock',
    profileId: 'clean-scan',
    pages: pageIndexes.map((pageIndex) => ({
      pageIndex,
      pageNumber: pageIndex + 1,
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
    })),
    diagnostics: [],
  };
}

function makeOcrResultWithWords(
  documentFingerprint: string,
): OcrDocumentResult {
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
        words: [
          {
            id: 'word-1',
            pageIndex: 0,
            text: 'Searchable',
            normalizedText: 'searchable',
            confidence: 0.99,
            bbox: {
              x: 72,
              y: 720,
              width: 80,
              height: 16,
            },
          },
          {
            id: 'word-2',
            pageIndex: 0,
            text: 'PDF',
            normalizedText: 'pdf',
            confidence: 0.98,
            bbox: {
              x: 160,
              y: 720,
              width: 36,
              height: 16,
            },
          },
        ],
        lines: [
          {
            id: 'line-1',
            pageIndex: 0,
            text: 'Searchable PDF',
            confidence: 0.98,
            bbox: {
              x: 72,
              y: 720,
              width: 124,
              height: 16,
            },
            wordIds: ['word-1', 'word-2'],
          },
        ],
        blocks: [
          {
            id: 'block-1',
            type: 'paragraph',
            pageIndex: 0,
            bbox: {
              x: 72,
              y: 720,
              width: 124,
              height: 16,
            },
            rect: {
              x: 72,
              y: 720,
              width: 124,
              height: 16,
            },
            text: 'Searchable PDF',
            confidence: 0.98,
            lineIds: ['line-1'],
            wordIds: ['word-1', 'word-2'],
          },
        ],
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
}
