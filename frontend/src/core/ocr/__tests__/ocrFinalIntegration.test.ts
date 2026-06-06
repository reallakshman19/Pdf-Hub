import {
  describe,
  expect,
  it,
} from 'vitest';
import type { OcrDocumentResult } from '../types';
import type { OcrWorkerClient } from '../workers/ocrWorkerClient';
import type { OcrRasterWorkerClient } from '../workers/ocrRasterWorkerClient';
import {
  createOcrExecutionPolicy,
} from '../ocrExecutionPolicy';
import {
  createPlaceholderOcrPageInputs,
} from '../ocrPipelineMode';
import {
  mapFinalDiagnosticsToOcrDiagnostics,
  mergeOcrDocumentResults,
  runFinalOcrIntegrationJob,
} from '../ocrFinalIntegration';

describe('ocrFinalIntegration', () => {
  it('merges OCR document results by page index', () => {
    const merged = mergeOcrDocumentResults({
      documentFingerprint: 'doc-final',
      engineId: 'mock',
      profileId: 'clean-scan',
      results: [
        makeResult('doc-final', [2]),
        makeResult('doc-final', [0, 1]),
      ],
    });

    expect(merged.documentFingerprint).toBe('doc-final');
    expect(merged.pages.map((page) => page.pageIndex)).toEqual([0, 1, 2]);
  });

  it('maps final diagnostics to OCR diagnostics', () => {
    const diagnostics = mapFinalDiagnosticsToOcrDiagnostics([
      {
        level: 'info',
        code: 'OCR_FINAL_RESULT_MERGED',
        message: 'Merged.',
      },
    ]);

    expect(diagnostics).toEqual([
      {
        level: 'info',
        code: 'OCR_FINAL_RESULT_MERGED',
        message: 'Merged.',
      },
    ]);
  });

  it('runs final integration job with explicit pages and worker OCR', async () => {
    const workerClient = makeWorkerClient();

    const diagnostics: string[] = [];
    const batchStatuses: string[] = [];

    const result = await runFinalOcrIntegrationJob({
      id: 'final-job-1',
      documentFingerprint: 'doc-final',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      mode: 'worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      explicitPages: createPlaceholderOcrPageInputs([0, 1, 2]),
      requestedPageIndexes: [0, 1, 2],
      totalPages: 3,
      policy: createOcrExecutionPolicy({
        maxPagesPerJob: 5,
      }),
      batchSize: 2,
      workerClient,
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic.code);
      },
      onBatchSnapshot: (snapshot) => {
        batchStatuses.push(snapshot.status);
      },
    });

    expect(result.mode).toBe('worker-ocr');
    expect(result.result.documentFingerprint).toBe('doc-final');
    expect(result.result.pages.map((page) => page.pageIndex)).toEqual([0, 1, 2]);
    expect(result.batchPlan.batchTasks).toHaveLength(2);
    expect(result.batchSnapshot.status).toBe('completed');
    expect(diagnostics).toContain('OCR_FINAL_EXECUTION_PLAN_READY');
    expect(diagnostics).toContain('OCR_FINAL_RESULT_MERGED');
    expect(batchStatuses.length).toBeGreaterThan(0);
  });

  it('runs final integration job with worker raster and worker OCR', async () => {
    const rasterClient = {
      async rasterizePages(payload) {
        return createPlaceholderOcrPageInputs(payload.pageIndexes);
      },
      dispose() {
        return undefined;
      },
    } satisfies Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

    const workerClient = makeWorkerClient();

    const result = await runFinalOcrIntegrationJob({
      id: 'final-job-worker-raster',
      documentFingerprint: 'doc-final-raster',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      mode: 'worker-raster-worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      pdfBytes: new Uint8Array([1, 2, 3]),
      requestedPageIndexes: [0, 1],
      totalPages: 2,
      policy: createOcrExecutionPolicy({
        rasterScale: 2,
        maxPagesPerJob: 5,
      }),
      batchSize: 1,
      rasterWorkerClient: rasterClient,
      workerClient,
    });

    expect(result.mode).toBe('worker-raster-worker-ocr');
    expect(result.batchPlan.rasterPlanKind).toBe('worker-raster');
    expect(result.result.pages.map((page) => page.pageIndex)).toEqual([0, 1]);
  });

  it('applies execution page limit before batching', async () => {
    const result = await runFinalOcrIntegrationJob({
      id: 'final-job-limit',
      documentFingerprint: 'doc-final-limit',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      mode: 'worker-ocr',
      capabilities: {
        workerSupported: true,
        ocrWorkerSupported: true,
        rasterWorkerSupported: true,
      },
      explicitPages: createPlaceholderOcrPageInputs([0, 1, 2]),
      requestedPageIndexes: [0, 1, 2],
      totalPages: 3,
      policy: createOcrExecutionPolicy({
        maxPagesPerJob: 2,
        allowLargeJobs: false,
      }),
      batchSize: 2,
      workerClient: makeWorkerClient(),
    });

    expect(result.result.pages.map((page) => page.pageIndex)).toEqual([0, 1]);
    expect(result.batchPlan.batchTasks).toHaveLength(1);
  });

  it('throws when execution plan has no valid pages', async () => {
    await expect(
      runFinalOcrIntegrationJob({
        id: 'final-job-empty',
        documentFingerprint: 'doc-empty',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        mode: 'worker-ocr',
        explicitPages: [],
        requestedPageIndexes: [-1],
        totalPages: 1,
        policy: createOcrExecutionPolicy(),
        workerClient: makeWorkerClient(),
      }),
    ).rejects.toThrow('No valid OCR pages were selected');
  });
});

function makeWorkerClient(): Pick<OcrWorkerClient, 'recognizePages' | 'dispose'> {
  return {
    async recognizePages(payload, options) {
      options?.onProgress?.({
        status: 'running',
        completedPages: 0,
        totalPages: payload.pages.length,
        message: 'Worker OCR running.',
      });

      return makeResult(
        payload.documentFingerprint,
        payload.pages.map((page) => page.pageIndex),
      );
    },
    dispose() {
      return undefined;
    },
  };
}

function makeResult(
  documentFingerprint: string,
  pageIndexes: number[],
 ): OcrDocumentResult {
  return {
    documentFingerprint,
    createdAt: '2026-01-01T00:00:00.000Z',
    engineId: 'mock',
    profileId: 'clean-scan',
    pages: pageIndexes.map((pageIndex) => makePage(pageIndex)),
    diagnostics: [],
  };
}

function makePage(pageIndex: number) {
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    status: 'success' as const,
    pageType: 'scanned' as const,
    orientationDeg: 0,
    languageHints: ['eng'],
    width: 595,
    height: 842,
    words: [],
    lines: [],
    blocks: [],
    diagnostics: [],
  };
}
