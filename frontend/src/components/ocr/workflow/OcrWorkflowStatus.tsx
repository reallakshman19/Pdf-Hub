import React from 'react';
import type { OcrWorkflowState } from './OcrWorkflowTypes';

export interface OcrWorkflowStatusProps {
  state: OcrWorkflowState;
  pagesProcessed: number;
  averageConfidence?: number | null;
  lowConfidenceCount?: number;
  errorMessage?: string | null;
}

export const OcrWorkflowStatus: React.FC<OcrWorkflowStatusProps> = ({
  state,
  pagesProcessed,
  averageConfidence,
  lowConfidenceCount = 0,
  errorMessage,
}) => {
  if (state === 'ready' || state === 'missing-source') {
    return null;
  }

  const toneClass = state === 'error'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
    : state === 'running'
      ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${toneClass}`}
      data-testid="ocr-workflow-status"
    >
      <span className="font-semibold">{statusTitle(state)}</span>
      <span className="ml-1">
        {state === 'complete'
          ? `${pagesProcessed} pages · ${Math.round(averageConfidence ?? 0)}% confidence · ${lowConfidenceCount} needs review`
          : state === 'running'
            ? `${pagesProcessed} page(s) processed. OCR can be cancelled.`
            : errorMessage ?? 'Review diagnostics and try again.'}
      </span>
    </div>
  );
};

function statusTitle(state: OcrWorkflowState): string {
  if (state === 'running') return 'Running OCR.';
  if (state === 'complete') return 'OCR complete.';
  if (state === 'error') return 'OCR failed.';
  return 'OCR ready.';
}

export default OcrWorkflowStatus;
