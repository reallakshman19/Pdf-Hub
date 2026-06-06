import React from 'react';
import {
  ListChecks,
  RotateCcw,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  OcrBatchSchedulerSnapshot,
  OcrBatchTask,
} from '@/core/ocr/ocrBatchScheduler';

export interface OcrBatchQueuePanelProps {
  snapshot: OcrBatchSchedulerSnapshot | null;
  onCancel?: () => void;
  onRetryFailed?: () => void;
}

export const OcrBatchQueuePanel: React.FC<OcrBatchQueuePanelProps> = ({
  snapshot,
  onCancel,
  onRetryFailed,
}) => {
  if (!snapshot || snapshot.totalCount === 0) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-batch-queue-empty"
      >
        No OCR batch queue is active.
      </div>
    );
  }

  const pct = Math.round(snapshot.progress * 100);
  const canCancel = snapshot.status === 'running';
  const canRetry = snapshot.failedCount > 0 && snapshot.status !== 'running';

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-batch-queue-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-blue-600" />
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              OCR Batch Queue
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Chunked OCR execution for large documents.
            </p>
          </div>
        </div>

        <span
          className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          data-testid="ocr-batch-status"
        >
          {snapshot.status}
        </span>
      </div>

      <div className="mb-2">
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>
            {snapshot.completedCount}/{snapshot.totalCount} completed
          </span>
          <span>
            {pct}%
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${pct}%` }}
            aria-label={`OCR batch progress ${pct}%`}
          />
        </div>
      </div>

      <div className="mb-2 grid grid-cols-5 gap-1 text-center text-[11px]">
        <Counter label="Queued" value={snapshot.queuedCount} />
        <Counter label="Running" value={snapshot.runningCount} />
        <Counter label="Done" value={snapshot.completedCount} />
        <Counter label="Failed" value={snapshot.failedCount} />
        <Counter label="Cancel" value={snapshot.cancelledCount} />
      </div>

      <div className="max-h-48 space-y-1 overflow-auto">
        {snapshot.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canCancel}
          onClick={onCancel}
          data-testid="ocr-batch-cancel"
        >
          <Square className="mr-1 h-3.5 w-3.5" />
          Cancel queue
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canRetry}
          onClick={onRetryFailed}
          data-testid="ocr-batch-retry"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Retry failed
        </Button>
      </div>
    </div>
  );
};

function Counter({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded bg-slate-50 px-1 py-1 dark:bg-slate-900">
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
      <div className="text-slate-500">
        {label}
      </div>
    </div>
  );
}

function TaskRow({
  task,
}: {
  task: OcrBatchTask;
}) {
  return (
    <div
      className={[
        'rounded border px-2 py-1 text-xs',
        task.status === 'failed'
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : task.status === 'completed'
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
            : task.status === 'running'
              ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
      ].join(' ')}
      data-testid="ocr-batch-task-row"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {task.id}
        </span>
        <span
          className="text-[11px] text-slate-500"
          data-testid="ocr-batch-task-status"
        >
          {task.status}
        </span>
      </div>

      <div className="mt-0.5 text-[11px] text-slate-500">
        Pages: {task.pageIndexes.map((pageIndex) => pageIndex + 1).join(', ')}
      </div>

      {task.errorMessage ? (
        <div className="mt-0.5 text-[11px] text-red-700 dark:text-red-300">
          {task.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
