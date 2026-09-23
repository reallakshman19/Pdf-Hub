import {
  describe,
  expect,
  it,
} from 'vitest';
import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import {
  cancelQueuedOcrBatchTasks,
  createOcrBatchSchedulerSnapshot,
  createOcrBatchTasksFromPages,
  createRetryTasksFromFailedBatches,
  mergeOcrBatchRetrySnapshot,
  runOcrBatchScheduler,
} from '../ocrBatchScheduler';

describe('ocrBatchScheduler', () => {
  it('creates batch tasks from pages', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(5),
      batchSize: 2,
      idPrefix: 'test-batch',
    });

    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe('test-batch-1');
    expect(tasks[0].pageIndexes).toEqual([0, 1]);
    expect(tasks[1].pageIndexes).toEqual([2, 3]);
    expect(tasks[2].pageIndexes).toEqual([4]);
    expect(tasks[0].status).toBe('queued');
  });

  it('creates scheduler snapshot', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(3),
      batchSize: 1,
    });

    tasks[0].status = 'completed';
    tasks[1].status = 'running';

    const snapshot = createOcrBatchSchedulerSnapshot(tasks);

    expect(snapshot.status).toBe('running');
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.runningCount).toBe(1);
    expect(snapshot.queuedCount).toBe(1);
    expect(snapshot.totalCount).toBe(3);
    expect(snapshot.progress).toBeCloseTo(1 / 3);
  });

  it('runs scheduler tasks successfully', async () => {
    const snapshots: string[] = [];

    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(4),
      batchSize: 2,
      idPrefix: 'run',
    });

    const result = await runOcrBatchScheduler({
      tasks,
      concurrency: 1,
      runTask: async (task) => {
        return task.pageIndexes;
      },
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot.status);
      },
    });

    expect(result.snapshot.status).toBe('completed');
    expect(result.snapshot.completedCount).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].pageIndexes).toEqual([0, 1]);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('runs tasks with concurrency', async () => {
    let running = 0;
    let maxRunning = 0;

    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(6),
      batchSize: 1,
    });

    const result = await runOcrBatchScheduler({
      tasks,
      concurrency: 3,
      runTask: async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);

        await delay(10);

        running -= 1;

        return true;
      },
    });

    expect(result.snapshot.status).toBe('completed');
    expect(result.snapshot.completedCount).toBe(6);
    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(maxRunning).toBeGreaterThan(1);
  });

  it('marks failed task and returns failed snapshot', async () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(3),
      batchSize: 1,
    });

    const result = await runOcrBatchScheduler({
      tasks,
      concurrency: 1,
      runTask: async (task) => {
        if (task.pageIndexes[0] === 1) {
          throw new Error('Synthetic OCR failure.');
        }

        return task.pageIndexes;
      },
    });

    expect(result.snapshot.status).toBe('failed');
    expect(result.snapshot.completedCount).toBe(2);
    expect(result.snapshot.failedCount).toBe(1);
    expect(result.snapshot.tasks[1].errorMessage).toBe('Synthetic OCR failure.');
    expect(result.snapshot.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_BATCH_FAILED')).toBe(true);
  });

  it('creates retry tasks from failed batches', async () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(2),
      batchSize: 1,
    });

    tasks[0].status = 'failed';
    tasks[0].errorMessage = 'bad';
    tasks[1].status = 'completed';

    const snapshot = createOcrBatchSchedulerSnapshot(tasks);
    const retryTasks = createRetryTasksFromFailedBatches(snapshot, {
      idPrefix: 'retry',
    });

    expect(retryTasks).toHaveLength(1);
    expect(retryTasks[0].id).toBe('retry-1');
    expect(retryTasks[0].status).toBe('queued');
    expect(retryTasks[0].errorMessage).toBeUndefined();
  });

  it('merges retry state back into the original full batch topology', () => {
    const originalTasks = createOcrBatchTasksFromPages({
      pages: makePages(3),
      batchSize: 1,
      idPrefix: 'original',
    });

    originalTasks[0].status = 'completed';
    originalTasks[1].status = 'failed';
    originalTasks[2].status = 'completed';

    const original = createOcrBatchSchedulerSnapshot(originalTasks);
    const retryTasks = createRetryTasksFromFailedBatches(original, {
      idPrefix: 'retry',
    });
    retryTasks[0].status = 'completed';

    const merged = mergeOcrBatchRetrySnapshot(
      original,
      createOcrBatchSchedulerSnapshot(retryTasks),
    );

    expect(merged.tasks).toHaveLength(3);
    expect(merged.tasks.map((task) => task.id)).toEqual([
      'original-1',
      'original-2',
      'original-3',
    ]);
    expect(merged.tasks.map((task) => task.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(merged.status).toBe('completed');
  });

  it('does not execute terminal tasks supplied to the scheduler', async () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(3),
      batchSize: 1,
    });
    tasks[0].status = 'completed';
    tasks[1].status = 'failed';

    const executed: number[] = [];
    const result = await runOcrBatchScheduler({
      tasks,
      concurrency: 1,
      runTask: async (task) => {
        executed.push(...task.pageIndexes);
        return task.pageIndexes;
      },
    });

    expect(executed).toEqual([2]);
    expect(result.snapshot.tasks.map((task) => task.status)).toEqual([
      'completed',
      'failed',
      'completed',
    ]);
  });

  it('cancels queued tasks', () => {
    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(3),
      batchSize: 1,
    });

    tasks[0].status = 'running';

    const cancelled = cancelQueuedOcrBatchTasks(
      tasks,
      '2026-01-01T00:00:00.000Z',
    );

    expect(cancelled[0].status).toBe('running');
    expect(cancelled[1].status).toBe('cancelled');
    expect(cancelled[2].status).toBe('cancelled');
    expect(cancelled[1].finishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('cancels scheduler using abort signal', async () => {
    const controller = new AbortController();

    const tasks = createOcrBatchTasksFromPages({
      pages: makePages(5),
      batchSize: 1,
    });

    const promise = runOcrBatchScheduler({
      tasks,
      concurrency: 1,
      signal: controller.signal,
      runTask: async () => {
        controller.abort();
        await delay(5);
        return true;
      },
    });

    const result = await promise;

    expect(result.snapshot.status === 'cancelled' || result.snapshot.cancelledCount > 0).toBe(true);
  });

  it('returns empty snapshot when no tasks are supplied', async () => {
    const result = await runOcrBatchScheduler({
      tasks: [],
      runTask: async () => true,
    });

    expect(result.snapshot.status).toBe('idle');
    expect(result.snapshot.totalCount).toBe(0);
    expect(result.snapshot.diagnostics[0].code).toBe('OCR_BATCH_EMPTY');
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
