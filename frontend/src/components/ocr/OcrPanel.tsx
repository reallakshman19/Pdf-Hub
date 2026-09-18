import React from 'react';
import type {
  OcrJobRunnerPageInput,
} from '@/core/ocr/ocrJobRunner';
import { useShallow } from 'zustand/react/shallow';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { listOcrProfiles } from '@/core/ocr/ocrProfiles';
import { defaultOcrEngineRegistry } from '@/core/ocr/engines/ocrEngineRegistry';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionQueue,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrProgressPanel } from './OcrProgressPanel';
import { OcrSearchablePdfExportPanel } from './OcrSearchablePdfExportPanel';
import { OcrProjectRestorePanel } from './OcrProjectRestorePanel';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import { OcrExecutionSettingsPanel } from './OcrExecutionSettingsPanel';
import { OcrBatchQueuePanel } from './OcrBatchQueuePanel';
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
import { useOcrRunWorkflow } from './workflow/useOcrRunWorkflow';
import { OcrReviewWorkspace } from './workflow/OcrReviewWorkspace';
import {
  OcrPageScopeControl,
  type OcrPageScope,
} from './workflow/OcrPageScopeControl';

export interface OcrPanelProps {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;
  currentPageIndex?: number;

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
  currentPageIndex = 0,
  pages,
  onInsertWriterElements,
  pdfBytes = null,
  onSearchablePdfExported,
  projectPayload = null,
}) => {
  const store = useOcrStore(useShallow((state) => ({
    activeJobId: state.activeJobId,
    correctedResult: state.correctedResult,
    corrections: state.corrections,
    engineId: state.engineId,
    forceOcr: state.forceOcr,
    jobs: state.jobs,
    profileId: state.profileId,
    lowConfidenceWords: state.lowConfidenceWords,
    regions: state.regions,
    setForceOcr: state.setForceOcr,
    setOcrEngineId: state.setOcrEngineId,
    setOcrProfileId: state.setOcrProfileId,
  })));
  const [pageScope, setPageScope] = React.useState<OcrPageScope>(
    selectedPageIndexes.length > 0 ? 'selected' : 'all',
  );

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- document changes reset the user-facing page scope to the active selection.
    setPageScope(selectedPageIndexes.length > 0 ? 'selected' : 'all');
  }, [documentFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopedPageIndexes = React.useMemo(() => {
    const maxPageCount = Math.max(1, pageCount);
    const current = Math.max(0, Math.min(currentPageIndex, maxPageCount - 1));

    if (pageScope === 'current') {
      return [current];
    }

    if (pageScope === 'selected' && selectedPageIndexes.length > 0) {
      return [...new Set(selectedPageIndexes)]
        .filter((pageIndex) => pageIndex >= 0 && pageIndex < maxPageCount)
        .sort((a, b) => a - b);
    }

    return Array.from({ length: maxPageCount }, (_, pageIndex) => pageIndex);
  }, [
    currentPageIndex,
    pageCount,
    pageScope,
    selectedPageIndexes,
  ]);

  const runWorkflow = useOcrRunWorkflow({
    documentFingerprint,
    selectedPageIndexes: scopedPageIndexes,
    pageCount,
    pages,
    pdfBytes,
  });

  const [writerInsertionQueue, setWriterInsertionQueue] = React.useState<OcrWriterInsertionQueueState>(() =>
    createOcrWriterInsertionQueue(),
  );

  const profiles = React.useMemo(() => listOcrProfiles(), []);
  const engines = React.useMemo(
    () => defaultOcrEngineRegistry.listEngines(),
    [],
  );

  const allDiagnostics: OcrDiagnosticsMessage[] = [
    ...runWorkflow.executionDiagnostics.map((message) => ({
      level: 'info' as const,
      code: 'OCR_EXECUTION',
      message,
    })),
    ...runWorkflow.pipelineMessages.map((message) => ({
      level: 'info' as const,
      code: 'OCR_PIPELINE',
      message,
    })),
  ];

  const engineControlsNode = (
    <OcrEngineControls
      engines={engines}
      profiles={profiles}
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
      running={runWorkflow.isRunning}
      clearDisabled={!runWorkflow.canClear}
      showClear={runWorkflow.state === 'complete' || runWorkflow.state === 'error'}
      onRun={runWorkflow.runSelectedOcr}
      onClear={runWorkflow.clearOcr}
      onCancel={runWorkflow.cancelActiveOcr}
    />
  );

  const hasCurrentResult =
    store.correctedResult?.documentFingerprint === runWorkflow.effectiveDocumentFingerprint;
  const hasCurrentRegions = store.regions.some(
    (region) => region.documentFingerprint === runWorkflow.effectiveDocumentFingerprint,
  );
  const hasReviewWorkspace =
    hasCurrentResult
    || hasCurrentRegions
    || writerInsertionQueue.candidates.some(
      (candidate) =>
        candidate.element.documentFingerprint === runWorkflow.effectiveDocumentFingerprint,
    );

  const runStatusMessage =
    runWorkflow.state === 'running'
      ? `Recognizing ${runWorkflow.requestedPageIndexes.length} page${runWorkflow.requestedPageIndexes.length === 1 ? '' : 's'}…`
      : runWorkflow.state === 'complete'
        ? `OCR complete. ${store.lowConfidenceWords.length} item${store.lowConfidenceWords.length === 1 ? '' : 's'} need review.`
        : null;

  return (
    <div
      className="space-y-3"
      data-testid="ocr-panel"
    >
      <OcrRunSection
        pageScopeControls={
          <OcrPageScopeControl
            value={pageScope}
            currentPageIndex={currentPageIndex}
            selectedPageIndexes={selectedPageIndexes}
            pageCount={pageCount}
            disabled={runWorkflow.isRunning}
            onChange={setPageScope}
          />
        }
        engineControls={engineControlsNode}
        pipelineMode={
          <OcrPipelineModePanel
            mode={runWorkflow.pipelineMode}
            disabled={runWorkflow.isRunning}
            onChange={runWorkflow.setPipelineMode}
          />
        }
        executionSettings={
          <OcrExecutionSettingsPanel
            policy={runWorkflow.executionPolicy}
            estimatedMemoryBytes={runWorkflow.estimatedMemoryBytes}
            running={runWorkflow.isRunning}
            onChange={runWorkflow.setExecutionPolicy}
            onCancel={runWorkflow.cancelActiveOcr}
          />
        }
        executionDiagnostics={
          runWorkflow.executionDiagnostics.length > 0 ? (
            <div className="space-y-2">
              {runWorkflow.executionDiagnostics.map((message, index) => (
                <div key={`${message}-${index}`} className="text-xs text-slate-500">
                  {message}
                </div>
              ))}
            </div>
          ) : null
        }
        batchQueue={
          <OcrBatchQueuePanel
            snapshot={runWorkflow.batchSnapshot}
            onCancel={runWorkflow.cancelBatchQueue}
            onRetryFailed={runWorkflow.retryFailedBatches}
          />
        }
        runControls={runControlsNode}
        progress={
          runWorkflow.isRunning ? (
            <OcrProgressPanel
              jobs={store.jobs}
              activeJobId={store.activeJobId}
            />
          ) : undefined
        }
        statusMessage={runStatusMessage}
        errorMessage={runWorkflow.errorMessage}
      />

      {hasReviewWorkspace ? (
        <OcrReviewSection
          resultSummary={
            <OcrReviewWorkspace
              documentFingerprint={runWorkflow.effectiveDocumentFingerprint}
              selectedPages={runWorkflow.selectedPages}
              pages={pages}
              pdfBytes={pdfBytes}
              writerInsertionQueue={writerInsertionQueue}
              onWriterInsertionQueueChange={setWriterInsertionQueue}
              onInsertWriterElements={onInsertWriterElements}
            />
          }
        />
      ) : null}

      {hasCurrentResult ? (
        <OcrExportSection
          searchablePdfExport={
            <OcrSearchablePdfExportPanel
              pdfBytes={pdfBytes}
              ocrResult={store.correctedResult}
              corrections={store.corrections}
              onExported={(result) => {
                onSearchablePdfExported?.(result.bytes);
              }}
            />
          }
        />
      ) : null}

      <details
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        data-testid="ocr-advanced-workflow"
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Advanced and troubleshooting
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
          <OcrProjectSection
            restorePanel={
              <OcrProjectRestorePanel
                payload={projectPayload || null}
                expectedDocumentFingerprint={runWorkflow.effectiveDocumentFingerprint}
                onWriterInsertionQueueRestored={setWriterInsertionQueue}
              />
            }
          />

          <OcrDiagnosticsSection
            messages={allDiagnostics}
          />
        </div>
      </details>
    </div>
  );
};

export default OcrPanel;
