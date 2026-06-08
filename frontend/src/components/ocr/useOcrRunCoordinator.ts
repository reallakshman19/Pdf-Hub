import React from 'react';
import type {
  OcrJobRunnerPageInput,
  OcrJobRunnerSnapshot,
} from '@/core/ocr/ocrJobRunner';
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
import { runFinalOcrIntegrationJob } from '@/core/ocr/ocrFinalIntegration';
import {
  runOcrPipeline,
  type OcrPipelineMode,
} from '@/core/ocr/ocrPipelineMode';
import type { OcrDiagnosticsMessage } from './sections';

export interface UseOcrRunCoordinatorArgs {
  effectiveDocumentFingerprint: string;
  selectedPages: number[];
  pageCount: number;
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
}

export function useOcrRunCoordinator({
  effectiveDocumentFingerprint,
  selectedPages,
  pageCount,
  pages,
  pdfBytes,
}: UseOcrRunCoordinatorArgs) {
  const store = useOcrStore();
  const [isRunning, setIsRunning] = React.useState(false);
  const [pipelineMode, setPipelineMode] = React.useState<OcrPipelineMode>('main');
  const [pipelineMessages, setPipelineMessages] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [executionPolicy, setExecutionPolicy] = React.useState<OcrExecutionPolicy>(() =>
    createOcrExecutionPolicy(),
  );
  const [activeAbort, setActiveAbort] = React.useState<{
    cancel: () => void;
    clear: () => void;
    controller: AbortController;
  } | null>(null);
  const [executionDiagnostics, setExecutionDiagnostics] = React.useState<string[]>([]);
  const [estimatedMemoryBytes, setEstimatedMemoryBytes] = React.useState(0);
  const [batchSnapshot, setBatchSnapshot] = React.useState<OcrBatchSchedulerSnapshot | null>(null);
  const [lastBatchController, setLastBatchController] = React.useState<AbortController | null>(null);

  const cancelActiveOcr = React.useCallback(() => {
    activeAbort?.cancel();
    setActiveAbort(null);
    setIsRunning(false);
    setErrorMessage('OCR job cancelled.');
  }, [activeAbort]);

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

    setLastBatchController(null);
  }, [
    batchSnapshot,
    effectiveDocumentFingerprint,
    executionPolicy,
    pipelineMode,
    store.engineId,
    store.forceOcr,
    store.profileId,
  ]);

  const runSelectedOcr = React.useCallback(async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setExecutionDiagnostics([]);
    setPipelineMessages([]);

    const requestedPageIndexes = selectedPages.length > 0
      ? selectedPages
      : Array.from({ length: Math.max(1, pageCount) }, (_, index) => index);

    const plan = createOcrExecutionPlan({
      requestedPageIndexes,
      totalPages: Math.max(1, pageCount),
      policy: executionPolicy,
    });

    setEstimatedMemoryBytes(plan.estimatedRasterMemoryBytes);
    setExecutionDiagnostics(plan.diagnostics.map((diagnostic) => diagnostic.message));

    if (plan.diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
      setErrorMessage(
        plan.diagnostics.find((diagnostic) => diagnostic.level === 'error')?.message
          ?? 'OCR execution plan failed.',
      );
      setIsRunning(false);
      return;
    }

    const abort = createOcrAbortControllerWithTimeout({
      timeoutMs: executionPolicy.timeoutMs,
      onTimeout: () => setErrorMessage('OCR timeout reached.'),
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
          setPipelineMessages((current) => [...current.slice(-8), diagnostic.message]);
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
      setErrorMessage(error instanceof Error ? error.message : 'OCR job failed.');
    } finally {
      abort.clear();
      setActiveAbort(null);
      setLastBatchController(null);
      setIsRunning(false);
    }
  }, [
    effectiveDocumentFingerprint,
    executionPolicy,
    pageCount,
    pages,
    pdfBytes,
    pipelineMode,
    selectedPages,
    store.engineId,
    store.forceOcr,
    store.profileId,
  ]);

  const clearOcr = React.useCallback(() => {
    store.clearOcr();
    setErrorMessage(null);
  }, [store]);

  const allDiagnostics = React.useMemo<OcrDiagnosticsMessage[]>(() => [
    ...executionDiagnostics.map((message) => ({ level: 'info' as const, code: 'OCR_EXECUTION', message })),
    ...pipelineMessages.map((message) => ({ level: 'info' as const, code: 'OCR_PIPELINE', message })),
  ], [executionDiagnostics, pipelineMessages]);

  return {
    isRunning,
    pipelineMode,
    setPipelineMode,
    errorMessage,
    executionPolicy,
    setExecutionPolicy,
    executionDiagnostics,
    estimatedMemoryBytes,
    batchSnapshot,
    allDiagnostics,
    cancelActiveOcr,
    cancelBatchQueue,
    retryFailedBatches,
    runSelectedOcr,
    clearOcr,
  };
}
