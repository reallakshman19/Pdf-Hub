import React from 'react';
import { Workflow } from 'lucide-react';

export interface OcrHeaderSummaryProps {
  fileName?: string | null;
  documentFingerprint?: string | null;
  hasPdfBytes: boolean;
  bytesSource?: string | null;
  pageCount?: number | null;
  selectedPageCount?: number | null;
}

type PillTone = 'neutral' | 'success' | 'warning';

export const OcrHeaderSummary: React.FC<OcrHeaderSummaryProps> = ({
  fileName,
  documentFingerprint,
  hasPdfBytes,
  bytesSource,
  pageCount,
  selectedPageCount,
}) => {
  const sourceLabel = hasPdfBytes ? normalizeSource(bytesSource) : 'missing';
  const selectedLabel = selectedPageCount && selectedPageCount > 0
    ? `${selectedPageCount} selected`
    : 'all pages';
  const documentLabel = fileName ?? documentFingerprint ?? 'No PDF loaded';

  return (
    <div
      className="flex items-start gap-3"
      data-testid="ocr-header-summary"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
        <Workflow className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              OCR Assistant
            </h3>
            <p className="mt-0.5 truncate text-xs leading-5 text-slate-600 dark:text-slate-300">
              {documentLabel} · {pageCount || 0} pages · {selectedLabel} · {sourceLabel}
            </p>
          </div>

          <div
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-testid="ocr-header-next-action"
          >
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {hasPdfBytes ? 'Ready for OCR' : 'Open a PDF first'}
            </div>
            <div className="mt-0.5 max-w-[240px] truncate text-slate-500 dark:text-slate-400">
              {hasPdfBytes ? 'Run OCR, review, then export or send to Writer.' : 'Load a PDF to extract searchable text.'}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="ocr-unified-summary">
          <SummaryPill label="PDF" value={sourceLabel} tone={hasPdfBytes ? 'success' : 'warning'} />
          <SummaryPill label="Pages" value={pageCount || 0} />
          <SummaryPill label="Scope" value={selectedLabel} />
          <SummaryPill label="Document" value={documentLabel} />
        </div>
      </div>
    </div>
  );
};

function normalizeSource(value?: string | null): string {
  if (!value) return 'working copy';
  return value.replace(/_/g, ' ');
}

function SummaryPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: PillTone;
}) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ].join(' ')}
      title={`${label}: ${value}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="max-w-[160px] truncate font-semibold">
        {value}
      </span>
    </span>
  );
}

export default OcrHeaderSummary;
