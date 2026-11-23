import { describe, it, expect } from 'vitest';
import { OcrWorkerPoolManager } from '../ocrWorkerPoolManager';

describe('ocrWorkerPoolManager', () => {
  it('enforces concurrency bounds when executing multiple tasks', async () => {
    const pool = new OcrWorkerPoolManager({ maxConcurrency: 2 });
    expect(pool.getMaxConcurrency()).toBe(2);

    let runningCount = 0;
    let maxObservedRunning = 0;

    const createTask = (durationMs: number) => {
      return pool.enqueue(async () => {
        runningCount++;
        maxObservedRunning = Math.max(maxObservedRunning, runningCount);
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        runningCount--;
        return 'done';
      });
    };

    const p1 = createTask(30);
    const p2 = createTask(30);
    const p3 = createTask(30);
    const p4 = createTask(30);

    const results = await Promise.all([p1, p2, p3, p4]);
    expect(results).toEqual(['done', 'done', 'done', 'done']);
    expect(maxObservedRunning).toBe(2);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getQueueLength()).toBe(0);
  });

  it('rejects pending tasks when AbortSignal triggers', async () => {
    const pool = new OcrWorkerPoolManager({ maxConcurrency: 1 });
    const controller = new AbortController();

    // Start one blocking task
    const p1 = pool.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'task1';
    });

    // Enqueue second task with abort signal
    const p2 = pool.enqueue(async () => {
      return 'task2';
    }, controller.signal);

    controller.abort();

    await expect(p2).rejects.toThrow('Operation aborted');
    const r1 = await p1;
    expect(r1).toBe('task1');
  });

  it('rejects all queued tasks when terminateAll is called', async () => {
    const pool = new OcrWorkerPoolManager({ maxConcurrency: 1 });

    void pool.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'first';
    });

    const p2 = pool.enqueue(async () => 'queued');

    pool.terminateAll();

    await expect(p2).rejects.toThrow('Worker pool terminated');
  });

  it('safely disposes canvas buffers to prevent memory leaks', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(1000);

    OcrWorkerPoolManager.disposeCanvas(canvas);

    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
