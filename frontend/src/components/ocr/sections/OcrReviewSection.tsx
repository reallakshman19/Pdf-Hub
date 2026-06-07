import React from 'react';
import {
  Layers,
} from 'lucide-react';
import { OcrSectionShell } from './OcrSectionShell';

export interface OcrReviewSectionProps {
  resultSummary?: React.ReactNode;
  searchPanel?: React.ReactNode;
  correctionsPanel?: React.ReactNode;
  regionTools?: React.ReactNode;
  tableReview?: React.ReactNode;
  writerInsertion?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const OcrReviewSection: React.FC<OcrReviewSectionProps> = ({
  resultSummary,
  searchPanel,
  correctionsPanel,
  regionTools,
  tableReview,
  writerInsertion,
  emptyState,
}) => {
  const hasContent = Boolean(
    resultSummary
      || searchPanel
      || correctionsPanel
      || regionTools
      || tableReview
      || writerInsertion,
  );

  return (
    <OcrSectionShell
      title="Review result"
      description="Search, correct, crop regions, review tables, and send content to Writer."
      icon={<Layers className="h-4 w-4 text-violet-600" />}
      testId="ocr-review-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            data-testid="ocr-review-empty"
          >
            <span className="font-semibold text-slate-900 dark:text-slate-50">
              Nothing to review yet.
            </span>{' '}
            Run OCR to show confidence, search, corrections, regions, tables, and Writer insertion.
          </div>
        )
      ) : null}

      {resultSummary ? (
        <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950" data-testid="ocr-review-result-summary">
          {resultSummary}
        </div>
      ) : null}

      {searchPanel ? (
        <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950" data-testid="ocr-review-search">
          {searchPanel}
        </div>
      ) : null}

      {correctionsPanel ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20" data-testid="ocr-review-corrections">
          {correctionsPanel}
        </div>
      ) : null}

      {regionTools ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-2 dark:border-blue-900 dark:bg-blue-950/20" data-testid="ocr-review-region-tools">
          {regionTools}
        </div>
      ) : null}

      {tableReview ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-2 dark:border-violet-900 dark:bg-violet-950/20" data-testid="ocr-review-table">
          {tableReview}
        </div>
      ) : null}

      {writerInsertion ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20" data-testid="ocr-review-writer-insertion">
          {writerInsertion}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
