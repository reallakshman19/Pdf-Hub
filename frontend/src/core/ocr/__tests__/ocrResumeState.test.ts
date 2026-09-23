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
} from '../ocrResumeState';

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
      snapshot: createOcrBatchSchedulerSnapshot(original),
      now: '2026-09-23T00:00:00.000Z',
    });

    const resumed = resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
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
      snapshot: createOcrBatchSchedulerSnapshot(tasks),
    });

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-b',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'other-engine',
      profileId: 'clean-scan',
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'table-heavy',
      tasks,
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects malformed persisted task statuses instead of treating them as queued', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
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
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(1),
        batchSize: 1,
      }),
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects stale checkpoints when the batch topology changes', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
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
