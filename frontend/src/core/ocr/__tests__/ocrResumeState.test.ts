import { describe, expect, it } from 'vitest';
import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import {
  createOcrBatchSchedulerSnapshot,
  createOcrBatchTasksFromPages,
  runOcrBatchScheduler,
} from '../ocrBatchScheduler';
import {
  OcrResumeStateError,
  createOcrResumeToken,
  getPendingOcrPageIndexes,
  resumeOcrBatchTasks,
} from '../ocrResumeState';

describe('ocrResumeState', () => {
  it('skips completed work and deterministically requeues retryable work', async () => {
    const original = createOcrBatchTasksFromPages({
      pages: makePages(4),
      batchSize: 1,
      idPrefix: 'resume',
    });

    original[0].status = 'completed';
    original[1].status = 'failed';
    original[1].errorMessage = 'synthetic failure';
    original[2].status = 'cancelled';

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng', 'hin'],
      snapshot: createOcrBatchSchedulerSnapshot(original),
      now: '2026-09-23T00:00:00.000Z',
    });

    const resumed = resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: 'eng+hin',
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
    expect(getPendingOcrPageIndexes(resumed)).toEqual([1, 2, 3]);

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
    expect(run.snapshot.status).toBe('completed');
  });

  it('does not retry failed work when retryFailed is false', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(2),
      batchSize: 1,
    });
    tasks[0].status = 'failed';
    tasks[1].status = 'completed';

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng'],
      snapshot: createOcrBatchSchedulerSnapshot(tasks),
    });

    const resumed = resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng'],
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(2),
        batchSize: 1,
      }),
      retryFailed: false,
    });

    expect(resumed.map((task) => task.status)).toEqual([
      'failed',
      'completed',
    ]);
  });

  it('can explicitly reprocess completed work', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(1),
      batchSize: 1,
    });
    tasks[0].status = 'completed';

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng'],
      snapshot: createOcrBatchSchedulerSnapshot(tasks),
    });

    const resumed = resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng'],
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(1),
        batchSize: 1,
      }),
      reprocessCompleted: true,
    });

    expect(resumed[0].status).toBe('queued');
  });

  it('rejects resume state from another document or OCR configuration', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(2),
      batchSize: 1,
    });

    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng', 'hin'],
      snapshot: createOcrBatchSchedulerSnapshot(tasks),
    });

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-b',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng', 'hin'],
      tasks,
    })).toThrowError(OcrResumeStateError);

    expect(() => resumeOcrBatchTasks({
      token,
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng', 'tam'],
      tasks,
    })).toThrowError(OcrResumeStateError);
  });

  it('rejects stale resume state when the batch topology changes', () => {
    const token = createOcrResumeToken({
      documentFingerprint: 'doc-a',
      engineId: 'tesseract-js',
      profileId: 'clean-scan',
      languages: ['eng'],
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
      languages: ['eng'],
      tasks: createOcrBatchTasksFromPages({
        pages: makePages(4),
        batchSize: 1,
      }),
    })).toThrowError(OcrResumeStateError);
  });
});

function makePages(count: number): OcrEnginePageInput[] {
  return Array.from({ length: count }, (_, pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
  }));
}
