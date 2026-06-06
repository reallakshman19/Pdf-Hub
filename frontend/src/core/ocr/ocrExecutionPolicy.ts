export type OcrExecutionScalePreset =
  | 'fast'
  | 'balanced'
  | 'accurate'
  | 'high';

export interface OcrExecutionPolicy {
  preset: OcrExecutionScalePreset;
  rasterScale: number;
  maxPagesPerJob: number;
  maxCanvasPixels: number;
  timeoutMs: number;
  allowLargeJobs: boolean;
}

export interface OcrExecutionPolicyInput {
  preset?: OcrExecutionScalePreset;
  rasterScale?: number;
  maxPagesPerJob?: number;
  maxCanvasPixels?: number;
  timeoutMs?: number;
  allowLargeJobs?: boolean;
}

export interface OcrExecutionPageSize {
  pageIndex: number;
  width: number;
  height: number;
}

export interface OcrExecutionPlanInput {
  requestedPageIndexes: number[];
  totalPages: number;
  policy: OcrExecutionPolicy;
  pageSizes?: OcrExecutionPageSize[];
}

export interface OcrExecutionPlan {
  policy: OcrExecutionPolicy;
  requestedPageIndexes: number[];
  allowedPageIndexes: number[];
  skippedPageIndexes: number[];
  estimatedRasterPixels: number;
  estimatedRasterMemoryBytes: number;
  diagnostics: OcrExecutionDiagnostic[];
}

export interface OcrExecutionDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_EXECUTION_READY'
    | 'OCR_NO_PAGES_SELECTED'
    | 'OCR_PAGE_LIMIT_APPLIED'
    | 'OCR_PAGE_INDEX_OUT_OF_RANGE'
    | 'OCR_LARGE_JOB_BLOCKED'
    | 'OCR_RASTER_MEMORY_HIGH'
    | 'OCR_TIMEOUT_ENABLED'
    | 'OCR_CANCELLED'
    | 'OCR_TIMEOUT_REACHED';
  message: string;
}

export const OCR_EXECUTION_PRESETS: Record<OcrExecutionScalePreset, OcrExecutionPolicy> = {
  fast: {
    preset: 'fast',
    rasterScale: 1.25,
    maxPagesPerJob: 10,
    maxCanvasPixels: 8_000_000,
    timeoutMs: 45_000,
    allowLargeJobs: false,
  },
  balanced: {
    preset: 'balanced',
    rasterScale: 2,
    maxPagesPerJob: 25,
    maxCanvasPixels: 16_000_000,
    timeoutMs: 90_000,
    allowLargeJobs: false,
  },
  accurate: {
    preset: 'accurate',
    rasterScale: 3,
    maxPagesPerJob: 40,
    maxCanvasPixels: 24_000_000,
    timeoutMs: 150_000,
    allowLargeJobs: false,
  },
  high: {
    preset: 'high',
    rasterScale: 4,
    maxPagesPerJob: 60,
    maxCanvasPixels: 32_000_000,
    timeoutMs: 240_000,
    allowLargeJobs: false,
  },
};

export function createOcrExecutionPolicy(
  input: OcrExecutionPolicyInput = {},
): OcrExecutionPolicy {
  const base = OCR_EXECUTION_PRESETS[input.preset ?? 'balanced'];

  return {
    ...base,
    ...input,
    preset: input.preset ?? base.preset,
    rasterScale: clampNumber(input.rasterScale ?? base.rasterScale, 0.5, 4),
    maxPagesPerJob: Math.max(1, Math.floor(input.maxPagesPerJob ?? base.maxPagesPerJob)),
    maxCanvasPixels: Math.max(1_000_000, Math.floor(input.maxCanvasPixels ?? base.maxCanvasPixels)),
    timeoutMs: Math.max(5_000, Math.floor(input.timeoutMs ?? base.timeoutMs)),
    allowLargeJobs: input.allowLargeJobs ?? base.allowLargeJobs,
  };
}

