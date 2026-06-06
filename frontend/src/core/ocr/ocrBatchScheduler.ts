import type { OcrEnginePageInput } from './engines/ocrEngineContract';

export type OcrBatchTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface OcrBatchTask<TInput = OcrEnginePageInput[]> {
  id: string;
  index: number;
  pageIndexes: number[];
  input: TInput;
  status: OcrBatchTaskStatus;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
}

export interface OcrBatchTaskResult<TOutput = unknown> {
  taskId: string;
  pageIndexes: number[];
  output: TOutput;
}

export interface OcrBatchSchedulerSnapshot<TInput = OcrEnginePageInput[]> {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  tasks: OcrBatchTask<TInput>[];
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  runningCount: number;
  queuedCount: number;
  totalCount: number;
  progress: number;
  diagnostics: OcrBatchSchedulerDiagnostic[];
}

export interface OcrBatchSchedulerDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_BATCH_READY'
    | 'OCR_BATCH_STARTED'
    | 'OCR_BATCH_COMPLETED'
    | 'OCR_BATCH_FAILED'
    | 'OCR_BATCH_CANCELLED'
    | 'OCR_BATCH_RETRY_CREATED'
    | 'OCR_BATCH_EMPTY';
  message: string;
  taskId?: string;
}

export interface CreateOcrBatchTasksInput {
  pages: OcrEnginePageInput[];
  batchSize: number;
  idPrefix?: string;
}

export interface RunOcrBatchSchedulerInput<TInput, TOutput> {
  tasks: OcrBatchTask<TInput>[];
  concurrency?: number;
  now?: () => string;
  signal?: AbortSignal;
  runTask: (
    task: OcrBatchTask<TInput>,
    signal: AbortSignal,
  ) => Promise<TOutput>;
  onSnapshot?: (snapshot: OcrBatchSchedulerSnapshot<TInput>) => void;
}

export interface RunOcrBatchSchedulerResult<TInput, TOutput> {
  snapshot: OcrBatchSchedulerSnapshot<TInput>;
  results: OcrBatchTaskResult<TOutput>[];
}

export class OcrBatchSchedulerCancelledError extends Error {
  constructor() {
    super('OCR batch scheduler was cancelled.');
    this.name = 'OcrBatchSchedulerCancelledError';
  }
}

export function createOcrBatchTasksFromPages(
  input: CreateOcrBatchTasksInput,
): OcrBatchTask<OcrEnginePageInput[]>[] {
  const batchSize = Math.max(1, Math.floor(input.batchSize));
  const idPrefix = input.idPrefix ?? 'ocr-batch';

  const batches: OcrBatchTask<OcrEnginePageInput[]>[] = [];

  for (let start = 0; start < input.pages.length; start += batchSize) {
    const batchPages = input.pages.slice(start, start + batchSize);
    const index = batches.length;

    batches.push({
      id: `${idPrefix}-${index + 1}`,
      index,
      pageIndexes: batchPages.map((page) => page.pageIndex),
      input: batchPages,
      status: 'queued',
    });
  }

  return batches;
}

