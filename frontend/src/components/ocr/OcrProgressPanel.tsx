import React from 'react';
import type { OcrJob } from '@/core/ocr/ocrJobTypes';

export interface OcrProgressPanelProps {
  jobs: OcrJob[];
  activeJobId: string | null;
}

export const OcrProgressPanel: React.FC<OcrProgressPanelProps> = ({
  jobs,
  activeJobId,
}) => {
  if (jobs.length === 0) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-progress-empty"
      >
        No OCR jobs yet.
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      data-testid="ocr-progress-panel"
    >
      {jobs.map((job) => {
        const isActive = job.id === activeJobId;
        const progress = job.progress ?? { totalPages: 0, completedPages: 0, failedPages: 0 };
        const total = Math.max(1, progress.totalPages);
        const processed = progress.completedPages + progress.failedPages;
        const pct = Math.round((processed / total) * 100);

        return (
          <div
            key={job.id}
            className={[
              'rounded border p-3 text-xs',
              isActive
                ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
            ].join(' ')}
            data-testid="ocr-job-row"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Job {job.id.slice(0, 8)}
              </span>
              <span
                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                data-testid="ocr-job-status"
              >
                {job.status}
              </span>
            </div>

            <div className="mb-1 text-slate-500 dark:text-slate-400">
              {processed}/{progress.totalPages} pages processed
            </div>

            <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${pct}%`,
                }}
                aria-label={`OCR progress ${pct}%`}
              />
            </div>

            {job.errorMessage ? (
              <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                {job.errorMessage}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
