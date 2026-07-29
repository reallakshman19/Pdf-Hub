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
  const store = useOcrStore(useShallow((state) => ({
    activeJobId: state.activeJobId,
    correctedResult: state.correctedResult,
    corrections: state.corrections,
    engineId: state.engineId,
    forceOcr: state.forceOcr,
    jobs: state.jobs,
    profileId: state.profileId,
    setForceOcr: state.setForceOcr,
    setOcrEngineId: state.setOcrEngineId,
    setOcrProfileId: state.setOcrProfileId,
  })));
  const runWorkflow = useOcrRunWorkflow({
    documentFingerprint,
    selectedPageIndexes,
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
      onRun={runWorkflow.runSelectedOcr}
      onClear={runWorkflow.clearOcr}
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
        errorMessage={runWorkflow.errorMessage}
      />

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
            expectedDocumentFingerprint={runWorkflow.effectiveDocumentFingerprint}
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
