import {
  OperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';

export const RENDER_PRIORITIES = {
  currentPage: 100,
  nearbyThumbnail: 60,
  backgroundThumbnail: 10,
} as const;

export interface RenderScheduleRequest<T> {
  key: string;
  priority: number;
  signal?: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface RenderSchedulerDiagnostics {
  activeJobs: number;
  queuedJobs: number;
  trackedJobs: number;
  maxConcurrent: number;
}

type RenderJobState = 'queued' | 'running' | 'settled';

interface RenderJob<T> {
  key: string;
  priority: number;
  sequence: number;
  state: RenderJobState;
  consumers: number;
  controller: AbortController;
  run: (signal: AbortSignal) => Promise<T>;
  completion: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const renderObjectIds = new WeakMap<object, string>();
let renderObjectSequence = 0;

export function getRenderObjectId(value: object, prefix = 'render-object'): string {
  const existing = renderObjectIds.get(value);
  if (existing) return existing;

  const created = `${prefix}-${++renderObjectSequence}`;
  renderObjectIds.set(value, created);
  return created;
}

export class RenderScheduler {
  private readonly jobs = new Map<string, RenderJob<unknown>>();
  private readonly queue: RenderJob<unknown>[] = [];
  private activeJobs = 0;
  private sequence = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error('RenderScheduler maxConcurrent must be a positive integer.');
    }
    this.maxConcurrent = maxConcurrent;
  }

  schedule<T>(request: RenderScheduleRequest<T>): Promise<T> {
    if (request.signal?.aborted) {
      return Promise.reject(
        new OperationCancelledError(`scheduled render ${request.key}`, request.signal.reason),
      );
    }

    const tracked = this.jobs.get(request.key) as RenderJob<T> | undefined;
    if (tracked && !tracked.controller.signal.aborted && tracked.state !== 'settled') {
      if (tracked.state === 'queued' && request.priority > tracked.priority) {
        tracked.priority = request.priority;
        this.sortQueue();
      }
      return this.attachConsumer(tracked, request.signal);
    }

    const job = this.createJob(request);
    this.jobs.set(job.key, job as RenderJob<unknown>);
    this.queue.push(job as RenderJob<unknown>);
    this.sortQueue();
    this.pump();
    return this.attachConsumer(job, request.signal);
  }

  getDiagnostics(): RenderSchedulerDiagnostics {
    return {
      activeJobs: this.activeJobs,
      queuedJobs: this.queue.length,
      trackedJobs: this.jobs.size,
      maxConcurrent: this.maxConcurrent,
    };
  }

  cancelAll(reason: unknown = 'Render scheduler cleared'): void {
    const jobs = Array.from(this.jobs.values());
    for (const job of jobs) {
      if (job.state === 'queued') {
        this.cancelQueuedJob(job, reason);
      } else if (job.state === 'running') {
        this.jobs.delete(job.key);
        job.controller.abort(reason);
      }
    }
  }

  private createJob<T>(request: RenderScheduleRequest<T>): RenderJob<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const completion = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void completion.catch(() => undefined);

    return {
      key: request.key,
      priority: request.priority,
      sequence: ++this.sequence,
      state: 'queued',
      consumers: 0,
      controller: new AbortController(),
      run: request.run,
      completion,
      resolve,
      reject,
    };
  }

  private attachConsumer<T>(job: RenderJob<T>, signal?: AbortSignal): Promise<T> {
    job.consumers += 1;

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const detach = (cancelUnusedJob: boolean) => {
        job.consumers = Math.max(0, job.consumers - 1);
        if (cancelUnusedJob && job.consumers === 0) {
          this.cancelUnusedJob(job as RenderJob<unknown>, signal?.reason);
        }
      };

      const finish = (
        callback: () => void,
        cancelUnusedJob: boolean,
      ) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', handleAbort);
        detach(cancelUnusedJob);
        callback();
      };

      const handleAbort = () => {
        finish(
          () => reject(
            new OperationCancelledError(`scheduled render ${job.key}`, signal?.reason),
          ),
          true,
        );
      };

      signal?.addEventListener('abort', handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      job.completion.then(
        (value) => finish(() => resolve(value), false),
        (renderError) => finish(() => reject(renderError), false),
      );
    });
  }

  private cancelUnusedJob(job: RenderJob<unknown>, reason: unknown): void {
    if (job.state === 'queued') {
      this.cancelQueuedJob(job, reason ?? 'All render consumers cancelled');
      return;
    }

    if (job.state === 'running') {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      job.controller.abort(reason ?? 'All render consumers cancelled');
    }
  }

  private cancelQueuedJob(job: RenderJob<unknown>, reason: unknown): void {
    const queueIndex = this.queue.indexOf(job);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);

    job.state = 'settled';
    job.controller.abort(reason);
    job.reject(new OperationCancelledError(`scheduled render ${job.key}`, reason));
    this.pump();
  }

  private sortQueue(): void {
    this.queue.sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.sequence - right.sequence;
    });
  }

  private pump(): void {
    while (this.activeJobs < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || job.state !== 'queued') continue;
      this.startJob(job);
    }
  }

  private startJob(job: RenderJob<unknown>): void {
    job.state = 'running';
    this.activeJobs += 1;
    const operation = `scheduled render ${job.key}`;

    const taskPromise = Promise.resolve().then(() => {
      throwIfAborted(job.controller.signal, operation);
      return job.run(job.controller.signal);
    });

    void raceWithAbort(taskPromise, job.controller.signal, operation)
      .then(job.resolve, job.reject)
      .finally(() => {
        job.state = 'settled';
        this.activeJobs = Math.max(0, this.activeJobs - 1);
        if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
        this.pump();
      });
  }
}

export const pdfRenderScheduler = new RenderScheduler(3);
