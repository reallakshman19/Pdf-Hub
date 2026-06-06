import type {
  OcrDocumentResult,
  OcrPageResult,
  OcrDiagnostic,
} from './types';
import type {
  OcrEngine,
  OcrEnginePageInput,
  OcrEngineRegistry,
} from './engines/ocrEngineContract';
import {
  createQueuedOcrJob,
  updateOcrJobProgress,
  type OcrJob,
  type OcrJobStatus,
} from './ocrJobTypes';
import {
  runOcrPreflight,
  type OcrPreflightResult,
} from './ocrPreflight';
import { getOcrProfile, type OcrProfileId } from './ocrProfiles';
import { defaultOcrEngineRegistry } from './engines/ocrEngineRegistry';

export interface OcrJobRunnerPageInput {
  pageIndex: number;
  imageBytes: Uint8Array;
  width: number;
  height: number;

  embeddedTextLength?: number;
  imageCount?: number;
  vectorObjectCount?: number;
  detectedGridLikeRegions?: number;
  detectedFormFields?: number;
  detectedLargeImages?: number;
  detectedTitleBlockLikeRegions?: number;
}

export interface RunOcrJobInput {
  id: string;
  documentFingerprint: string;
  engineId?: string;
  requestedProfileId?: OcrProfileId;
  forceOcr?: boolean;
  selectedPageIndexes?: number[];
  pages: OcrJobRunnerPageInput[];
  registry?: OcrEngineRegistry;
  now?: string;

  /**
   * Optional cancellation signal.
   */
  signal?: AbortSignal;

  /**
   * Progress callback for UI/job store integration.
   */
  onProgress?: (snapshot: OcrJobRunnerSnapshot) => void;
}

export interface OcrJobRunnerSnapshot {
  job: OcrJob;
  partialResult: OcrDocumentResult;
  preflight: OcrPreflightResult;
  message?: string;
}

export interface OcrJobRunnerResult {
  job: OcrJob;
  result: OcrDocumentResult;
  preflight: OcrPreflightResult;
}

export class OcrJobCancelledError extends Error {
  constructor() {
    super('OCR job was cancelled.');
    this.name = 'OcrJobCancelledError';
  }
}

