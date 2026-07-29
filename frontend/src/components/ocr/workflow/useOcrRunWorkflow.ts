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
  runOcrBatchScheduler,
  type OcrBatchSchedulerSnapshot,
} from '@/core/ocr/ocrBatchScheduler';
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

  const requestedPageIndexes = React.useMemo(
    () => selectedPages.length > 0
      ? selectedPages
      : Array.from(
          { length: Math.max(1, pageCount) },
          (_, index) => index,
        ),
    [pageCount, selectedPages],
  );

  const hasCurrentDocumentResult = store.correctedResult?.documentFingerprint === effectiveDocumentFingerprint;

  const state: OcrRunWorkflowState = isRunning
    ? 'running'
    : errorMessage
      ? 'error'
      : hasCurrentDocumentResult
        ? 'complete'
        : requestedPageIndexes.length > 0
          ? 'ready'
          : 'idle';

  const canRun = !isRunning && requestedPageIndexes.length > 0;
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

          setPipelineMessages((current) => [
            ...current.slice(-8),
            `OCR pipeline completed through ${pipelineResult.mode.option.label}.`,
          ]);

          return task.pageIndexes;
        },
        onSnapshot: setBatchSnapshot,
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
        onBatchSnapshot: setBatchSnapshot,
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
    effectiveDocumentFingerprint,
    executionPolicy,
    pageCount,
    pages,
    pdfBytes,
    pipelineMode,
    requestedPageIndexes,
    store.engineId,
    store.forceOcr,
    store.profileId,
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
}
