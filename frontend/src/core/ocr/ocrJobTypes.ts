import type { OcrPageResult } from './types';
import type { OcrProfileId } from './ocrProfiles';

export type OcrJobStatus =
  | 'queued'
  | 'running'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'complete'
  | 'timeout';

export interface OcrJobProgress {
  totalPages: number;
  completedPages: number;
  failedPages: number;
  currentPageIndex?: number;
}

export interface OcrJob {
  id: string;
  documentFingerprint?: string;
  engineId?: string;
  profileId?: OcrProfileId;
  pageIndexes?: number[];
  status: OcrJobStatus;
  progress?: OcrJobProgress;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;

  // Required compatibility fields for legacy store:
  documentKey: string;
  pageNumbers: number[];
  results: OcrPageResult[];
  queuedAt: number;
  cancelled: boolean;
  startedAt?: number;
  finishedAt?: number;
}

export function createQueuedOcrJob(input: {
  id: string;
  documentFingerprint: string;
  engineId: string;
  profileId: OcrProfileId;
  pageIndexes: number[];
  now?: string;
}): OcrJob {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    engineId: input.engineId,
    profileId: input.profileId,
    pageIndexes: [...input.pageIndexes],
    status: 'queued',
    progress: {
      totalPages: input.pageIndexes.length,
      completedPages: 0,
      failedPages: 0,
    },
    createdAt: now,
    updatedAt: now,

    // Default compatibility fields
    documentKey: input.documentFingerprint,
    pageNumbers: [...input.pageIndexes],
    results: [],
    queuedAt: Date.now(),
    cancelled: false,
  };
}

export function updateOcrJobProgress(
  job: OcrJob,
  patch: Partial<OcrJobProgress> & {
    status?: OcrJobStatus;
    errorMessage?: string;
    now?: string;
  },
): OcrJob {
  return {
    ...job,
    status: patch.status ?? job.status,
    progress: job.progress ? {
      ...job.progress,
      ...patch,
    } : undefined,
    errorMessage: patch.errorMessage ?? job.errorMessage,
    updatedAt: patch.now ?? new Date().toISOString(),
  };
}
