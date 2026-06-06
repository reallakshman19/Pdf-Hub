import React from 'react';
import {
  ArchiveRestore,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import type { OcrWriterInsertionQueueState } from '@/core/ocr/ocrWriterInsertion';
import {
  hydrateOcrStoreFromProjectPayload,
  summarizeOcrProjectPayload,
  type OcrHydrationResult,
} from '@/core/ocr/ocrHydrationBridge';

export interface OcrProjectRestorePanelProps {
  payload: OcrProjectPayloadV1 | null;
  expectedDocumentFingerprint?: string | null;
  onRestored?: (result: OcrHydrationResult) => void;
  onWriterInsertionQueueRestored?: (queue: OcrWriterInsertionQueueState) => void;
}

export const OcrProjectRestorePanel: React.FC<OcrProjectRestorePanelProps> = ({
  payload,
  expectedDocumentFingerprint,
  onRestored,
  onWriterInsertionQueueRestored,
}) => {
  const summary = summarizeOcrProjectPayload(payload);
  const [lastMessage, setLastMessage] = React.useState<string | null>(null);

  const restore = () => {
    const result = hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint,
    });

    onRestored?.(result);

    if (result.writerInsertionQueue.candidates.length > 0) {
      onWriterInsertionQueueRestored?.(result.writerInsertionQueue);
    }

    const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error');

    setLastMessage(
      result.restored
        ? `OCR restored: ${result.regions.length} region(s), ${result.corrections.length} correction(s).`
        : errors[0]?.message ?? 'OCR restore did not run.',
    );
  };

  if (!payload) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-project-restore-empty"
      >
        No OCR project data found in this project file.
      </div>
    );
  }

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-project-restore-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <ArchiveRestore className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Restore OCR Project
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Restore OCR result, corrections, regions, and queued Writer candidates.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <SummaryTile
          label="Pages"
          value={summary.pages}
        />
        <SummaryTile
          label="Words"
          value={summary.searchableWords}
        />
        <SummaryTile
          label="Corrections"
          value={summary.corrections}
        />
        <SummaryTile
          label="Regions"
          value={summary.regions}
        />
        <SummaryTile
          label="Writer queue"
          value={summary.writerInsertionCandidates}
        />
        <SummaryTile
          label="Document"
          value={summary.documentFingerprint ?? '-'}
          wide
        />
      </div>

      {expectedDocumentFingerprint && expectedDocumentFingerprint !== summary.documentFingerprint ? (
        <p
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="ocr-project-fingerprint-warning"
        >
          OCR project fingerprint differs from the active document. Restore will normalize OCR data to the active document fingerprint.
        </p>
      ) : null}

      {lastMessage ? (
        <p
          className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-project-restore-message"
        >
          {lastMessage}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={restore}
          data-testid="ocr-project-restore-button"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restore OCR
        </Button>
      </div>
    </div>
  );
};

function SummaryTile({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | number;
  wide?: boolean;
}) {
  return (
    <div
      className={[
        'rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-900',
        wide ? 'col-span-2' : '',
      ].join(' ')}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}
