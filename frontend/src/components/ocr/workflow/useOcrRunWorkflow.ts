import React from 'react';
import type {
  OcrJobRunnerPageInput,
  OcrJobRunnerSnapshot,
} from '@/core/ocr/ocrJobRunner';
import { useShallow } from 'zustand/react/shallow';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  createOcrAbortControllerWithTimeout,
  createOcrExecutionPlan,
  createOcrExecutionPolicy,
  type OcrExecutionPolicy,
} from '@/core/ocr/ocrExecutionPolicy';
import {
  createRetryTasksFromFailedBatches,
  mergeOcrBatchRetrySnapshot,
  runOcrBatchScheduler,
  type OcrBatchSchedulerSnapshot,
} from '@/core/ocr/ocrBatchScheduler';
import {
  createOcrResumeToken,
  ocrResumeExecutionConfigMatches,
} from '@/core/ocr/ocrResumeState';
import {
  runFinalOcrIntegrationJob,
} from '@/core/ocr/ocrFinalIntegration';
import {
  runOcrPipeline,
  type OcrPipelineMode,
} from '@/core/ocr/ocrPipelineMode';

export type OcrRunWorkflowState = 'idle' | 'ready' | 'running' | 'complete' | 'error';

export interface UseOcrRunWorkflowInput {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
}

export interface UseOcrRunWorkflowResult {
  state: OcrRunWorkflowState;
  effectiveDocumentFingerprint: string;
  selectedPages: number[];
  requestedPageIndexes: number[];
  canRun: boolean;
  canClear: boolean;
  canCancel: boolean;
  isRunning: boolean;
  hasPendingResume: boolean;
  pipelineMode: OcrPipelineMode;
  setPipelineMode: React.Dispatch<React.SetStateAction<OcrPipelineMode>>;
  executionPolicy: OcrExecutionPolicy;
  setExecutionPolicy: React.Dispatch<React.SetStateAction<OcrExecutionPolicy>>;
  executionDiagnostics: string[];
  pipelineMessages: string[];
  errorMessage: string | null;
  estimatedMemoryBytes: number;
  batchSnapshot: OcrBatchSchedulerSnapshot | null;
  runSelectedOcr: () => Promise<void>;
  clearOcr: () => void;
  cancelActiveOcr: () => void;
  cancelBatchQueue: () => void;
  retryFailedBatches: () => Promise<void>;
}

