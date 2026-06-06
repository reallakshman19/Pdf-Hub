import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createOcrAbortControllerWithTimeout,
  createOcrExecutionPlan,
  createOcrExecutionPolicy,
  estimateRasterMemoryBytes,
  estimateRasterPixels,
  formatBytes,
  normalizeRequestedPageIndexes,
  runWithOcrTimeout,
} from '../ocrExecutionPolicy';

describe('ocrExecutionPolicy', () => {
  it('creates default balanced policy', () => {
    const policy = createOcrExecutionPolicy();

    expect(policy.preset).toBe('balanced');
    expect(policy.rasterScale).toBe(2);
    expect(policy.maxPagesPerJob).toBe(25);
    expect(policy.timeoutMs).toBe(90_000);
  });

  it('creates preset policy and clamps custom values', () => {
    const policy = createOcrExecutionPolicy({
      preset: 'accurate',
      rasterScale: 99,
      maxPagesPerJob: 0,
      maxCanvasPixels: 1,
      timeoutMs: 1,
    });

    expect(policy.preset).toBe('accurate');
    expect(policy.rasterScale).toBe(4);
    expect(policy.maxPagesPerJob).toBe(1);
    expect(policy.maxCanvasPixels).toBe(1_000_000);
    expect(policy.timeoutMs).toBe(5_000);
  });

  it('normalizes requested page indexes', () => {
    expect(
      normalizeRequestedPageIndexes([3, 1, 1, -1, 99, 2], 5),
    ).toEqual([1, 2, 3]);
  });

  it('creates execution plan with page limit applied', () => {
    const policy = createOcrExecutionPolicy({
      maxPagesPerJob: 2,
      allowLargeJobs: false,
    });

    const plan = createOcrExecutionPlan({
      requestedPageIndexes: [0, 1, 2, 3],
      totalPages: 5,
      policy,
    });

    expect(plan.allowedPageIndexes).toEqual([0, 1]);
    expect(plan.skippedPageIndexes).toEqual([2, 3]);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_PAGE_LIMIT_APPLIED')).toBe(true);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_EXECUTION_READY')).toBe(true);
  });

  it('allows large jobs when override is enabled', () => {
    const policy = createOcrExecutionPolicy({
      maxPagesPerJob: 2,
      allowLargeJobs: true,
    });

    const plan = createOcrExecutionPlan({
      requestedPageIndexes: [0, 1, 2, 3],
      totalPages: 5,
      policy,
    });

    expect(plan.allowedPageIndexes).toEqual([0, 1, 2, 3]);
    expect(plan.skippedPageIndexes).toEqual([]);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_LARGE_JOB_BLOCKED')).toBe(true);
  });

  it('returns error plan when no valid pages are selected', () => {
    const policy = createOcrExecutionPolicy();

    const plan = createOcrExecutionPlan({
      requestedPageIndexes: [-1, 99],
      totalPages: 2,
      policy,
    });

    expect(plan.allowedPageIndexes).toEqual([]);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === 'OCR_NO_PAGES_SELECTED')).toBe(true);
  });

  it('estimates raster pixels and memory', () => {
    const pixels = estimateRasterPixels({
      pageIndexes: [0],
      pageSizes: [
        {
          pageIndex: 0,
          width: 100,
          height: 200,
        },
      ],
      rasterScale: 2,
    });

    expect(pixels).toBe(80_000);
    expect(estimateRasterMemoryBytes(pixels)).toBe(320_000);
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('creates abort controller with timeout', () => {
    vi.useFakeTimers();

    let timedOut = false;

    const abort = createOcrAbortControllerWithTimeout({
      timeoutMs: 1000,
      onTimeout: () => {
        timedOut = true;
      },
    });

    expect(abort.controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(timedOut).toBe(true);
    expect(abort.controller.signal.aborted).toBe(true);

    abort.clear();
    vi.useRealTimers();
  });

  it('runWithOcrTimeout executes task and clears timeout', async () => {
    const result = await runWithOcrTimeout({
      timeoutMs: 1000,
      task: async () => 'done',
    });

    expect(result).toBe('done');
  });
});
