import React from 'react';
import type {
  OcrHeaderSummaryModel,
  OcrPrimaryActionModel,
  OcrWorkflowPanel,
  OcrWorkflowState,
} from './OcrWorkflowTypes';
import { OcrHeaderSummary } from './OcrHeaderSummary';
import { OcrPrimaryActionBar } from './OcrPrimaryActionBar';
import { OcrWorkflowStatus } from './OcrWorkflowStatus';
import { OcrResultWorkspace } from './OcrResultWorkspace';
import { OcrSourcePanel } from './OcrSourcePanel';
import { OcrAdvancedPanel } from './OcrAdvancedPanel';

export interface OcrAssistantShellProps {
  header: OcrHeaderSummaryModel;
  action: OcrPrimaryActionModel;
  state: OcrWorkflowState;
  pagesProcessed: number;
  averageConfidence?: number | null;
  lowConfidenceCount?: number;
  errorMessage?: string | null;
  resultPanels: OcrWorkflowPanel[];
  sourceDetails?: React.ReactNode;
  sourceHasWarning?: boolean;
  advanced: React.ReactNode;
  diagnosticsOpen?: boolean;
}

export const OcrAssistantShell: React.FC<OcrAssistantShellProps> = ({
  header,
  action,
  state,
  pagesProcessed,
  averageConfidence,
  lowConfidenceCount,
  errorMessage,
  resultPanels,
  sourceDetails,
  sourceHasWarning = false,
  advanced,
  diagnosticsOpen = false,
}) => {
  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-assistant-shell"
    >
      <OcrHeaderSummary summary={header} />
      <div className="space-y-3 p-3" data-testid="ocr-panel">
        <OcrPrimaryActionBar action={action} />
        <OcrWorkflowStatus
          state={state}
          pagesProcessed={pagesProcessed}
          averageConfidence={averageConfidence}
          lowConfidenceCount={lowConfidenceCount}
          errorMessage={errorMessage}
        />
        <OcrResultWorkspace state={state} panels={resultPanels} />
        {sourceDetails ? (
          <OcrSourcePanel hasWarning={sourceHasWarning}>
            {sourceDetails}
          </OcrSourcePanel>
        ) : null}
        <OcrAdvancedPanel forceOpen={diagnosticsOpen}>
          {advanced}
        </OcrAdvancedPanel>
      </div>
    </div>
  );
};

export default OcrAssistantShell;