export async function runOcrJob(
  input: RunOcrJobInput,
): Promise<OcrJobRunnerResult> {
  const registry = input.registry ?? defaultOcrEngineRegistry;
  const engineId = input.engineId ?? 'mock';
  const engine = registry.getEngine(engineId);

  const preflight = runOcrPreflight({
    documentFingerprint: input.documentFingerprint,
    pages: input.pages.map((page) => ({
      pageIndex: page.pageIndex,
      width: page.width,
      height: page.height,
      embeddedTextLength: page.embeddedTextLength,
      imageCount: page.imageCount,
      vectorObjectCount: page.vectorObjectCount,
      detectedGridLikeRegions: page.detectedGridLikeRegions,
      detectedFormFields: page.detectedFormFields,
      detectedLargeImages: page.detectedLargeImages,
      detectedTitleBlockLikeRegions: page.detectedTitleBlockLikeRegions,
    })),
    requestedProfileId: input.requestedProfileId,
    forceOcr: input.forceOcr,
    selectedPageIndexes: input.selectedPageIndexes,
  });

  let job = createQueuedOcrJob({
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    engineId,
    profileId: input.requestedProfileId ?? 'clean-scan',
    pageIndexes: preflight.queuedPageIndexes,
    now: input.now,
  });

  const result = createEmptyOcrDocumentResult({
    documentFingerprint: input.documentFingerprint,
    engineId,
    profileId: input.requestedProfileId ?? 'clean-scan',
    createdAt: input.now,
  });

  if (!engine) {
    const failedJob = updateOcrJobProgress(job, {
      status: 'failed',
      errorMessage: `OCR engine not found: ${engineId}`,
      now: input.now,
    });

    return {
      job: failedJob,
      result: {
        ...result,
        diagnostics: [
          ...result.diagnostics,
          {
            level: 'error',
            code: 'OCR_ENGINE_FAILED',
            message: `OCR engine not found: ${engineId}`,
          },
        ],
      },
      preflight,
    };
  }

  if (preflight.queuedPageIndexes.length === 0) {
    const completedJob = updateOcrJobProgress(job, {
      status: 'completed',
      now: input.now,
    });

    const skippedResult: OcrDocumentResult = {
      ...result,
      pages: preflight.pageDecisions
        .filter((decision) => !decision.shouldQueue)
        .map((decision) =>
          createSkippedPageResult({
            pageIndex: decision.pageIndex,
            width: getPageByIndex(input.pages, decision.pageIndex)?.width ?? 0,
            height: getPageByIndex(input.pages, decision.pageIndex)?.height ?? 0,
            profileId: decision.profile.id,
            diagnostics: decision.diagnostics,
          }),
        ),
      diagnostics: [
        ...result.diagnostics,
        ...preflight.diagnostics,
      ],
    };

    emitProgress(input.onProgress, {
      job: completedJob,
      partialResult: skippedResult,
      preflight,
    });

    return {
      job: completedJob,
      result: skippedResult,
      preflight,
    };
  }

  job = updateOcrJobProgress(job, {
    status: 'running',
    now: input.now,
  });

  emitProgress(input.onProgress, {
    job,
    partialResult: result,
    preflight,
  });

  const completedPages: OcrPageResult[] = [];
  const documentDiagnostics: OcrDiagnostic[] = [...preflight.diagnostics];

  for (const pageIndex of preflight.queuedPageIndexes) {
    throwIfCancelled(input.signal);

    const page = getPageByIndex(input.pages, pageIndex);

    if (!page) {
      documentDiagnostics.push({
        level: 'error',
        code: 'OCR_ENGINE_FAILED',
        pageIndex,
        message: `Page input not found for OCR pageIndex ${pageIndex}.`,
      });

      job = updateOcrJobProgress(job, {
        status: 'partial',
        failedPages: (job.progress?.failedPages ?? 0) + 1,
        currentPageIndex: pageIndex,
        now: input.now,
      });

      emitProgress(input.onProgress, {
        job,
        partialResult: {
          ...result,
          pages: completedPages,
          diagnostics: documentDiagnostics,
        },
        preflight,
      });

      continue;
    }

    job = updateOcrJobProgress(job, {
      status: 'running',
      currentPageIndex: pageIndex,
      now: input.now,
    });

    emitProgress(input.onProgress, {
      job,
      partialResult: {
        ...result,
        pages: completedPages,
        diagnostics: documentDiagnostics,
      },
      preflight,
    });

    const decision = preflight.pageDecisions.find(
      (item) => item.pageIndex === pageIndex,
    );

    const profile = decision?.profile ?? getOcrProfile(input.requestedProfileId ?? 'clean-scan');

    try {
      const pageResult = await recognizeSinglePage({
        engine,
        documentFingerprint: input.documentFingerprint,
        page,
        profileId: profile.id,
      });

      completedPages.push(pageResult);

      job = updateOcrJobProgress(job, {
        status: 'running',
        completedPages: (job.progress?.completedPages ?? 0) + 1,
        currentPageIndex: pageIndex,
        now: input.now,
      });

      emitProgress(input.onProgress, {
        job,
        partialResult: {
          ...result,
          pages: completedPages,
          diagnostics: documentDiagnostics,
        },
        preflight,
      });
    } catch (error) {
      if (error instanceof OcrJobCancelledError) {
        throw error;
      }

      documentDiagnostics.push({
        level: 'error',
        code: 'OCR_ENGINE_FAILED',
        pageIndex,
        message: error instanceof Error
          ? error.message
          : 'Unknown OCR page recognition failure.',
      });

      completedPages.push(
        createFailedPageResult({
          pageIndex,
          width: page.width,
          height: page.height,
          message: error instanceof Error
            ? error.message
            : 'Unknown OCR page recognition failure.',
        }),
      );

      job = updateOcrJobProgress(job, {
        status: 'partial',
        failedPages: (job.progress?.failedPages ?? 0) + 1,
        currentPageIndex: pageIndex,
        now: input.now,
      });

      emitProgress(input.onProgress, {
        job,
        partialResult: {
          ...result,
          pages: completedPages,
          diagnostics: documentDiagnostics,
        },
        preflight,
      });
    }
  }

  const finalStatus = finalJobStatus(job);

  const finalJob = updateOcrJobProgress(job, {
    status: finalStatus,
    currentPageIndex: undefined,
    now: input.now,
  });

  const finalResult: OcrDocumentResult = {
    ...result,
    pages: sortPagesByIndex([
      ...completedPages,
      ...preflight.pageDecisions
        .filter((decision) => !decision.shouldQueue)
        .map((decision) =>
          createSkippedPageResult({
            pageIndex: decision.pageIndex,
            width: getPageByIndex(input.pages, decision.pageIndex)?.width ?? 0,
            height: getPageByIndex(input.pages, decision.pageIndex)?.height ?? 0,
            profileId: decision.profile.id,
            diagnostics: decision.diagnostics,
          }),
        ),
    ]),
    diagnostics: documentDiagnostics,
  };

  emitProgress(input.onProgress, {
    job: finalJob,
    partialResult: finalResult,
    preflight,
  });

  return {
    job: finalJob,
    result: finalResult,
    preflight,
  };
}

