import type {
  OcrBatchSchedulerSnapshot,
  OcrBatchTask,
  OcrBatchTaskStatus,
} from './ocrBatchScheduler';

export interface OcrResumeTaskState {
  id: string;
  index: number;
  pageIndexes: number[];
  status: OcrBatchTaskStatus;
  errorMessage?: string;
}

export interface OcrResumeExecutionConfig {
  forceOcr: boolean;
  rasterScale: number;
  maxCanvasPixels: number;
}

export interface OcrResumeTokenV1 {
  schema: 'pdf-hub-ocr-resume';
  schemaVersion: 1;
  documentFingerprint: string;
  engineId: string;
  profileId: string;
  executionConfig: OcrResumeExecutionConfig;
  createdAt: string;
  tasks: OcrResumeTaskState[];
}

export class OcrResumeStateError extends Error {
  readonly code:
    | 'OCR_RESUME_TOKEN_INVALID'
    | 'OCR_RESUME_DOCUMENT_MISMATCH'
    | 'OCR_RESUME_ENGINE_MISMATCH'
    | 'OCR_RESUME_PROFILE_MISMATCH'
    | 'OCR_RESUME_EXECUTION_CONFIG_MISMATCH'
    | 'OCR_RESUME_TASK_PLAN_MISMATCH';

  constructor(
    code: OcrResumeStateError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'OcrResumeStateError';
    this.code = code;
  }
}

export function createOcrResumeToken<TInput>(input: {
  documentFingerprint: string;
  engineId: string;
  profileId: string;
  executionConfig: OcrResumeExecutionConfig;
  snapshot: OcrBatchSchedulerSnapshot<TInput>;
  now?: string;
}): OcrResumeTokenV1 {
  assertNonEmpty(input.documentFingerprint, 'documentFingerprint');
  assertNonEmpty(input.engineId, 'engineId');
  assertNonEmpty(input.profileId, 'profileId');

  return {
    schema: 'pdf-hub-ocr-resume',
    schemaVersion: 1,
    documentFingerprint: input.documentFingerprint,
    engineId: input.engineId,
    profileId: input.profileId,
    executionConfig: normalizeExecutionConfig(input.executionConfig),
    createdAt: input.now ?? new Date().toISOString(),
    tasks: input.snapshot.tasks.map((task) => ({
      id: task.id,
      index: task.index,
      pageIndexes: [...task.pageIndexes],
      status: task.status === 'running' ? 'queued' : task.status,
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
    })),
  };
}

export function resumeOcrBatchTasks<TInput>(input: {
  token: OcrResumeTokenV1;
  documentFingerprint: string;
  engineId: string;
  profileId: string;
  executionConfig: OcrResumeExecutionConfig;
  tasks: OcrBatchTask<TInput>[];
  retryFailed?: boolean;
  retryCancelled?: boolean;
  reprocessCompleted?: boolean;
}): OcrBatchTask<TInput>[] {
  validateOcrResumeToken(input.token);

  if (input.token.documentFingerprint !== input.documentFingerprint) {
    throw new OcrResumeStateError(
      'OCR_RESUME_DOCUMENT_MISMATCH',
      'OCR resume token belongs to a different document.',
    );
  }

  if (input.token.engineId !== input.engineId) {
    throw new OcrResumeStateError(
      'OCR_RESUME_ENGINE_MISMATCH',
      'OCR resume token was created for a different OCR engine.',
    );
  }

  if (input.token.profileId !== input.profileId) {
    throw new OcrResumeStateError(
      'OCR_RESUME_PROFILE_MISMATCH',
      'OCR resume token was created for a different OCR profile.',
    );
  }

  if (!ocrResumeExecutionConfigMatches(
    input.token.executionConfig,
    input.executionConfig,
  )) {
    throw new OcrResumeStateError(
      'OCR_RESUME_EXECUTION_CONFIG_MISMATCH',
      'OCR resume token was created for different OCR execution settings.',
    );
  }

  assertTaskPlanMatches(input.token.tasks, input.tasks);

  const retryFailed = input.retryFailed ?? true;
  const retryCancelled = input.retryCancelled ?? true;
  const reprocessCompleted = input.reprocessCompleted ?? false;

  return input.tasks.map((task, index) => {
    const saved = input.token.tasks[index];
    const status = resumedTaskStatus(saved.status, {
      retryFailed,
      retryCancelled,
      reprocessCompleted,
    });

    if (status === 'queued') {
      return {
        ...task,
        pageIndexes: [...task.pageIndexes],
        status,
        startedAt: undefined,
        finishedAt: undefined,
        errorMessage: undefined,
      };
    }

    return {
      ...task,
      pageIndexes: [...task.pageIndexes],
      status,
      errorMessage: saved.errorMessage,
    };
  });
}

