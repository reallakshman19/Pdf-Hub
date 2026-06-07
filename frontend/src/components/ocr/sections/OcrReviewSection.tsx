import React from 'react';
import {
  CheckCircle2,
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
      description="Verify the result before exporting. Correct doubtful words and convert important regions into Writer content."
      icon={<Layers className="h-4 w-4 text-violet-600" />}
      testId="ocr-review-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            data-testid="ocr-review-empty"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Nothing to review yet.
            </p>
            <p className="mt-1 max-w-2xl leading-5 text-slate-500 dark:text-slate-400">
              Run OCR first. This section will then show confidence, search, corrections, region capture, table review, and Writer insertion controls in one place.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                'Check confidence',
                'Fix doubtful words',
                'Export or send to Writer',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {resultSummary ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950" data-testid="ocr-review-result-summary">
          {resultSummary}
        </div>
      ) : null}

      {searchPanel ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950" data-testid="ocr-review-search">
          {searchPanel}
        </div>
      ) : null}

      {correctionsPanel ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm dark:border-amber-900 dark:bg-amber-950/20" data-testid="ocr-review-corrections">
          {correctionsPanel}
        </div>
      ) : null}

      {regionTools ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3 shadow-sm dark:border-blue-900 dark:bg-blue-950/20" data-testid="ocr-review-region-tools">
          {regionTools}
        </div>
      ) : null}

      {tableReview ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3 shadow-sm dark:border-violet-900 dark:bg-violet-950/20" data-testid="ocr-review-table">
          {tableReview}
        </div>
      ) : null}

      {writerInsertion ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20" data-testid="ocr-review-writer-insertion">
          {writerInsertion}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
