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
      description="Check OCR quality, fix doubtful words, crop regions, and send clean content to Writer."
      icon={<Layers className="h-4 w-4 text-violet-600" />}
      testId="ocr-review-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            data-testid="ocr-review-empty"
          >
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              Nothing to review yet.
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Click Start OCR above. When OCR finishes, this area will show the recognized text, search, corrections, region tools, and Writer insertion options.
            </p>
          </div>
        )
      ) : null}

      {resultSummary ? (
        <div data-testid="ocr-review-result-summary">
          {resultSummary}
        </div>
      ) : null}

      {searchPanel ? (
        <div data-testid="ocr-review-search">
          {searchPanel}
        </div>
      ) : null}

      {correctionsPanel ? (
        <div data-testid="ocr-review-corrections">
          {correctionsPanel}
        </div>
      ) : null}

      {regionTools ? (
        <div data-testid="ocr-review-region-tools">
          {regionTools}
        </div>
      ) : null}

      {tableReview ? (
        <div data-testid="ocr-review-table">
          {tableReview}
        </div>
      ) : null}

      {writerInsertion ? (
        <div data-testid="ocr-review-writer-insertion">
          {writerInsertion}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
