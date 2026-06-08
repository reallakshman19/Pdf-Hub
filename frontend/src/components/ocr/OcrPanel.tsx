import React from 'react';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import type { OcrProfileId } from '@/core/ocr/ocrProfiles';
import { listOcrProfiles } from '@/core/ocr/ocrProfiles';
import { useOcrStore, type OcrStoreState } from '@/core/ocr/ocrStore';
import { defaultOcrEngineRegistry } from '@/core/ocr/engines/ocrEngineRegistry';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { OcrProgressPanel } from './OcrProgressPanel';
import { OcrResultSummary } from './OcrResultSummary';
import { OcrSearchMiniPanel } from './OcrSearchMiniPanel';
import { OcrConfidenceLegend } from './OcrConfidenceLegend';
import { OcrLowConfidencePanel } from './OcrLowConfidencePanel';
import { OcrCorrectionPanel } from './OcrCorrectionPanel';
import { OcrRegionTool } from './OcrRegionTool';
import { OcrRegionListPanel } from './OcrRegionListPanel';
import { OcrRegionActionPanel } from './OcrRegionActionPanel';
import { OcrTableReviewPanel } from './OcrTableReviewPanel';
import { OcrWriterInsertPanel } from './OcrWriterInsertPanel';
import { OcrSearchablePdfExportPanel } from './OcrSearchablePdfExportPanel';
import { OcrProjectRestorePanel } from './OcrProjectRestorePanel';
import { OcrExecutionSettingsPanel } from './OcrExecutionSettingsPanel';
import { OcrBatchQueuePanel } from './OcrBatchQueuePanel';
import { OcrPipelineModePanel } from './OcrPipelineModePanel';
import { OcrDiagnosticsSection } from './sections';
import { OcrPanelEngineControls } from './OcrPanelEngineControls';
import { useOcrRunCoordinator } from './useOcrRunCoordinator';
import { useOcrReviewCoordinator } from './useOcrReviewCoordinator';
import {
  OcrAdvancedGroup,
  OcrAssistantShell,
  type OcrWorkflowPanel,
  type OcrWorkflowState,
} from './workflow';

