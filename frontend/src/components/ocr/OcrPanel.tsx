import React from 'react';
import type {
  OcrJobRunnerPageInput,
  OcrJobRunnerSnapshot,
} from '@/core/ocr/ocrJobRunner';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  resolveOcrRegionPageInput,
} from '@/core/ocr/ocrRegionRasterBridge';
import { OcrProgressPanel } from './OcrProgressPanel';
import { OcrResultSummary } from './OcrResultSummary';
import { OcrSearchMiniPanel } from './OcrSearchMiniPanel';
import { OcrConfidenceLegend } from './OcrConfidenceLegend';
import { OcrLowConfidencePanel } from './OcrLowConfidencePanel';
import { OcrCorrectionPanel } from './OcrCorrectionPanel';
import { OcrRegionTool } from './OcrRegionTool';
import { OcrRegionListPanel } from './OcrRegionListPanel';
import { OcrRegionActionPanel } from './OcrRegionActionPanel';
import type { OcrTableBlock } from '@/core/ocr/types';
import { OcrTableReviewPanel } from './OcrTableReviewPanel';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  createReviewedOcrTableWriterElement,
  upsertOcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrWriterInsertPanel } from './OcrWriterInsertPanel';
import { OcrSearchablePdfExportPanel } from './OcrSearchablePdfExportPanel';
import { OcrProjectRestorePanel } from './OcrProjectRestorePanel';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import {
  createOcrAbortControllerWithTimeout,
  createOcrExecutionPlan,
  createOcrExecutionPolicy,
  type OcrExecutionPolicy,
} from '@/core/ocr/ocrExecutionPolicy';
import { OcrExecutionSettingsPanel } from './OcrExecutionSettingsPanel';
import {
  createRetryTasksFromFailedBatches,
  runOcrBatchScheduler,
  type OcrBatchSchedulerSnapshot,
} from '@/core/ocr/ocrBatchScheduler';
import { OcrBatchQueuePanel } from './OcrBatchQueuePanel';
import {
  runFinalOcrIntegrationJob,
} from '@/core/ocr/ocrFinalIntegration';
import {
  runOcrPipeline,
  type OcrPipelineMode,
} from '@/core/ocr/ocrPipelineMode';
import { OcrPipelineModePanel } from './OcrPipelineModePanel';
import {
  OcrDiagnosticsSection,
  OcrExportSection,
  OcrProjectSection,
  OcrReviewSection,
  OcrRunSection,
  type OcrDiagnosticsMessage,
} from './sections';
import {
  OcrEngineControls,
  OcrRunActions,
} from './workflow/OcrRunControls';

export interface OcrPanelProps {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;

  /**
   * Real raster inputs can be supplied later by PDF.js page rendering.
   * For now, Phase 8 can run mock OCR with generated placeholder page inputs.
   */
  pages?: OcrJobRunnerPageInput[];

  /**
   * Future Writer integration point.
   * Caller can connect this to writerV2Store insertion actions.
   */
  onInsertWriterElements?: (elements: WriterElementV2[]) => void;

  /**
   * Optional original PDF bytes for searchable PDF export.
   */
  pdfBytes?: Uint8Array | null;

  /**
   * Caller can download/save the output.
   */
  onSearchablePdfExported?: (bytes: Uint8Array) => void;

  /**
   * Optional project payload for restoration tab.
   */
  projectPayload?: OcrProjectPayloadV1 | null;
}

