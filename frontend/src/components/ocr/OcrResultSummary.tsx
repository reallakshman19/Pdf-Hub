import React from 'react';
import type { OcrDocumentResult } from '@/core/ocr/types';
import type { OcrConfidenceSummary } from '@/core/ocr/ocrConfidence';

export interface OcrResultSummaryProps {
  result: OcrDocumentResult | null;
  confidenceSummary: OcrConfidenceSummary | null;
  lowConfidenceCount: number;
}

export const OcrResultSummary: React.FC<OcrResultSummaryProps> = ({
  result,
  confidenceSummary,
  lowConfidenceCount,
}) => {
  if (!result || !confidenceSummary) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-summary-empty"
      >
        No OCR result loaded.
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-2 text-xs"
      data-testid="ocr-result-summary"
    >
      <SummaryTile
        label="Pages"
        value={String(result.pages.length)}
      />
      <SummaryTile
        label="Words"
        value={String(confidenceSummary.totalWords)}
      />
      <SummaryTile
        label="Avg. confidence"
        value={`${Math.round(confidenceSummary.averageConfidence * 100)}%`}
      />
      <SummaryTile
        label="Low confidence"
        value={String(lowConfidenceCount)}
        danger={lowConfidenceCount > 0}
      />
    </div>
  );
};

function SummaryTile({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={[
        'rounded border p-3',
        danger
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
          : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
      ].join(' ')}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">
        {value}
      </div>
    </div>
  );
}