async function recognizeSinglePage(input: {
  engine: OcrEngine;
  documentFingerprint: string;
  page: OcrJobRunnerPageInput;
  profileId: OcrProfileId;
}): Promise<OcrPageResult> {
  const enginePage: OcrEnginePageInput = {
    pageIndex: input.page.pageIndex,
    imageBytes: input.page.imageBytes,
    width: input.page.width,
    height: input.page.height,
  };

  const engineResult = await input.engine.recognize({
    documentFingerprint: input.documentFingerprint,
    profile: getOcrProfile(input.profileId),
    pages: [enginePage],
  });

  const pageResult = engineResult.pages.find(
    (page) => page.pageIndex === input.page.pageIndex,
  );

  if (!pageResult) {
    throw new Error(`OCR engine returned no page result for pageIndex ${input.page.pageIndex}.`);
  }

  return pageResult;
}

function createEmptyOcrDocumentResult(input: {
  documentFingerprint: string;
  engineId: string;
  profileId: OcrProfileId;
  createdAt?: string;
}): OcrDocumentResult {
  return {
    documentFingerprint: input.documentFingerprint,
    createdAt: input.createdAt ?? new Date().toISOString(),
    engineId: input.engineId,
    profileId: input.profileId,
    pages: [],
    diagnostics: [],
  };
}

function createSkippedPageResult(input: {
  pageIndex: number;
  width: number;
  height: number;
  profileId: string;
  diagnostics: OcrDiagnostic[];
}): OcrPageResult {
  return {
    pageIndex: input.pageIndex,
    pageNumber: input.pageIndex + 1,
    status: 'skipped',
    pageType: 'bornDigital',
    orientationDeg: 0,
    languageHints: ['eng'],
    width: input.width,
    height: input.height,
    words: [],
    lines: [],
    blocks: [],
    diagnostics: input.diagnostics,
  };
}

function createFailedPageResult(input: {
  pageIndex: number;
  width: number;
  height: number;
  message: string;
}): OcrPageResult {
  return {
    pageIndex: input.pageIndex,
    pageNumber: input.pageIndex + 1,
    status: 'failed',
    pageType: 'unknown',
    orientationDeg: 0,
    languageHints: [],
    width: input.width,
    height: input.height,
    words: [],
    lines: [],
    blocks: [],
    diagnostics: [
      {
        level: 'error',
        code: 'OCR_ENGINE_FAILED',
        pageIndex: input.pageIndex,
        message: input.message,
      },
    ],
  };
}

function finalJobStatus(job: OcrJob): OcrJobStatus {
  const failed = job.progress?.failedPages ?? 0;
  const completed = job.progress?.completedPages ?? 0;

  if (failed > 0 && completed > 0) {
    return 'partial';
  }

  if (failed > 0) {
    return 'failed';
  }

  return 'completed';
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new OcrJobCancelledError();
  }
}

function emitProgress(
  callback: RunOcrJobInput['onProgress'],
  snapshot: OcrJobRunnerSnapshot,
): void {
  callback?.(snapshot);
}

function getPageByIndex(
  pages: OcrJobRunnerPageInput[],
  pageIndex: number,
): OcrJobRunnerPageInput | undefined {
  return pages.find((page) => page.pageIndex === pageIndex);
}

function sortPagesByIndex(
  pages: OcrPageResult[],
): OcrPageResult[] {
  return [...pages].sort((a, b) => (a.pageIndex ?? 0) - (b.pageIndex ?? 0));
}