export interface OcrPanelProps {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;
  pages?: OcrJobRunnerPageInput[];
  onInsertWriterElements?: (elements: WriterElementV2[]) => void;
  pdfBytes?: Uint8Array | null;
  onSearchablePdfExported?: (bytes: Uint8Array) => void;
  projectPayload?: OcrProjectPayloadV1 | null;
  fileName?: string | null;
  sourceStateLabel?: string;
  sourceDetails?: React.ReactNode;
  sourceHasWarning?: boolean;
  advancedFixtures?: React.ReactNode;
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
  fileName,
  sourceStateLabel = pdfBytes ? 'Working copy' : 'Ready',
  sourceDetails,
  sourceHasWarning = false,
  advancedFixtures,
}) => {
  const store = useOcrStore();
  const effectiveDocumentFingerprint = documentFingerprint
    ?? store.documentFingerprint
    ?? 'ocr-preview-document';
  const selectedPages = selectedPageIndexes.length > 0
    ? selectedPageIndexes
    : store.selectedPageIndexes;

  const run = useOcrRunCoordinator({
    effectiveDocumentFingerprint,
    selectedPages,
    pageCount,
    pages,
    pdfBytes,
  });
  const review = useOcrReviewCoordinator({
    effectiveDocumentFingerprint,
    selectedPages,
    pages,
    pdfBytes,
    onInsertWriterElements,
  });

  const profiles = React.useMemo(() => listOcrProfiles(), []);
  const engines = React.useMemo(() => defaultOcrEngineRegistry.listEngines(), []);
  const profileLabel = profiles.find((profile) => profile.id === store.profileId)?.label ?? store.profileId;
  const workflowState: OcrWorkflowState = run.errorMessage
    ? 'error'
    : run.isRunning
      ? 'running'
      : store.correctedResult
        ? 'complete'
        : 'ready';
  const averageConfidence = (store.confidenceSummary?.averageConfidence ?? 0) * 100;
  const processedPages = store.correctedResult?.pages.length ?? 0;
  const pageScopeLabel = selectedPages.length > 0 ? `${selectedPages.length} selected page(s)` : 'All pages';

  const resultPanels = buildResultPanels({
    store,
    review,
    effectiveDocumentFingerprint,
    pageScopeFirstIndex: selectedPages[0] ?? 0,
    pdfBytes,
    onSearchablePdfExported,
  });

  return (
    <OcrAssistantShell
      state={workflowState}
      pagesProcessed={processedPages}
      averageConfidence={averageConfidence}
      lowConfidenceCount={store.lowConfidenceWords.length}
      errorMessage={run.errorMessage}
      resultPanels={resultPanels}
      sourceDetails={sourceDetails}
      sourceHasWarning={sourceHasWarning}
      diagnosticsOpen={Boolean(run.errorMessage)}
      header={{
        fileName: fileName ?? effectiveDocumentFingerprint,
        pageCount: Math.max(1, pageCount),
        selectedPageCount: selectedPages.length,
        sourceState: sourceStateLabel,
        scopeLabel: pageScopeLabel,
        workflowState,
        averageConfidence,
        lowConfidenceCount: store.lowConfidenceWords.length,
      }}
      action={{
        state: workflowState,
        description: run.isRunning
          ? 'Page OCR is running and can be cancelled.'
          : store.correctedResult
            ? 'Review the OCR result, then export or send content to Writer.'
            : 'Extract searchable text from the selected pages.',
        pageScopeLabel,
        profileLabel,
        progressLabel: run.isRunning ? 'cancellable' : null,
        completedLabel: `OCR complete: ${processedPages} pages`,
        errorMessage: run.errorMessage,
        canRun: !run.isRunning,
        canClear: Boolean(store.correctedResult || run.errorMessage),
        canCancel: run.isRunning,
        onRun: run.runSelectedOcr,
        onClear: run.clearOcr,
        onCancel: run.cancelActiveOcr,
      }}
      advanced={(
        <>
          <OcrAdvancedGroup title="Recognition" description="Engine, scan profile, and forced OCR behavior." testId="ocr-run-engine-controls">
            <OcrPanelEngineControls engineId={store.engineId} profileId={store.profileId} forceOcr={store.forceOcr} engines={engines} profiles={profiles} onEngineChange={(engineId) => store.setOcrEngineId(engineId)} onProfileChange={(profileId: OcrProfileId) => store.setOcrProfileId(profileId)} onForceOcrChange={(forceOcr) => store.setForceOcr(forceOcr)} />
          </OcrAdvancedGroup>
          <OcrAdvancedGroup title="Pipeline" description="Main-thread or worker-backed execution." testId="ocr-run-pipeline-mode">
            <OcrPipelineModePanel mode={run.pipelineMode} disabled={run.isRunning} onChange={run.setPipelineMode} />
          </OcrAdvancedGroup>
          <OcrAdvancedGroup title="Execution limits" description="Memory and batch size for large documents." testId="ocr-run-execution-settings">
            <OcrExecutionSettingsPanel policy={run.executionPolicy} estimatedMemoryBytes={run.estimatedMemoryBytes} running={run.isRunning} onChange={run.setExecutionPolicy} onCancel={run.cancelActiveOcr} />
            {run.executionDiagnostics.length > 0 ? (
              <div className="mt-2 space-y-1" data-testid="ocr-run-execution-diagnostics">
                {run.executionDiagnostics.map((message, index) => <div key={`${message}-${index}`} className="text-xs text-slate-500">{message}</div>)}
              </div>
            ) : null}
          </OcrAdvancedGroup>
          <OcrAdvancedGroup title="Batch queue" testId="ocr-run-batch-queue">
            <OcrBatchQueuePanel snapshot={run.batchSnapshot} onCancel={run.cancelBatchQueue} onRetryFailed={run.retryFailedBatches} />
          </OcrAdvancedGroup>
          <OcrAdvancedGroup title="Project restore" testId="ocr-project-section">
            <OcrProjectRestorePanel payload={projectPayload || null} expectedDocumentFingerprint={effectiveDocumentFingerprint} onWriterInsertionQueueRestored={review.setWriterInsertionQueue} />
          </OcrAdvancedGroup>
          {advancedFixtures ? (
            <OcrAdvancedGroup title="Demo / QA fixtures" testId="ocr-demo-fixtures-advanced">
              {advancedFixtures}
            </OcrAdvancedGroup>
          ) : null}
          <OcrDiagnosticsSection messages={run.allDiagnostics}>
            <OcrProgressPanel jobs={store.jobs} activeJobId={store.activeJobId} />
          </OcrDiagnosticsSection>
        </>
      )}
    />
  );
};

interface ResultPanelArgs {
  store: OcrStoreState;
  review: ReturnType<typeof useOcrReviewCoordinator>;
  effectiveDocumentFingerprint: string;
  pageScopeFirstIndex: number;
  pdfBytes: Uint8Array | null;
  onSearchablePdfExported?: (bytes: Uint8Array) => void;
}

