import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { RenderScheduler } from './renderScheduler';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const schedulers: RenderScheduler[] = [];

function createScheduler(maxConcurrent: number): RenderScheduler {
  const scheduler = new RenderScheduler(maxConcurrent);
  schedulers.push(scheduler);
  return scheduler;
}

afterEach(() => {
  for (const scheduler of schedulers.splice(0)) scheduler.cancelAll('test cleanup');
});

describe('RenderScheduler', () => {
  it('enforces the configured concurrency ceiling', async () => {
    const scheduler = createScheduler(2);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const started: number[] = [];

    const jobs = gates.map((gate, index) => scheduler.schedule({
      key: `page-${index}`,
      priority: 10,
      run: async () => {
        started.push(index);
        await gate.promise;
        return index;
      },
    }));

    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(scheduler.getDiagnostics()).toMatchObject({
      activeJobs: 2,
      queuedJobs: 1,
      maxConcurrent: 2,
    });

    gates[0].resolve();
    await jobs[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(jobs);
  });

  it('runs higher-priority queued work before earlier background work', async () => {
    const scheduler = createScheduler(1);
    const blocker = deferred<void>();
    const order: string[] = [];

    const first = scheduler.schedule({
      key: 'blocker',
      priority: 100,
      run: async () => {
        order.push('blocker');
        await blocker.promise;
      },
    });
    const background = scheduler.schedule({
      key: 'background',
      priority: 10,
      run: async () => {
        order.push('background');
      },
    });
    const interactive = scheduler.schedule({
      key: 'interactive',
      priority: 100,
      run: async () => {
        order.push('interactive');
      },
    });

    await Promise.resolve();
    blocker.resolve();
    await first;
    await Promise.all([background, interactive]);

    expect(order).toEqual(['blocker', 'interactive', 'background']);
  });

  it('deduplicates consumers of the same tracked render key', async () => {
    const scheduler = createScheduler(2);
    const gate = deferred<number>();
    const run = vi.fn(() => gate.promise);

    const first = scheduler.schedule({ key: 'same', priority: 10, run });
    const second = scheduler.schedule({ key: 'same', priority: 100, run });

    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    gate.resolve(42);
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
  });

  it('drops queued work when its only consumer aborts', async () => {
    const scheduler = createScheduler(1);
    const blocker = deferred<void>();
    const controller = new AbortController();
    const queuedRun = vi.fn(async () => undefined);

    const first = scheduler.schedule({
      key: 'blocker',
      priority: 100,
      run: async () => blocker.promise,
    });
    const queued = scheduler.schedule({
      key: 'queued',
      priority: 10,
      signal: controller.signal,
      run: queuedRun,
    });

    controller.abort('obsolete thumbnail');
    await expect(queued).rejects.toSatisfy(isOperationCancelledError);
    expect(queuedRun).not.toHaveBeenCalled();

    blocker.resolve();
    await first;
  });

  it('aborts active work after the last consumer detaches', async () => {
    const scheduler = createScheduler(1);
    const firstController = new AbortController();
    const secondController = new AbortController();
    let taskSignal: AbortSignal | null = null;

    const run = vi.fn(async (signal: AbortSignal) => {
      taskSignal = signal;
      await new Promise<void>(() => undefined);
    });

    const first = scheduler.schedule({
      key: 'shared-active',
      priority: 10,
      signal: firstController.signal,
      run,
    });
    const second = scheduler.schedule({
      key: 'shared-active',
      priority: 10,
      signal: secondController.signal,
      run,
    });

    await Promise.resolve();
    firstController.abort('first view left');
    await expect(first).rejects.toSatisfy(isOperationCancelledError);
    expect(taskSignal?.aborted).toBe(false);

    secondController.abort('second view left');
    await expect(second).rejects.toSatisfy(isOperationCancelledError);
    expect(taskSignal?.aborted).toBe(true);
  });
});
