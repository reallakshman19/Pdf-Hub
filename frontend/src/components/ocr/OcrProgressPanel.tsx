import React from 'react';
import type { OcrJob } from '@/core/ocr/ocrJobTypes';

export interface OcrProgressPanelProps {
  jobs: OcrJob[];
  activeJobId: string | null;
  estimatedRemainingMs?: number;
}

function formatEta(ms?: number): string | null {
  if (ms === undefined || ms <= 0) return null;
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `~${minutes}m ${remSec}s remaining`;
}

export const OcrProgressPanel: React.FC<OcrProgressPanelProps> = ({
  jobs,
  activeJobId,
  estimatedRemainingMs,
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
        const etaText = formatEta(progress.estimatedRemainingMs ?? (isActive ? estimatedRemainingMs : undefined));

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

            <div className="mb-1 flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>
                {processed}/{progress.totalPages} pages processed
                {progress.batchIndex !== undefined && progress.totalBatches !== undefined ? (
                  <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                    (Batch {progress.batchIndex + 1}/{progress.totalBatches})
                  </span>
                ) : null}
              </span>
              {etaText ? (
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400" data-testid="ocr-job-eta">
                  {etaText}
                </span>
              ) : null}
            </div>

            {progress.stage ? (
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span>{progress.stage}</span>
              </div>
            ) : null}

            <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
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