function buildResultPanels({ store, review, effectiveDocumentFingerprint, pageScopeFirstIndex, pdfBytes, onSearchablePdfExported }: ResultPanelArgs): OcrWorkflowPanel[] {
  const panels: OcrWorkflowPanel[] = [];
  if (store.correctedResult) {
    panels.push({ title: 'Result summary', testId: 'ocr-review-result-summary', content: <><OcrResultSummary result={store.correctedResult} confidenceSummary={store.confidenceSummary} lowConfidenceCount={store.lowConfidenceWords.length} /><OcrConfidenceLegend compact /></> });
    if (store.searchIndex) panels.push({ title: 'Search OCR text', testId: 'ocr-review-search', content: <OcrSearchMiniPanel disabled={!store.searchIndex} onSearch={(text) => useOcrStore.getState().searchOcr({ text, limit: 8 })} /> });
    panels.push({ title: 'Low-confidence corrections', testId: 'ocr-review-corrections', content: <><OcrLowConfidencePanel words={store.lowConfidenceWords} selectedWordId={review.selectedLowConfidenceWordId} onSelectWord={(item) => review.setSelectedLowConfidenceWordId(item.word.id)} /><OcrCorrectionPanel word={review.selectedLowConfidenceWord} documentFingerprint={effectiveDocumentFingerprint} /></> });
    panels.push({ title: 'Capture region', testId: 'ocr-review-region-tools', content: <RegionWorkspace store={store} review={review} effectiveDocumentFingerprint={effectiveDocumentFingerprint} pageScopeFirstIndex={pageScopeFirstIndex} /> });
  }
  if (review.lastRegionTableBlock) panels.push({ title: 'Review tables', testId: 'ocr-review-table', content: <><OcrTableReviewPanel tableBlock={review.lastRegionTableBlock} onAcceptTable={review.handleAcceptTable} />{review.lastAcceptedTableSummary ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" data-testid="ocr-table-accepted-summary">OCR table accepted: {review.lastAcceptedTableSummary}</p> : null}</> });
  if (review.writerInsertionQueue.candidates.length > 0 || review.lastInsertedWriterCount !== null) panels.push({ title: 'Send to Writer', testId: 'ocr-review-writer-insertion', content: <><OcrWriterInsertPanel queue={review.writerInsertionQueue} onQueueChange={review.setWriterInsertionQueue} onInsertElements={review.handleInsertElements} />{review.lastInsertedWriterCount !== null ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" data-testid="ocr-writer-inserted-summary">Inserted {review.lastInsertedWriterCount} OCR Writer element(s).</p> : null}</> });
  panels.push({ title: 'Export searchable PDF', testId: 'ocr-export-section', content: store.correctedResult ? <OcrSearchablePdfExportPanel pdfBytes={pdfBytes} ocrResult={store.correctedResult} corrections={store.corrections} onExported={(result) => onSearchablePdfExported?.(result.bytes)} /> : <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">Run OCR first to export a searchable PDF.</p> });
  return panels;
}

interface RegionWorkspaceProps {
  store: OcrStoreState;
  review: ReturnType<typeof useOcrReviewCoordinator>;
  effectiveDocumentFingerprint: string;
  pageScopeFirstIndex: number;
}

function RegionWorkspace({ store, review, effectiveDocumentFingerprint, pageScopeFirstIndex }: RegionWorkspaceProps) {
  return <div className="space-y-2"><OcrRegionTool documentFingerprint={effectiveDocumentFingerprint} pageIndex={pageScopeFirstIndex} pageWidth={595} pageHeight={842} viewportWidth={240} viewportHeight={340} onCreateRegion={review.createRegion} />{store.regions.length > 0 ? <OcrRegionListPanel regions={store.regions} selectedRegionId={review.selectedRegionId} onSelectRegion={(region) => review.setSelectedRegionId(region.id)} onDeleteRegion={review.deleteRegion} /> : null}<OcrRegionActionPanel region={review.selectedRegion} pageInput={review.selectedRegionPageInput} resolvePageInput={review.selectedRegion ? review.resolveSelectedRegionPageInput : undefined} onRegionResult={review.handleRegionResult} onWriterElementCreated={review.handleWriterElementCreated} />{review.lastRegionWriterElementType ? <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700" data-testid="ocr-region-writer-created">Region created Writer element: {review.lastRegionWriterElementType}</p> : null}</div>;
}

export default OcrPanel;
