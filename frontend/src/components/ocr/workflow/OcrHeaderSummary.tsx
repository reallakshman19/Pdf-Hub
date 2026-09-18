import React from 'react';
import { ScanText } from 'lucide-react';

export interface OcrHeaderSummaryProps {
  fileName?: string | null;
  documentFingerprint?: string | null;
  hasPdfBytes: boolean;
  bytesSource?: string | null;
  pageCount?: number | null;
  selectedPageCount?: number | null;
}

export const OcrHeaderSummary: React.FC<OcrHeaderSummaryProps> = ({
  fileName,
  documentFingerprint,
  hasPdfBytes,
  bytesSource,
  pageCount,
  selectedPageCount,
}) => {
  const sourceLabel = hasPdfBytes ? normalizeSource(bytesSource) : 'no PDF';
  const selectedLabel = selectedPageCount && selectedPageCount > 0
    ? `${selectedPageCount} selected`
    : 'no page selection';
  const documentLabel = fileName ?? documentFingerprint ?? 'No PDF loaded';

  return (
    <div className="flex items-start gap-3" data-testid="ocr-header-summary">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
        <ScanText className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          OCR
        </h3>
        <p
          className="mt-0.5 truncate text-xs leading-5 text-slate-600 dark:text-slate-300"
          title={documentLabel}
        >
          {documentLabel}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="ocr-unified-summary">
          <SummaryPill label="Source" value={sourceLabel} warning={!hasPdfBytes} />
          <SummaryPill label="Pages" value={pageCount || 0} />
          <SummaryPill label="Selection" value={selectedLabel} />
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
  warning = false,
}: {
  label: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        warning
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ].join(' ')}
      title={`${label}: ${value}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="max-w-[170px] truncate font-semibold">
        {value}
      </span>
    </span>
  );
}

export default OcrHeaderSummary;