export function validateOcrResumeToken(
  token: OcrResumeTokenV1,
): void {
  if (
    token?.schema !== 'pdf-hub-ocr-resume'
    || token.schemaVersion !== 1
    || !Array.isArray(token.tasks)
  ) {
    throw new OcrResumeStateError(
      'OCR_RESUME_TOKEN_INVALID',
      'Unsupported or malformed OCR resume token.',
    );
  }

  assertNonEmpty(token.documentFingerprint, 'documentFingerprint');
  assertNonEmpty(token.engineId, 'engineId');
  assertNonEmpty(token.profileId, 'profileId');
  normalizeExecutionConfig(token.executionConfig);

  for (const [index, task] of token.tasks.entries()) {
    if (
      task.index !== index
      || !task.id
      || !Array.isArray(task.pageIndexes)
      || !isOcrBatchTaskStatus(task.status)
      || task.pageIndexes.some(
        (pageIndex) => !Number.isInteger(pageIndex) || pageIndex < 0,
      )
    ) {
      throw new OcrResumeStateError(
        'OCR_RESUME_TOKEN_INVALID',
        `Malformed OCR resume task at index ${index}.`,
      );
    }
  }
}

export function ocrResumeExecutionConfigMatches(
  left: OcrResumeExecutionConfig,
  right: OcrResumeExecutionConfig,
): boolean {
  const normalizedLeft = normalizeExecutionConfig(left);
  const normalizedRight = normalizeExecutionConfig(right);

  return normalizedLeft.forceOcr === normalizedRight.forceOcr
    && normalizedLeft.rasterScale === normalizedRight.rasterScale
    && normalizedLeft.maxCanvasPixels === normalizedRight.maxCanvasPixels;
}

function normalizeExecutionConfig(
  config: OcrResumeExecutionConfig,
): OcrResumeExecutionConfig {
  if (
    !config
    || typeof config.forceOcr !== 'boolean'
    || !Number.isFinite(config.rasterScale)
    || config.rasterScale <= 0
    || !Number.isFinite(config.maxCanvasPixels)
    || config.maxCanvasPixels <= 0
  ) {
    throw new OcrResumeStateError(
      'OCR_RESUME_TOKEN_INVALID',
      'OCR resume token contains invalid execution settings.',
    );
  }

  return {
    forceOcr: config.forceOcr,
    rasterScale: config.rasterScale,
    maxCanvasPixels: config.maxCanvasPixels,
  };
}

function isOcrBatchTaskStatus(
  status: unknown,
): status is OcrBatchTaskStatus {
  return status === 'queued'
    || status === 'running'
    || status === 'completed'
    || status === 'failed'
    || status === 'cancelled';
}

function resumedTaskStatus(
  status: OcrBatchTaskStatus,
  options: {
    retryFailed: boolean;
    retryCancelled: boolean;
    reprocessCompleted: boolean;
  },
): OcrBatchTaskStatus {
  if (status === 'completed') {
    return options.reprocessCompleted ? 'queued' : 'completed';
  }

  if (status === 'failed') {
    return options.retryFailed ? 'queued' : 'failed';
  }

  if (status === 'cancelled') {
    return options.retryCancelled ? 'queued' : 'cancelled';
  }

  return 'queued';
}

function assertTaskPlanMatches<TInput>(
  savedTasks: OcrResumeTaskState[],
  currentTasks: OcrBatchTask<TInput>[],
): void {
  if (savedTasks.length !== currentTasks.length) {
    throw new OcrResumeStateError(
      'OCR_RESUME_TASK_PLAN_MISMATCH',
      'OCR resume task count does not match the current batch plan.',
    );
  }

  for (let index = 0; index < currentTasks.length; index += 1) {
    const saved = savedTasks[index];
    const current = currentTasks[index];

    if (
      saved.index !== current.index
      || saved.pageIndexes.length !== current.pageIndexes.length
      || saved.pageIndexes.some(
        (pageIndex, offset) =>
          pageIndex !== current.pageIndexes[offset],
      )
    ) {
      throw new OcrResumeStateError(
        'OCR_RESUME_TASK_PLAN_MISMATCH',
        `OCR resume task ${index} does not match the current batch plan.`,
      );
    }
  }
}

function assertNonEmpty(
  value: string,
  field: string,
): void {
  if (!value?.trim()) {
    throw new OcrResumeStateError(
      'OCR_RESUME_TOKEN_INVALID',
      `OCR resume token is missing ${field}.`,
    );
  }
}
