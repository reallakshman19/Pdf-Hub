import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  OcrDocumentResult,
} from '../types';
import type {
  OcrWorkerClient,
} from '../workers/ocrWorkerClient';
import {
  runWorkerOcrJob,
  workerProgressStatusToJobStatus,
  workerProgressToOcrJobSnapshot,
} from '../ocrWorkerJobRunner';

describe('ocrWorkerJobRunner', () => {
  it('maps worker progress status to OCR job status', () => {
    expect(workerProgressStatusToJobStatus('queued')).toBe('running');
    expect(workerProgressStatusToJobStatus('running')).toBe('running');
    expect(workerProgressStatusToJobStatus('page-completed')).toBe('running');
    expect(workerProgressStatusToJobStatus('completed')).toBe('completed');
    expect(workerProgressStatusToJobStatus('failed')).toBe('failed');
    expect(workerProgressStatusToJobStatus('cancelled')).toBe('cancelled');
  });

  it('maps worker progress payload to OCR job snapshot', () => {
    const snapshot = workerProgressToOcrJobSnapshot({
      id: 'worker-job-1',
      documentFingerprint: 'doc-worker-job',
      progress: {
        status: 'page-completed',
        completedPages: 1,
        totalPages: 2,
        activePageIndex: 0,
        message: 'Page completed.',
      },
    });

    expect(snapshot.job.id).toBe('worker-job-1');
    expect(snapshot.job.documentFingerprint).toBe('doc-worker-job');
    expect(snapshot.job.status).toBe('running');
    expect(snapshot.job.progress?.completedPages).toBe(1);
    expect(snapshot.job.progress?.totalPages).toBe(2);
    const progressVal = snapshot.job.progress ? (snapshot.job.progress.completedPages / snapshot.job.progress.totalPages) : 0;
    expect(progressVal).toBe(0.5);
  });

  it('runs worker OCR job and emits snapshots', async () => {
    const snapshots: string[] = [];

    const client = makeFakeWorkerClient({
      result: makeOcrResult(),
    });

    const result = await runWorkerOcrJob({
      id: 'worker-job-1',
      documentFingerprint: 'doc-worker-job',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
      workerClient: client,
      onProgress: (snapshot) => {
        snapshots.push(snapshot.job.status);
      },
    });

    expect(result.jobId).toBe('worker-job-1');
    expect(result.result.pages).toHaveLength(1);
    expect(snapshots).toContain('running');
    expect(snapshots).toContain('completed');
  });

  it('forwards multilingual hints to the worker request', async () => {
    let observedLanguages: string[] | undefined;

    const client: Pick<OcrWorkerClient, 'recognizePages' | 'dispose'> = {
      async recognizePages(payload) {
        observedLanguages = payload.languageHints;
        return makeOcrResult();
      },
      dispose() {
        return undefined;
      },
    };

    await runWorkerOcrJob({
      id: 'worker-job-language',
      documentFingerprint: 'doc-worker-job',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      languageHints: ['eng', 'hin', 'tam'],
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
      workerClient: client,
    });

    expect(observedLanguages).toEqual(['eng', 'hin', 'tam']);
  });

  it('disposes default/injected client when requested', async () => {
    let disposed = false;

    const client = makeFakeWorkerClient({
      result: makeOcrResult(),
      dispose: () => {
        disposed = true;
      },
    });

    await runWorkerOcrJob({
      id: 'worker-job-dispose',
      documentFingerprint: 'doc-worker-job',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
      workerClient: client,
      disposeClientAfterRun: true,
    });

    expect(disposed).toBe(true);
  });

  it('does not dispose injected client by default', async () => {
    let disposed = false;

    const client = makeFakeWorkerClient({
      result: makeOcrResult(),
      dispose: () => {
        disposed = true;
      },
    });

    await runWorkerOcrJob({
      id: 'worker-job-no-dispose',
      documentFingerprint: 'doc-worker-job',
      engineId: 'mock',
      requestedProfileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
      workerClient: client,
    });

    expect(disposed).toBe(false);
  });

  it('throws when no pages are supplied', async () => {
    await expect(
      runWorkerOcrJob({
        id: 'worker-job-empty',
        documentFingerprint: 'doc-worker-job',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        pages: [],
        workerClient: makeFakeWorkerClient({
          result: makeOcrResult(),
        }),
      }),
    ).rejects.toThrow('requires at least one page');
  });

  it('emits failed snapshot when worker client fails', async () => {
    const snapshots: string[] = [];

    const client = makeFakeWorkerClient({
      reject: new Error('Synthetic worker client failure.'),
    });

    await expect(
      runWorkerOcrJob({
        id: 'worker-job-fail',
        documentFingerprint: 'doc-worker-job',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        pages: [
          {
            pageIndex: 0,
            imageBytes: new Uint8Array([1, 2, 3]),
            width: 595,
            height: 842,
          },
        ],
        workerClient: client,
        onProgress: (snapshot) => {
          snapshots.push(snapshot.job.status);
        },
      }),
    ).rejects.toThrow('Synthetic worker client failure.');

    expect(snapshots).toContain('failed');
  });

  it('emits cancelled snapshot when worker client aborts', async () => {
    const snapshots: string[] = [];

    const client = makeFakeWorkerClient({
      reject: new Error('OCR worker request aborted.'),
    });

    await expect(
      runWorkerOcrJob({
        id: 'worker-job-cancel',
        documentFingerprint: 'doc-worker-job',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        pages: [
          {
            pageIndex: 0,
            imageBytes: new Uint8Array([1, 2, 3]),
            width: 595,
            height: 842,
          },
        ],
        workerClient: client,
        onProgress: (snapshot) => {
          snapshots.push(snapshot.job.status);
        },
      }),
    ).rejects.toThrow('aborted');

    expect(snapshots).toContain('cancelled');
  });
});

function makeFakeWorkerClient(input: {
  result?: OcrDocumentResult;
  reject?: Error;
  dispose?: () => void;
}): Pick<OcrWorkerClient, 'recognizePages' | 'dispose'> {
  return {
    async recognizePages(_payload, options) {
      options?.onProgress?.({
        status: 'running',
        completedPages: 0,
        totalPages: 1,
        message: 'Fake worker running.',
      });

      options?.onProgress?.({
        status: 'page-completed',
        completedPages: 1,
        totalPages: 1,
        activePageIndex: 0,
        message: 'Fake worker page completed.',
      });

      if (input.reject) {
        throw input.reject;
      }

      return input.result ?? makeOcrResult();
    },
    dispose() {
      input.dispose?.();
    },
  };
}

function makeOcrResult(): OcrDocumentResult {
  return {
    documentFingerprint: 'doc-worker-job',
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
