import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { OcrProfileId } from './ocrProfiles';
import type {
  OcrDocumentResult,
} from './types';
import type {
  OcrJob,
  OcrJobStatus,
} from './ocrJobTypes';
import type {
  OcrJobRunnerSnapshot,
} from './ocrJobRunner';
import type {
  OcrWorkerClient,
} from './workers/ocrWorkerClient';
import {
  createDefaultOcrWorkerClient,
} from './workers/ocrWorkerClient';
import type {
  OcrWorkerProgressPayload,
} from './workers/ocrWorkerTypes';

export interface RunWorkerOcrJobInput {
  id: string;
  documentFingerprint: string;
  engineId: string;
  requestedProfileId: OcrProfileId;
  pages: OcrEnginePageInput[];
  forceOcr?: boolean;
  signal?: AbortSignal;
  workerClient?: Pick<OcrWorkerClient, 'recognizePages' | 'dispose'>;
  disposeClientAfterRun?: boolean;
  onProgress?: (snapshot: OcrJobRunnerSnapshot) => void;
}

export interface RunWorkerOcrJobResult {
  jobId: string;
  result: OcrDocumentResult;
  snapshots: OcrJobRunnerSnapshot[];
}

export class OcrWorkerJobRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrWorkerJobRunnerError';
  }
}

export async function runWorkerOcrJob(
  input: RunWorkerOcrJobInput,
): Promise<RunWorkerOcrJobResult> {
  if (input.pages.length === 0) {
    throw new OcrWorkerJobRunnerError('Worker OCR job requires at least one page input.');
  }

  const client = input.workerClient ?? createDefaultOcrWorkerClient();
  const shouldDispose = input.disposeClientAfterRun ?? !input.workerClient;
  const snapshots: OcrJobRunnerSnapshot[] = [];

  const emit = (snapshot: OcrJobRunnerSnapshot) => {
    snapshots.push(snapshot);
    input.onProgress?.(snapshot);
  };

  emit(
    createWorkerOcrJobSnapshot({
      id: input.id,
      documentFingerprint: input.documentFingerprint,
      status: 'running',
      completedPages: 0,
      totalPages: input.pages.length,
      message: 'Worker OCR job started.',
    }),
  );

  try {
    const result = await client.recognizePages(
      {
        documentFingerprint: input.documentFingerprint,
        engineId: input.engineId,
        profileId: input.requestedProfileId,
        pages: input.pages,
        forceOcr: input.forceOcr,
      },
      {
        signal: input.signal,
        onProgress: (progress) => {
          emit(
            workerProgressToOcrJobSnapshot({
              id: input.id,
              documentFingerprint: input.documentFingerprint,
              progress,
            }),
          );
        },
      },
    );

    emit(
      createWorkerOcrJobSnapshot({
        id: input.id,
        documentFingerprint: input.documentFingerprint,
        status: 'completed',
        completedPages: result.pages.length,
        totalPages: input.pages.length,
        message: 'Worker OCR job completed.',
        result,
      }),
    );

    return {
      jobId: input.id,
      result,
      snapshots,
    };
  } catch (error) {
    const cancelled = isAbortLikeError(error);

    emit(
      createWorkerOcrJobSnapshot({
        id: input.id,
        documentFingerprint: input.documentFingerprint,
        status: cancelled ? 'cancelled' : 'failed',
        completedPages: 0,
        totalPages: input.pages.length,
        message: error instanceof Error
          ? error.message
          : 'Worker OCR job failed.',
      }),
    );

    throw error;
  } finally {
    if (shouldDispose) {
      client.dispose();
    }
  }
}

export function workerProgressToOcrJobSnapshot(input: {
  id: string;
  documentFingerprint: string;
  progress: OcrWorkerProgressPayload;
}): OcrJobRunnerSnapshot {
  const status = workerProgressStatusToJobStatus(input.progress.status);

  return createWorkerOcrJobSnapshot({
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    status,
    completedPages: input.progress.completedPages,
    totalPages: input.progress.totalPages,
    message: input.progress.message,
  });
}

export function workerProgressStatusToJobStatus(
  status: OcrWorkerProgressPayload['status'],
): OcrJobStatus {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';

  return 'running';
}

function createWorkerOcrJobSnapshot(input: {
  id: string;
  documentFingerprint: string;
  status: OcrJobStatus;
  completedPages: number;
  totalPages: number;
  message?: string;
  result?: OcrDocumentResult;
}): OcrJobRunnerSnapshot {
  const totalPages = Math.max(1, input.totalPages);
  const completedPages = Math.max(0, Math.min(input.completedPages, totalPages));

  const partialResult: OcrDocumentResult = input.result ?? {
    documentFingerprint: input.documentFingerprint,
    createdAt: new Date().toISOString(),
    engineId: 'worker',
    profileId: 'clean-scan',
    pages: [],
    diagnostics: [],
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const job: OcrJob = {
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    engineId: 'worker',
    profileId: 'clean-scan',
    pageIndexes: Array.from({ length: totalPages }, (_, i) => i),
    status: input.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: {
      totalPages,
      completedPages,
      failedPages: input.status === 'failed' ? totalPages - completedPages : 0,
    },
    errorMessage: input.status === 'failed' ? input.message : undefined,

    // Compatibility fields:
    documentKey: input.documentFingerprint,
    pageNumbers,
    results: partialResult.pages,
    queuedAt: Date.now(),
    cancelled: input.status === 'cancelled',
  };

  return {
    job,
    partialResult,
    preflight: {
      documentFingerprint: input.documentFingerprint,
      pageDecisions: [],
      queuedPageIndexes: job.pageIndexes ?? [],
      skippedPageIndexes: [],
      diagnostics: [],
    },
    message: input.message,
  };
}

function isAbortLikeError(
  error: unknown,
): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|cancel/i.test(error.message);
}
