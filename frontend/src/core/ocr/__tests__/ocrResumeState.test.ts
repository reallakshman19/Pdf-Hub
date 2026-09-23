import { describe, expect, it } from 'vitest';
import {
  createOcrBatchSchedulerSnapshot,
  createOcrBatchTasksFromPages,
  runOcrBatchScheduler,
} from '../ocrBatchScheduler';
import {
  OcrResumeStateError,
  createOcrResumeToken,
  resumeOcrBatchTasks,
  validateOcrResumeToken,
} from '../ocrResumeState';

const RESUME_EXECUTION_CONFIG = {
  forceOcr: false,
  rasterScale: 2,
  maxCanvasPixels: 16_000_000,
};

describe('ocrResumeState', () => {
  it('preserves completed work and requeues interrupted/retryable work', async () => {
    const original = createOcrBatchTasksFromPages({
      pages: makePages(4),
      batchSize: 1,
      idPrefix: 'resume',
    });

    original[0].status = 'completed';
    original[1].status = 'failed';
    original[1].errorMessage = 'synthetic failure';
    original[2].status = 'cancelled';
    original[3].status = 'running';

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      snapshot: createOcrBatchSchedulerSnapshot(original),
      now: '2026-09-23T00:00:00.000Z',
    });

    const resumed = resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(4),
        batchSize: 1,
        idPrefix: 'fresh',
      }),
    });

    expect(resumed.map((task) => task.status)).toEqual([
      'completed',
      'queued',
      'queued',
      'queued',
    ]);

    const executed: number[] = [];
    const run = await runOcrBatchScheduler({
      tasks: resumed,
      concurrency: 1,
      runTask: async (task) => {
        executed.push(...task.pageIndexes);
        return task.pageIndexes;
      },
    });

    expect(executed).toEqual([1, 2, 3]);
    expect(run.snapshot.completedCount).toBe(4);
  });

  it('rejects checkpoints from another document or configuration', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(2),
      batchSize: 1,
    });

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      snapshot: createOcrBatchSchedulerSnapshot(tasks),
    });

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-b',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'other-engine',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'table-heavy',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: {
        ...RESUME_EXECUTION_CONFIG,
        rasterScale: 3,
      },
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: {
        ...RESUME_EXECUTION_CONFIG,
        maxPagesPerJob: 10,
      },
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: {
        ...RESUME_EXECUTION_CONFIG,
        allowLargeJobs: true,
      },
      tasks,
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects malformed persisted task statuses instead of treating them as queued', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      snapshot: createOcrBatchSchedulerSnapshot(
        createOcrBatchTasksFromPages({
          pages: makePages(1),
          batchSize: 1,
        }),
      ),
    });

    const malformed = {
      ...token,
      tasks: [
        {
          ...token.tasks[0],
          status: 'mystery-status',
        },
      ],
    };

    expect(() => resumeOcrBatchTasks({
      token: malformed as typeof token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(1),
        batchSize: 1,
      }),
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects ambiguous or empty persisted batch topology', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      snapshot: createOcrBatchSchedulerSnapshot(
        createOcrBatchTasksFromPages({
          pages: makePages(2),
          batchSize: 1,
        }),
      ),
    });

    expect(() => validateOcrResumeToken({
      ...token,
      tasks: [
        {
          ...token.tasks[0],
          pageIndexes: [],
        },
        token.tasks[1],
      ],
    })).toThrowError(OcrResumeStateError);

    expect(() => validateOcrResumeToken({
      ...token,
      tasks: [
        token.tasks[0],
        {
          ...token.tasks[1],
          id: token.tasks[0].id,
        },
      ],
    })).toThrowError(OcrResumeStateError);

    expect(() => validateOcrResumeToken({
      ...token,
      tasks: [
        token.tasks[0],
        {
          ...token.tasks[1],
          pageIndexes: [0],
        },
      ],
    })).toThrowError(OcrResumeStateError);

    expect(() => validateOcrResumeToken({
      ...token,
      tasks: [
        {
          ...token.tasks[0],
          pageIndexes: [1, 0],
        },
        token.tasks[1],
      ],
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects stale checkpoints when the batch topology changes', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      snapshot: createOcrBatchSchedulerSnapshot(
        createOcrBatchTasksFromPages({
          pages: makePages(4),
          batchSize: 2,
        }),
      ),
    });

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      executionConfig: RESUME_EXECUTION_CONFIG,
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(4),
        batchSize: 1,
      }),
    })).toThrowError(OcrResumeStateError);
  });
});

function makePages(count: number) {
  return Array.from({ length: count }, (_, pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
  }));
}
