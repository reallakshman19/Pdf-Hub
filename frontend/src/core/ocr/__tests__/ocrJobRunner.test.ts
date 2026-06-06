import { describe, expect, it } from 'vitest';
import type { OcrEngine } from '../engines/ocrEngineContract';
import { createOcrEngineRegistry } from '../engines/ocrEngineRegistry';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { runOcrJob, OcrJobCancelledError } from '../ocrJobRunner';

describe('ocrJobRunner', () => {
  it('runs OCR job with mock engine and completes queued scanned page', async () => {
    const result = await runOcrJob({
      id: 'job-1',
      documentFingerprint: 'doc-job-1',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
    });

    expect(result.job.status).toBe('completed');
    expect(result.job.progress!.completedPages).toBe(1);
    expect(result.job.progress!.failedPages).toBe(0);
    expect(result.result.pages).toHaveLength(1);
    expect(result.result.pages[0].status).toBe('success');
    expect(result.result.pages[0].words?.length ?? 0).toBeGreaterThan(0);
  });

  it('skips born-digital page by default and completes with skipped result', async () => {
    const result = await runOcrJob({
      id: 'job-skip',
      documentFingerprint: 'doc-skip',
      engineId: 'mock',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          embeddedTextLength: 3000,
          imageCount: 0,
        },
      ],
    });

    expect(result.job.status).toBe('completed');
    expect(result.job.progress!.totalPages).toBe(0);
    expect(result.preflight.skippedPageIndexes).toEqual([0]);
    expect(result.result.pages).toHaveLength(1);
    expect(result.result.pages[0].status).toBe('skipped');
  });

  it('forces OCR on born-digital page when forceOcr is true', async () => {
    const result = await runOcrJob({
      id: 'job-force',
      documentFingerprint: 'doc-force',
      engineId: 'mock',
      forceOcr: true,
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          embeddedTextLength: 3000,
          imageCount: 0,
        },
      ],
    });

    expect(result.job.status).toBe('completed');
    expect(result.job.progress!.completedPages).toBe(1);
    expect(result.preflight.queuedPageIndexes).toEqual([0]);
    expect(result.result.pages[0].status).toBe('success');
  });

  it('honors selectedPageIndexes', async () => {
    const result = await runOcrJob({
      id: 'job-selected',
      documentFingerprint: 'doc-selected',
      engineId: 'mock',
      selectedPageIndexes: [1],
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
    });

    expect(result.preflight.queuedPageIndexes).toEqual([1]);
    expect(result.preflight.skippedPageIndexes).toEqual([0]);
    expect(result.job.status).toBe('completed');
    expect(result.job.progress!.completedPages).toBe(1);
    expect(result.result.pages.map((page) => page.pageIndex)).toEqual([0, 1]);
    expect(result.result.pages[0].status).toBe('skipped');
    expect(result.result.pages[1].status).toBe('success');
  });

  it('emits progress snapshots during job execution', async () => {
    const snapshots: string[] = [];

    const result = await runOcrJob({
      id: 'job-progress',
      documentFingerprint: 'doc-progress',
      engineId: 'mock',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
      onProgress: (snapshot) => {
        snapshots.push(
          `${snapshot.job.status}:${snapshot.job.progress!.completedPages}:${snapshot.job.progress!.failedPages}`,
        );
      },
    });

    expect(result.job.status).toBe('completed');
    expect(snapshots.length).toBeGreaterThanOrEqual(4);
    expect(snapshots.some((item) => item.startsWith('running:'))).toBe(true);
    expect(snapshots[snapshots.length - 1]).toBe('completed:2:0');
  });

  it('returns failed job when engine is missing', async () => {
    const result = await runOcrJob({
      id: 'job-missing-engine',
      documentFingerprint: 'doc-missing-engine',
      engineId: 'missing',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
    });

    expect(result.job.status).toBe('failed');
    expect(result.result.diagnostics.some((item) => item.code === 'OCR_ENGINE_FAILED')).toBe(true);
  });

  it('marks job partial when one page engine call fails', async () => {
    const failingEngine: OcrEngine = {
      id: 'fail-on-page-1',
      label: 'Fail on page 1',
      supportsTables: false,
      supportsLayout: true,
      supportsSearchablePdf: false,
      async recognize(input) {
        const page = input.pages[0];

        if (page.pageIndex === 1) {
          throw new Error('Synthetic page failure.');
        }

        return mockOcrEngine.recognize(input);
      },
    };

    const registry = createOcrEngineRegistry([
      mockOcrEngine,
      failingEngine,
    ]);

    const result = await runOcrJob({
      id: 'job-partial',
      documentFingerprint: 'doc-partial',
      engineId: 'fail-on-page-1',
      registry,
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
    });

    expect(result.job.status).toBe('partial');
    expect(result.job.progress!.completedPages).toBe(1);
    expect(result.job.progress!.failedPages).toBe(1);
    expect(result.result.pages.find((page) => page.pageIndex === 1)?.status).toBe('failed');
    expect(result.result.diagnostics.some((item) => item.message.includes('Synthetic page failure'))).toBe(true);
  });

  it('throws cancellation error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runOcrJob({
        id: 'job-cancelled',
        documentFingerprint: 'doc-cancelled',
        engineId: 'mock',
        signal: controller.signal,
        pages: [
          {
            pageIndex: 0,
            imageBytes: new Uint8Array([1, 2, 3]),
            width: 595,
            height: 842,
            imageCount: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(OcrJobCancelledError);
  });

  it('uses table-heavy profile for table-like page decisions', async () => {
    const result = await runOcrJob({
      id: 'job-table',
      documentFingerprint: 'doc-table',
      engineId: 'mock',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          detectedGridLikeRegions: 2,
        },
      ],
    });

    expect(result.preflight.pageDecisions[0].action).toBe('ocr-table');
    expect(result.preflight.pageDecisions[0].profile.id).toBe('table-heavy');
    expect(result.result.pages[0].blocks.some((block) => block.type === 'table')).toBe(true);
  });
});