export function createOcrBatchSchedulerSnapshot<TInput>(
  tasks: OcrBatchTask<TInput>[],
  diagnostics: OcrBatchSchedulerDiagnostic[] = [],
): OcrBatchSchedulerSnapshot<TInput> {
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const cancelledCount = tasks.filter((task) => task.status === 'cancelled').length;
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const queuedCount = tasks.filter((task) => task.status === 'queued').length;
  const totalCount = tasks.length;

  const terminalCount = completedCount + failedCount + cancelledCount;

  let status: OcrBatchSchedulerSnapshot<TInput>['status'] = 'idle';

  if (totalCount === 0) {
    status = 'idle';
  } else if (cancelledCount > 0 && terminalCount === totalCount) {
    status = 'cancelled';
  } else if (runningCount > 0 || queuedCount > 0) {
    status = 'running';
  } else if (failedCount > 0) {
    status = 'failed';
  } else {
    status = 'completed';
  }

  return {
    status,
    tasks: tasks.map(cloneTask),
    completedCount,
    failedCount,
    cancelledCount,
    runningCount,
    queuedCount,
    totalCount,
    progress: totalCount === 0
      ? 0
      : terminalCount / totalCount,
    diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

export async function runOcrBatchScheduler<TInput, TOutput>(
  input: RunOcrBatchSchedulerInput<TInput, TOutput>,
): Promise<RunOcrBatchSchedulerResult<TInput, TOutput>> {
  const now = input.now ?? (() => new Date().toISOString());
  const concurrency = Math.max(1, Math.floor(input.concurrency ?? 1));
  const controller = new AbortController();

  const onAbort = () => {
    controller.abort();
  };

  input.signal?.addEventListener('abort', onAbort, {
    once: true,
  });

  const tasks = input.tasks.map(cloneTask);
  const results: OcrBatchTaskResult<TOutput>[] = [];
  const diagnostics: OcrBatchSchedulerDiagnostic[] = [];

  if (tasks.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_BATCH_EMPTY',
      message: 'No OCR batch tasks were supplied.',
    });

    const snapshot = createOcrBatchSchedulerSnapshot(tasks, diagnostics);
    input.onSnapshot?.(snapshot);

    return {
      snapshot,
      results,
    };
  }

  diagnostics.push({
    level: 'info',
    code: 'OCR_BATCH_READY',
    message: `${tasks.length} OCR batch task(s) ready.`,
  });

  emitSnapshot();

  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      throwIfCancelled(controller.signal);

      const task = tasks[cursor];
      cursor += 1;

      if (!task) {
        continue;
      }

      task.status = 'running';
      task.startedAt = now();

      diagnostics.push({
        level: 'info',
        code: 'OCR_BATCH_STARTED',
        taskId: task.id,
        message: `OCR batch ${task.id} started.`,
      });

      emitSnapshot();

      try {
        const output = await input.runTask(task, controller.signal);

        throwIfCancelled(controller.signal);

        task.status = 'completed';
        task.finishedAt = now();

        results.push({
          taskId: task.id,
          pageIndexes: [...task.pageIndexes],
          output,
        });

        diagnostics.push({
          level: 'info',
          code: 'OCR_BATCH_COMPLETED',
          taskId: task.id,
          message: `OCR batch ${task.id} completed.`,
        });
      } catch (error) {
        if (isAbortLikeError(error) || controller.signal.aborted) {
          task.status = 'cancelled';
          task.finishedAt = now();
          task.errorMessage = 'OCR batch cancelled.';

          diagnostics.push({
            level: 'warning',
            code: 'OCR_BATCH_CANCELLED',
            taskId: task.id,
            message: `OCR batch ${task.id} cancelled.`,
          });
        } else {
          task.status = 'failed';
          task.finishedAt = now();
          task.errorMessage = error instanceof Error
            ? error.message
            : 'OCR batch failed.';

          diagnostics.push({
            level: 'error',
            code: 'OCR_BATCH_FAILED',
            taskId: task.id,
            message: task.errorMessage,
          });
        }
      }

      emitSnapshot();
    }
  }

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, tasks.length) },
        () => worker(),
      ),
    );
  } catch (error) {
    if (!isAbortLikeError(error)) {
      throw error;
    }
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
  }

  if (controller.signal.aborted) {
    for (const task of tasks) {
      if (task.status === 'queued' || task.status === 'running') {
        task.status = 'cancelled';
        task.finishedAt = now();
        task.errorMessage = 'OCR batch cancelled.';
      }
    }

    emitSnapshot();
  }

  return {
    snapshot: createOcrBatchSchedulerSnapshot(tasks, diagnostics),
    results,
  };

  function emitSnapshot(): void {
    input.onSnapshot?.(
      createOcrBatchSchedulerSnapshot(tasks, diagnostics),
    );
  }
}

export function createRetryTasksFromFailedBatches<TInput>(
  snapshot: OcrBatchSchedulerSnapshot<TInput>,
  options: {
    idPrefix?: string;
  } = {},
): OcrBatchTask<TInput>[] {
  const idPrefix = options.idPrefix ?? 'ocr-batch-retry';

  return snapshot.tasks
    .filter((task) => task.status === 'failed')
    .map((task, index) => ({
      ...task,
      id: `${idPrefix}-${index + 1}`,
      index,
      status: 'queued',
      startedAt: undefined,
      finishedAt: undefined,
      errorMessage: undefined,
    }));
}

export function cancelQueuedOcrBatchTasks<TInput>(
  tasks: OcrBatchTask<TInput>[],
  now = new Date().toISOString(),
): OcrBatchTask<TInput>[] {
  return tasks.map((task) =>
    task.status === 'queued'
      ? {
          ...task,
          status: 'cancelled',
          finishedAt: now,
          errorMessage: 'OCR batch cancelled before start.',
        }
      : cloneTask(task),
  );
}

function cloneTask<TInput>(
  task: OcrBatchTask<TInput>,
): OcrBatchTask<TInput> {
  return {
    ...task,
    pageIndexes: [...task.pageIndexes],
  };
}

function throwIfCancelled(
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    throw new OcrBatchSchedulerCancelledError();
  }
}

function isAbortLikeError(
  error: unknown,
): boolean {
  return error instanceof OcrBatchSchedulerCancelledError
    || error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|cancel/i.test(error.message);
}