export function useOcrRunWorkflow({
  documentFingerprint,
  selectedPageIndexes = [],
  pageCount = 1,
  pages,
  pdfBytes = null,
}: UseOcrRunWorkflowInput): UseOcrRunWorkflowResult {
  const store = useOcrStore(useShallow((state) => ({
    clearOcr: state.clearOcr,
    correctedResult: state.correctedResult,
    documentFingerprint: state.documentFingerprint,
    engineId: state.engineId,
    forceOcr: state.forceOcr,
    profileId: state.profileId,
    resumeToken: state.resumeToken,
    result: state.result,
    selectedPageIndexes: state.selectedPageIndexes,
  })));

  const effectiveDocumentFingerprint =
    documentFingerprint
    ?? store.documentFingerprint
    ?? 'ocr-preview-document';

  const [isRunning, setIsRunning] = React.useState(false);
  const [pipelineMode, setPipelineMode] = React.useState<OcrPipelineMode>('main');
  const [pipelineMessages, setPipelineMessages] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [executionPolicy, setExecutionPolicy] = React.useState<OcrExecutionPolicy>(() =>
    createOcrExecutionPolicy(),
  );
  const [activeAbort, setActiveAbort] = React.useState<ReturnType<typeof createOcrAbortControllerWithTimeout> | null>(null);
  const [executionDiagnostics, setExecutionDiagnostics] = React.useState<string[]>([]);
  const [estimatedMemoryBytes, setEstimatedMemoryBytes] = React.useState(0);
  const [batchSnapshot, setBatchSnapshot] = React.useState<OcrBatchSchedulerSnapshot | null>(null);
  const [lastBatchController, setLastBatchController] = React.useState<AbortController | null>(null);

  const selectedPages = React.useMemo(
    () => selectedPageIndexes.length > 0
      ? selectedPageIndexes
      : store.selectedPageIndexes,
    [selectedPageIndexes, store.selectedPageIndexes],
  );

  const requestedPageIndexes = React.useMemo(() => {
    if (selectedPages.length > 0) return selectedPages;

    if (store.resumeToken) {
      return [...new Set(
        store.resumeToken.tasks.flatMap((task) => task.pageIndexes),
      )].sort((a, b) => a - b);
    }

    return Array.from(
      { length: Math.max(1, pageCount) },
      (_, index) => index,
    );
  }, [pageCount, selectedPages, store.resumeToken]);

  const hasCurrentDocumentResult = store.correctedResult?.documentFingerprint === effectiveDocumentFingerprint;
  const hasInputSource = Boolean(pdfBytes || (pages && pages.length > 0));
  const currentResumeExecutionConfig = {
    forceOcr: store.forceOcr,
    rasterScale: executionPolicy.rasterScale,
    maxCanvasPixels: executionPolicy.maxCanvasPixels,
  };

  const applicableResumeToken =
    store.resumeToken
    && resumeTokenMatchesPageScope(
      store.resumeToken.tasks,
      requestedPageIndexes,
    )
    && ocrResumeExecutionConfigMatches(
      store.resumeToken.executionConfig,
      currentResumeExecutionConfig,
    )
      ? store.resumeToken
      : null;

  const hasPendingResume = Boolean(
    applicableResumeToken?.tasks.some((task) => task.status !== 'completed'),
  );

  const state: OcrRunWorkflowState = isRunning
    ? 'running'
    : errorMessage
      ? 'error'
      : hasPendingResume && hasInputSource
        ? 'ready'
        : hasCurrentDocumentResult
          ? 'complete'
          : hasInputSource && requestedPageIndexes.length > 0
            ? 'ready'
            : 'idle';

  const canRun = !isRunning && hasInputSource && requestedPageIndexes.length > 0;
  const canClear = !isRunning;
  const canCancel = isRunning || Boolean(activeAbort) || Boolean(lastBatchController);

  const cancelActiveOcr = React.useCallback(() => {
    if (!isRunning && !activeAbort && !lastBatchController) return;

    activeAbort?.cancel();
    lastBatchController?.abort();
    setActiveAbort(null);
    setLastBatchController(null);
    setIsRunning(false);
    setErrorMessage('OCR job cancelled.');
  }, [activeAbort, isRunning, lastBatchController]);

  const cancelBatchQueue = React.useCallback(() => {
    lastBatchController?.abort();
    setLastBatchController(null);
  }, [lastBatchController]);

  const captureBatchSnapshot = React.useCallback((
    snapshot: OcrBatchSchedulerSnapshot,
  ) => {
    setBatchSnapshot(snapshot);
    useOcrStore.getState().setOcrResumeToken(
      createOcrResumeToken({
        documentFingerprint: effectiveDocumentFingerprint,
        engineId: store.engineId,
        profileId: store.profileId,
        executionConfig: currentResumeExecutionConfig,
        snapshot,
      }),
    );
  }, [
    effectiveDocumentFingerprint,
    currentResumeExecutionConfig.forceOcr,
    currentResumeExecutionConfig.maxCanvasPixels,
    currentResumeExecutionConfig.rasterScale,
    store.engineId,
    store.profileId,
  ]);

  const retryFailedBatches = React.useCallback(async () => {
    if (!batchSnapshot) return;

    const retryTasks = createRetryTasksFromFailedBatches(batchSnapshot);

    if (retryTasks.length === 0) return;

    const controller = new AbortController();
    setLastBatchController(controller);

    try {
      await runOcrBatchScheduler({
        tasks: retryTasks,
        concurrency: 1,
        signal: controller.signal,
        runTask: async (task, signal) => {
          const pipelineResult = await runOcrPipeline({
            id: task.id,
            documentFingerprint: effectiveDocumentFingerprint,
            engineId: store.engineId,
            requestedProfileId: store.profileId,
            forceOcr: store.forceOcr,
            mode: pipelineMode,
            explicitPages: task.input,
            pageIndexes: task.pageIndexes,
            rasterScale: executionPolicy.rasterScale,
            maxCanvasPixels: executionPolicy.maxCanvasPixels,
            signal,
            onRasterProgress: (message: string) => {
              setPipelineMessages((current) => [...current.slice(-8), message]);
            },
            onProgress: (snapshot: OcrJobRunnerSnapshot) => {
              useOcrStore.getState().applyOcrJobSnapshot(snapshot);
            },
          });

          const failedPageIndexes = pipelineResult.result.pages
            .filter((page) => page.status === 'failed')
            .map((page) => page.pageIndex);

          if (failedPageIndexes.length > 0) {
            throw new Error(
              `OCR batch ${task.id} returned failed page(s): ${failedPageIndexes.join(', ')}.`,
            );
          }

          setPipelineMessages((current) => [
            ...current.slice(-8),
            `OCR pipeline completed through ${pipelineResult.mode.option.label}.`,
          ]);

          return task.pageIndexes;
        },
        onSnapshot: (retrySnapshot) => {
          const merged = mergeOcrBatchRetrySnapshot(
            batchSnapshot,
            retrySnapshot,
          );
          captureBatchSnapshot(merged);
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'OCR retry failed.',
      );
    } finally {
      setLastBatchController(null);
    }
  }, [
    batchSnapshot,
    captureBatchSnapshot,
    effectiveDocumentFingerprint,
    executionPolicy.maxCanvasPixels,
    executionPolicy.rasterScale,
    pipelineMode,
    store.engineId,
    store.forceOcr,
    store.profileId,
  ]);

  const runSelectedOcr = React.useCallback(async () => {
    if (!canRun) return;

    setIsRunning(true);
    setErrorMessage(null);
    setExecutionDiagnostics([]);
    setPipelineMessages([]);

    const plan = createOcrExecutionPlan({
      requestedPageIndexes,
      totalPages: Math.max(1, pageCount),
      policy: executionPolicy,
    });

    setEstimatedMemoryBytes(plan.estimatedRasterMemoryBytes);
    setExecutionDiagnostics(plan.diagnostics.map((diagnostic) => diagnostic.message));

    if (plan.diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
      setErrorMessage(plan.diagnostics.find((diagnostic) => diagnostic.level === 'error')?.message ?? 'OCR execution plan failed.');
      setIsRunning(false);
      return;
    }

    const abort = createOcrAbortControllerWithTimeout({
      timeoutMs: executionPolicy.timeoutMs,
      onTimeout: () => {
        setErrorMessage('OCR timeout reached.');
      },
    });

    setActiveAbort(abort);
    setLastBatchController(abort.controller);

    try {
      const finalResult = await runFinalOcrIntegrationJob({
        id: `ocr-job-${Date.now()}`,
        documentFingerprint: effectiveDocumentFingerprint,
        engineId: store.engineId,
        requestedProfileId: store.profileId,
        resumeToken: applicableResumeToken,
        existingResult: applicableResumeToken ? store.result : null,
        forceOcr: store.forceOcr,
        mode: pipelineMode,
        pdfBytes,
        explicitPages: pages,
        requestedPageIndexes,
        totalPages: Math.max(1, pageCount),
        policy: executionPolicy,
        batchSize: Math.max(1, Math.min(5, executionPolicy.maxPagesPerJob)),
        batchConcurrency: 1,
        signal: abort.controller.signal,
        onDiagnostic: (diagnostic) => {
          setPipelineMessages((current) => [
            ...current.slice(-8),
            diagnostic.message,
          ]);
        },
        onBatchSnapshot: captureBatchSnapshot,
        onProgress: (snapshot) => {
          useOcrStore.getState().applyOcrJobSnapshot(snapshot);
        },
      });

      useOcrStore.getState().setOcrResult(finalResult.result);

      setPipelineMessages((current) => [
        ...current.slice(-8),
        `OCR completed through ${finalResult.mode}.`,
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'OCR job failed.',
      );
    } finally {
      abort.clear();
      setActiveAbort(null);
      setLastBatchController(null);
      setIsRunning(false);
    }
  }, [
    canRun,
    captureBatchSnapshot,
    effectiveDocumentFingerprint,
    executionPolicy,
    pageCount,
    pages,
    pdfBytes,
    pipelineMode,
    requestedPageIndexes,
    applicableResumeToken,
    store.engineId,
    store.forceOcr,
    store.profileId,
    store.result,
  ]);

  const clearOcr = React.useCallback(() => {
    if (!canClear) return;

    store.clearOcr();
    setErrorMessage(null);
    setExecutionDiagnostics([]);
    setPipelineMessages([]);
    setEstimatedMemoryBytes(0);
    setBatchSnapshot(null);
  }, [canClear, store]);

  return {
    state,
    effectiveDocumentFingerprint,
    selectedPages,
    requestedPageIndexes,
    canRun,
    canClear,
    canCancel,
    isRunning,
    hasPendingResume,
    pipelineMode,
    setPipelineMode,
    executionPolicy,
    setExecutionPolicy,
    executionDiagnostics,
    pipelineMessages,
    errorMessage,
    estimatedMemoryBytes,
    batchSnapshot,
    runSelectedOcr,
    clearOcr,
    cancelActiveOcr,
    cancelBatchQueue,
    retryFailedBatches,
  };
function resumeTokenMatchesPageScope(
  tasks: Array<{ pageIndexes: number[] }>,
  requestedPageIndexes: number[],
): boolean {
  const tokenPages = [...new Set(
    tasks.flatMap((task) => task.pageIndexes),
  )].sort((a, b) => a - b);

  const requestedPages = [...new Set(requestedPageIndexes)]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0)
    .sort((a, b) => a - b);

  return tokenPages.length === requestedPages.length
    && tokenPages.every(
      (pageIndex, index) => pageIndex === requestedPages[index],
    );
}

}