export function createOcrExecutionPlan(
  input: OcrExecutionPlanInput,
): OcrExecutionPlan {
  const requestedPageIndexes = normalizeRequestedPageIndexes(input.requestedPageIndexes, input.totalPages);
  const diagnostics: OcrExecutionDiagnostic[] = [];

  const outOfRangePageIndexes = input.requestedPageIndexes.filter(
    (pageIndex) =>
      !Number.isInteger(pageIndex)
      || pageIndex < 0
      || pageIndex >= input.totalPages,
  );

  if (outOfRangePageIndexes.length > 0) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PAGE_INDEX_OUT_OF_RANGE',
      message: `${outOfRangePageIndexes.length} OCR page index(es) were outside the document range and skipped.`,
    });
  }

  if (requestedPageIndexes.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'OCR_NO_PAGES_SELECTED',
      message: 'No valid OCR pages were selected.',
    });

    return {
      policy: input.policy,
      requestedPageIndexes,
      allowedPageIndexes: [],
      skippedPageIndexes: [],
      estimatedRasterPixels: 0,
      estimatedRasterMemoryBytes: 0,
      diagnostics,
    };
  }

  const overLimit = requestedPageIndexes.length > input.policy.maxPagesPerJob;
  const allowedPageIndexes = input.policy.allowLargeJobs
    ? requestedPageIndexes
    : requestedPageIndexes.slice(0, input.policy.maxPagesPerJob);
  const skippedPageIndexes = requestedPageIndexes.filter(
    (pageIndex) => !allowedPageIndexes.includes(pageIndex),
  );

  if (overLimit && !input.policy.allowLargeJobs) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PAGE_LIMIT_APPLIED',
      message: `OCR job limited to ${input.policy.maxPagesPerJob} page(s). ${skippedPageIndexes.length} page(s) skipped.`,
    });
  }

  if (overLimit && input.policy.allowLargeJobs) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_LARGE_JOB_BLOCKED',
      message: 'Large OCR job override is enabled. Browser OCR may be slow or memory-heavy.',
    });
  }

  const estimatedRasterPixels = estimateRasterPixels({
    pageIndexes: allowedPageIndexes,
    pageSizes: input.pageSizes,
    rasterScale: input.policy.rasterScale,
  });

  const estimatedRasterMemoryBytes = estimateRasterMemoryBytes(estimatedRasterPixels);

  if (estimatedRasterMemoryBytes > 512 * 1024 * 1024) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_RASTER_MEMORY_HIGH',
      message: `Estimated OCR raster memory is high: ${formatBytes(estimatedRasterMemoryBytes)}.`,
    });
  }

  diagnostics.push({
    level: 'info',
    code: 'OCR_TIMEOUT_ENABLED',
    message: `OCR timeout is ${Math.round(input.policy.timeoutMs / 1000)} seconds.`,
  });

  if (!diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_EXECUTION_READY',
      message: `${allowedPageIndexes.length} OCR page(s) ready for execution.`,
    });
  }

  return {
    policy: input.policy,
    requestedPageIndexes,
    allowedPageIndexes,
    skippedPageIndexes,
    estimatedRasterPixels,
    estimatedRasterMemoryBytes,
    diagnostics,
  };
}

export function normalizeRequestedPageIndexes(
  pageIndexes: number[],
  totalPages: number,
): number[] {
  return [...new Set(
    pageIndexes.filter((pageIndex) =>
      Number.isInteger(pageIndex)
      && pageIndex >= 0
      && pageIndex < totalPages,
    ),
  )].sort((a, b) => a - b);
}

export function estimateRasterPixels(input: {
  pageIndexes: number[];
  pageSizes?: OcrExecutionPageSize[];
  rasterScale: number;
}): number {
  const fallbackWidth = 595;
  const fallbackHeight = 842;

  return input.pageIndexes.reduce((sum, pageIndex) => {
    const size = input.pageSizes?.find((page) => page.pageIndex === pageIndex);

    const width = size?.width ?? fallbackWidth;
    const height = size?.height ?? fallbackHeight;

    return sum + Math.ceil(width * height * input.rasterScale * input.rasterScale);
  }, 0);
}

export function estimateRasterMemoryBytes(
  rasterPixels: number,
): number {
  return rasterPixels * 4;
}

export function formatBytes(
  bytes: number,
): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function createOcrAbortControllerWithTimeout(input: {
  timeoutMs: number;
  onTimeout?: () => void;
}): {
  controller: AbortController;
  cancel: () => void;
  clear: () => void;
} {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    input.onTimeout?.();
    controller.abort();
  }, input.timeoutMs);

  return {
    controller,
    cancel: () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    },
    clear: () => {
      window.clearTimeout(timeoutId);
    },
  };
}

export async function runWithOcrTimeout<T>(
  input: {
    timeoutMs: number;
    task: (signal: AbortSignal) => Promise<T>;
  },
): Promise<T> {
  const timeout = createOcrAbortControllerWithTimeout({
    timeoutMs: input.timeoutMs,
  });

  try {
    return await input.task(timeout.controller.signal);
  } finally {
    timeout.clear();
  }
}

export function isAbortError(
  error: unknown,
): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /cancel|abort/i.test(error.message);
}

function clampNumber(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(value, max));
}