export const OcrPanel: React.FC<OcrPanelProps> = ({
  documentFingerprint,
  selectedPageIndexes = [],
  pageCount = 1,
  pages,
  onInsertWriterElements,
  pdfBytes = null,
  onSearchablePdfExported,
  projectPayload = null,
}) => {
  const store = useOcrStore();

  const effectiveDocumentFingerprint =
    documentFingerprint
    ?? store.documentFingerprint
    ?? 'ocr-preview-document';

  const [isRunning, setIsRunning] = React.useState(false);
  const [pipelineMode, setPipelineMode] = React.useState<OcrPipelineMode>('main');
  const [pipelineMessages, setPipelineMessages] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [selectedLowConfidenceWordId, setSelectedLowConfidenceWordId] = React.useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = React.useState<string | null>(null);
  const [lastRegionWriterElementType, setLastRegionWriterElementType] = React.useState<string | null>(null);
  const [lastRegionTableBlock, setLastRegionTableBlock] = React.useState<OcrTableBlock | null>(null);
  const [lastAcceptedTableSummary, setLastAcceptedTableSummary] = React.useState<string | null>(null);
  const [writerInsertionQueue, setWriterInsertionQueue] = React.useState<OcrWriterInsertionQueueState>(() =>
    createOcrWriterInsertionQueue(),
  );
  const [lastInsertedWriterCount, setLastInsertedWriterCount] = React.useState<number | null>(null);

  const [executionPolicy, setExecutionPolicy] = React.useState<OcrExecutionPolicy>(() =>
    createOcrExecutionPolicy(),
  );
  const [activeAbort, setActiveAbort] = React.useState<{
    cancel: () => void;
    clear: () => void;
  } | null>(null);
  const [executionDiagnostics, setExecutionDiagnostics] = React.useState<string[]>([]);
  const [estimatedMemoryBytes, setEstimatedMemoryBytes] = React.useState(0);

  const cancelActiveOcr = React.useCallback(() => {
    activeAbort?.cancel();
    setActiveAbort(null);
    setIsRunning(false);
    setErrorMessage('OCR job cancelled.');
  }, [activeAbort]);

  const [batchSnapshot, setBatchSnapshot] = React.useState<OcrBatchSchedulerSnapshot | null>(null);
  const [lastBatchController, setLastBatchController] = React.useState<AbortController | null>(null);

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
    store.engineId,
    store.forceOcr,
    store.profileId,
    pipelineMode,
    executionPolicy,
  ]);

  const selectedRegion = React.useMemo(() => {
    if (!selectedRegionId) return null;

    return store.regions.find((region) => region.id === selectedRegionId) ?? null;
  }, [
    selectedRegionId,
    store.regions,
  ]);

  const selectedRegionPageInput = React.useMemo(() => {
    if (!selectedRegion) return null;

    const existing = pages?.find((page) => page.pageIndex === selectedRegion.pageIndex);

    if (existing) return existing;

    return {
      pageIndex: selectedRegion.pageIndex,
      imageBytes: new Uint8Array([1, 2, 3]),
      width: 595,
      height: 842,
      imageCount: 1,
      region: selectedRegion.bbox,
    };
  }, [
    pages,
    selectedRegion,
  ]);

  const selectedLowConfidenceWord = React.useMemo(() => {
    if (!selectedLowConfidenceWordId) {
      return null;
    }

    return store.lowConfidenceWords.find(
      (item) => item.word.id === selectedLowConfidenceWordId,
    )?.word ?? null;
  }, [
    selectedLowConfidenceWordId,
    store.lowConfidenceWords,
  ]);

  const selectedPages = selectedPageIndexes.length > 0
    ? selectedPageIndexes
    : store.selectedPageIndexes;

  const queueWriterElement = React.useCallback((element: WriterElementV2, source: 'ocrRegion' | 'ocrTableReview') => {
    setWriterInsertionQueue((current) =>
      upsertOcrWriterInsertionCandidate(
        current,
        createOcrWriterInsertionCandidate({
          source,
          element,
        }),
      ),
    );
  }, []);

  const runSelectedOcr = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setExecutionDiagnostics([]);
    setPipelineMessages([]);

    const requestedPageIndexes = selectedPages.length > 0
      ? selectedPages
      : Array.from(
          { length: Math.max(1, pageCount) },
          (_, index) => index,
        );

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
  };

  const clearOcr = () => {
    store.clearOcr();
    setErrorMessage(null);
  };

  const sourceDiagnostics: OcrDiagnosticsMessage[] = [];

  const executionDiagnosticMessages: OcrDiagnosticsMessage[] = executionDiagnostics.map((message) => ({
    level: 'info',
    code: 'OCR_EXECUTION',
    message,
  }));

  const pipelineDiagnosticMessages: OcrDiagnosticsMessage[] = pipelineMessages.map((message) => ({
    level: 'info',
    code: 'OCR_PIPELINE',
    message,
  }));

  const allDiagnostics: OcrDiagnosticsMessage[] = [
    ...sourceDiagnostics,
    ...executionDiagnosticMessages,
    ...pipelineDiagnosticMessages,
  ];

  const engineControlsNode = (
    <OcrEngineControls
      engineId={store.engineId}
      profileId={store.profileId}
      forceOcr={store.forceOcr}
      onEngineChange={(engineId) => store.setOcrEngineId(engineId || 'mock')}
      onProfileChange={(profileId) => store.setOcrProfileId(profileId)}
      onForceOcrChange={(forceOcr) => store.setForceOcr(forceOcr)}
    />
  );

  const runControlsNode = (
    <OcrRunActions
      running={isRunning}
      onRun={runSelectedOcr}
      onClear={clearOcr}
    />
  );

  return (
    <div
      className="space-y-3"
      data-testid="ocr-panel"
    >
      <OcrRunSection
        engineControls={engineControlsNode}
        pipelineMode={
          <OcrPipelineModePanel
            mode={pipelineMode}
            disabled={isRunning}
            onChange={setPipelineMode}
          />
        }
        executionSettings={
          <OcrExecutionSettingsPanel
            policy={executionPolicy}
            estimatedMemoryBytes={estimatedMemoryBytes}
            running={isRunning}
            onChange={setExecutionPolicy}
            onCancel={cancelActiveOcr}
          />
        }
        executionDiagnostics={
          executionDiagnostics.length > 0 ? (
            <div className="space-y-2">
              {executionDiagnostics.map((message, index) => (
                <div key={`${message}-${index}`} className="text-xs text-slate-500">
                  {message}
                </div>
              ))}
            </div>
          ) : null
        }
        batchQueue={
          <OcrBatchQueuePanel
            snapshot={batchSnapshot}
            onCancel={cancelBatchQueue}
            onRetryFailed={retryFailedBatches}
          />
        }
        runControls={runControlsNode}
        errorMessage={errorMessage}
      />

      <OcrReviewSection
        resultSummary={
          store.correctedResult ? (
            <div className="space-y-2">
              <OcrResultSummary
                result={store.correctedResult}
                confidenceSummary={store.confidenceSummary}
                lowConfidenceCount={store.lowConfidenceWords.length}
              />
              <OcrConfidenceLegend compact />
            </div>
          ) : undefined
        }
        searchPanel={
          store.searchIndex ? (
            <OcrSearchMiniPanel
              disabled={!store.searchIndex}
              onSearch={(query) =>
                useOcrStore.getState().searchOcr({
                  text: query,
                  limit: 8,
                })
              }
            />
          ) : undefined
        }
        correctionsPanel={
          store.lowConfidenceWords.length > 0 || selectedLowConfidenceWord ? (
            <div className="space-y-2">
              <OcrLowConfidencePanel
                words={store.lowConfidenceWords}
                selectedWordId={selectedLowConfidenceWordId}
                onSelectWord={(item) => {
                  setSelectedLowConfidenceWordId(item.word.id);
                }}
              />
              <OcrCorrectionPanel
                word={selectedLowConfidenceWord}
                documentFingerprint={effectiveDocumentFingerprint}
              />
            </div>
          ) : undefined
        }
        regionTools={
          store.regions.length > 0 || store.correctedResult ? (
            <div className="space-y-2">
              <OcrRegionTool
                documentFingerprint={effectiveDocumentFingerprint}
                pageIndex={selectedPages[0] ?? 0}
                pageWidth={595}
                pageHeight={842}
                viewportWidth={240}
                viewportHeight={340}
                onCreateRegion={(region) => {
                  useOcrStore.getState().upsertOcrRegion(region);
                  setSelectedRegionId(region.id);
                }}
              />
              {store.regions.length > 0 ? (
                <OcrRegionListPanel
                  regions={store.regions}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={(region) => {
                    setSelectedRegionId(region.id);
                  }}
                  onDeleteRegion={(regionId) => {
                    useOcrStore.getState().deleteOcrRegion(regionId);
                    if (selectedRegionId === regionId) {
                      setSelectedRegionId(null);
                    }
                  }}
                />
              ) : null}
              <OcrRegionActionPanel
                region={selectedRegion}
                pageInput={selectedRegionPageInput}
                resolvePageInput={
                  selectedRegion
                    ? async (region) => {
                        const resolved = await resolveOcrRegionPageInput({
                          region,
                          pdfBytes,
                          fallbackPageInput: selectedRegionPageInput,
                          scale: 2,
                          mimeType: 'image/png',
                        });
                        return {
                          pageInput: resolved.pageInput,
                          diagnostics: resolved.diagnostics,
                        };
                      }
                    : undefined
                }
                onRegionResult={(result) => {
                  const tableBlock = result.blocks.find(
                    (block): block is OcrTableBlock => block.type === 'table',
                  );
                  setLastRegionTableBlock(tableBlock ?? null);
                  setLastAcceptedTableSummary(null);
                }}
                onWriterElementCreated={(element) => {
                  setLastRegionWriterElementType(element.type);
                  queueWriterElement(element, 'ocrRegion');
                }}
              />
              {lastRegionWriterElementType ? (
                <p
                  className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                  data-testid="ocr-region-writer-created"
                >
                  Region created Writer element: {lastRegionWriterElementType}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
        tableReview={
          lastRegionTableBlock ? (
            <div className="space-y-2">
              <OcrTableReviewPanel
                tableBlock={lastRegionTableBlock}
                onAcceptTable={(tableData) => {
                  setLastAcceptedTableSummary(
                    `${tableData.rows.length} rows × ${tableData.columns.length} columns`,
                  );
                  if (selectedRegion) {
                    const element = createReviewedOcrTableWriterElement({
                      documentFingerprint: effectiveDocumentFingerprint,
                      region: selectedRegion,
                      tableData,
                    });
                    queueWriterElement(element, 'ocrTableReview');
                  }
                }}
              />
              {lastAcceptedTableSummary ? (
                <p
                  className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  data-testid="ocr-table-accepted-summary"
                >
                  OCR table accepted: {lastAcceptedTableSummary}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
        writerInsertion={
          writerInsertionQueue.candidates.length > 0 || lastInsertedWriterCount !== null ? (
            <div className="space-y-2">
              <OcrWriterInsertPanel
                queue={writerInsertionQueue}
                onQueueChange={setWriterInsertionQueue}
                onInsertElements={(elements) => {
                  onInsertWriterElements?.(elements);
                  setLastInsertedWriterCount(elements.length);
                }}
              />
              {lastInsertedWriterCount !== null ? (
                <p
                  className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  data-testid="ocr-writer-inserted-summary"
                >
                  Inserted {lastInsertedWriterCount} OCR Writer element(s).
                </p>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <OcrExportSection
        searchablePdfExport={
          pdfBytes || store.correctedResult ? (
            <OcrSearchablePdfExportPanel
              pdfBytes={pdfBytes}
              ocrResult={store.correctedResult}
              corrections={store.corrections}
              onExported={(result) => {
                onSearchablePdfExported?.(result.bytes);
              }}
            />
          ) : undefined
        }
      />

      <OcrProjectSection
        restorePanel={
          <OcrProjectRestorePanel
            payload={projectPayload || null}
            expectedDocumentFingerprint={effectiveDocumentFingerprint}
            onWriterInsertionQueueRestored={setWriterInsertionQueue}
          />
        }
      />

      <OcrDiagnosticsSection
        messages={allDiagnostics}
      >
        <OcrProgressPanel
          jobs={store.jobs}
          activeJobId={store.activeJobId}
        />
      </OcrDiagnosticsSection>
    </div>
  );
};

export default OcrPanel;

/*
// Legacy fallback helper retained until OCR-PHASE-31 cleanup.
async function createOcrPageInputsForPanel(input: {
  explicitPages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  selectedPageIndexes: number[];
  pageCount: number;
  rasterScale?: number;
  maxCanvasPixels?: number;
}): Promise<OcrJobRunnerPageInput[]> {
  if (input.explicitPages && input.explicitPages.length > 0) {
    return input.explicitPages;
  }

  const pageIndexes = input.selectedPageIndexes.length > 0
    ? input.selectedPageIndexes
    : Array.from(
        { length: Math.max(1, input.pageCount) },
        (_, index) => index,
      );

  if (input.pdfBytes) {
    const rasterized = await rasterizePdfPagesForOcr({
      pdfBytes: input.pdfBytes,
      pageIndexes,
      scale: input.rasterScale ?? 2,
      maxCanvasPixels: input.maxCanvasPixels,
      mimeType: 'image/png',
    });

    return rasterizedPdfPagesToOcrEnginePageInputs(rasterized.pages).map((page) => ({
      ...page,
      imageCount: 1,
    }));
  }

  return createPlaceholderPages({
    selectedPageIndexes: pageIndexes,
    pageCount: input.pageCount,
  });
}

function createPlaceholderPages(input: {
  selectedPageIndexes: number[];
  pageCount: number;
}): OcrJobRunnerPageInput[] {
  const pageIndexes = input.selectedPageIndexes.length > 0
    ? input.selectedPageIndexes
    : Array.from(
        { length: Math.max(1, input.pageCount) },
        (_, index) => index,
      );

  return pageIndexes.map((pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
    imageCount: 1,
  }));
}
*/
