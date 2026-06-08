import React from 'react';

export type OcrWorkflowState = 'idle' | 'ready' | 'running' | 'complete' | 'error';

export interface OcrWorkflowStatusProps {
  state: OcrWorkflowState;
  pageCount?: number;
  confidencePercent?: number | null;
  lowConfidenceCount?: number;
  errorMessage?: string | null;
}

export const OcrWorkflowStatus: React.FC<OcrWorkflowStatusProps> = ({
  state,
  pageCount = 0,
  confidencePercent,
  lowConfidenceCount = 0,
  errorMessage,
}) => {
  if (state === 'idle') {
    return null;
  }

  const tone = state === 'error'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
    : state === 'complete'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200';

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs shadow-sm ${tone}`}
      data-testid="ocr-workflow-status"
    >
      <span className="font-semibold">
        {getStatusTitle(state)}
      </span>
      <span className="ml-1">
        {getStatusDetail({ state, pageCount, confidencePercent, lowConfidenceCount, errorMessage })}
      </span>
    </div>
  );
};

function getStatusTitle(state: OcrWorkflowState): string {
  switch (state) {
    case 'running':
      return 'Running OCR.';
    case 'complete':
      return 'OCR complete.';
    case 'error':
      return 'OCR needs attention.';
    case 'ready':
      return 'Ready.';
    default:
      return '';
  }
}

function getStatusDetail(input: Required<Pick<OcrWorkflowStatusProps, 'state' | 'pageCount' | 'lowConfidenceCount'>> & Pick<OcrWorkflowStatusProps, 'confidencePercent' | 'errorMessage'>): string {
  if (input.state === 'error') {
    return input.errorMessage || 'Review diagnostics and try again.';
  }

  if (input.state === 'complete') {
    const confidence = typeof input.confidencePercent === 'number'
      ? ` · ${Math.round(input.confidencePercent)}% confidence`
      : '';
    return `${input.pageCount} pages${confidence} · ${input.lowConfidenceCount} needs review`;
  }

  if (input.state === 'running') {
    return 'Page processing is active and can be cancelled from execution settings.';
  }

  return 'Run OCR to extract searchable text from the selected pages.';
}

export default OcrWorkflowStatus;
