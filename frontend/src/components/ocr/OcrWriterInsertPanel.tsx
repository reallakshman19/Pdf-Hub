import React from 'react';
import {
  CheckCircle2,
  FilePlus2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  buildOcrWriterInsertionResult,
  clearOcrWriterInsertionQueue,
  deleteOcrWriterInsertionCandidate,
  getInsertableOcrWriterCandidates,
  type OcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';

export interface OcrWriterInsertPanelProps {
  queue: OcrWriterInsertionQueueState;
  onQueueChange: (queue: OcrWriterInsertionQueueState) => void;
  onInsertElements?: (
    elements: WriterElementV2[],
  ) => void | Promise<void>;
}

export const OcrWriterInsertPanel: React.FC<OcrWriterInsertPanelProps> = ({
  queue,
  onQueueChange,
  onInsertElements,
}) => {
  const insertable = getInsertableOcrWriterCandidates(queue);
  const rejectedCount = queue.candidates.length - insertable.length;

  const insertElements = async () => {
    const result =
      buildOcrWriterInsertionResult(queue);

    if (result.accepted.length === 0) {
      return;
    }

    try {
      await onInsertElements?.(
        result.accepted,
      );
      onQueueChange(
        clearOcrWriterInsertionQueue(),
      );
    } catch {
      // The connected caller owns the user-facing failure
      // status. Preserve the queue so the insertion can be
      // retried after a durable Writer failure.
    }
  };

  const clearQueue = () => {
    onQueueChange(clearOcrWriterInsertionQueue());
  };

  const deleteCandidate = (candidateId: string) => {
    onQueueChange(
      deleteOcrWriterInsertionCandidate(queue, candidateId),
    );
  };

  if (queue.candidates.length === 0) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-writer-insert-empty"
      >
        No OCR Writer elements queued yet.
      </div>
    );
  }

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-writer-insert-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FilePlus2 className="h-4 w-4 text-blue-600" />
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              OCR → Writer Queue
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Review OCR-generated Writer elements before insertion.
            </p>
          </div>
        </div>

        <span
          className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-100"
          data-testid="ocr-writer-insert-count"
        >
          {insertable.length}/{queue.candidates.length}
        </span>
      </div>

      {rejectedCount > 0 ? (
        <p
          className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="ocr-writer-insert-warning"
        >
          {rejectedCount} queued item(s) have blocking diagnostics.
        </p>
      ) : null}

      <div className="space-y-1">
        {queue.candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            onDelete={() => deleteCandidate(candidate.id)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={insertable.length === 0}
          onClick={() => {
            void insertElements();
          }}
          data-testid="ocr-writer-insert-button"
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          Insert {insertable.length}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearQueue}
          data-testid="ocr-writer-clear-button"
        >
          Clear queue
        </Button>
      </div>
    </div>
  );
};

function CandidateRow({
  candidate,
  onDelete,
}: {
  candidate: OcrWriterInsertionCandidate;
  onDelete: () => void;
}) {
  const hasError = candidate.diagnostics.some(
    (diagnostic) => diagnostic.level === 'error',
  );

  return (
    <div
      className={[
        'rounded border px-2 py-2 text-xs',
        hasError
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
      ].join(' ')}
      data-testid="ocr-writer-candidate-row"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800 dark:text-slate-100">
            {candidate.element.type}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Page {candidate.element.pageIndex + 1} · {candidate.source}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">
            {candidate.element.plainText || candidate.element.id}
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDelete}
          data-testid="ocr-writer-candidate-delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-1 space-y-0.5">
        {candidate.diagnostics.map((diagnostic, index) => (
          <div
            key={`${diagnostic.code}-${index}`}
            className={[
              'text-[11px]',
              diagnostic.level === 'error'
                ? 'text-red-700 dark:text-red-300'
                : diagnostic.level === 'warning'
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-slate-500',
            ].join(' ')}
          >
            {diagnostic.code}: {diagnostic.message}
          </div>
        ))}
      </div>
    </div>
  );
}
