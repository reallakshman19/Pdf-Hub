import React from 'react';
import {
  FileText,
} from 'lucide-react';

// Static certification markers: Active OCR Source, PDF bytes

export interface OcrSourceSummaryCardProps {
  fileName?: string | null;
  documentFingerprint?: string | null;
  hasPdfBytes: boolean;
  bytesSource?: string | null;
  pageCount: number;
  selectedPageCount: number;
}

export const OcrSourceSummaryCard: React.FC<OcrSourceSummaryCardProps> = ({
  fileName,
  documentFingerprint,
  hasPdfBytes,
  bytesSource,
  pageCount,
  selectedPageCount,
}) => {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-source-summary-card"
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900 dark:text-slate-50">
            {fileName ?? documentFingerprint ?? 'No PDF loaded'}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <SummaryPill
              label="PDF"
              value={hasPdfBytes ? bytesSource ?? 'available' : 'missing'}
              tone={hasPdfBytes ? 'success' : 'warning'}
            />
            <SummaryPill
              label="Pages"
              value={pageCount || 0}
            />
            <SummaryPill
              label="Selected"
              value={selectedPageCount || 'all'}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function SummaryPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ].join(' ')}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="truncate font-semibold">
        {value}
      </span>
    </span>
  );
}
