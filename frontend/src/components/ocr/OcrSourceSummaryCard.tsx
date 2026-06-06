import React from 'react';
import {
  FileText,
} from 'lucide-react';

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
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-source-summary-card"
    >
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Active OCR Source
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            PDF source used for rasterization and searchable PDF export.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <SummaryCell
          label="Document"
          value={fileName ?? documentFingerprint ?? 'none'}
          wide
        />
        <SummaryCell
          label="PDF bytes"
          value={hasPdfBytes ? bytesSource ?? 'available' : 'missing'}
          tone={hasPdfBytes ? 'success' : 'warning'}
        />
        <SummaryCell
          label="Pages"
          value={pageCount || 0}
        />
        <SummaryCell
          label="Selected"
          value={selectedPageCount || 'all'}
        />
      </div>
    </div>
  );
};

function SummaryCell({
  label,
  value,
  tone = 'neutral',
  wide,
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning';
  wide?: boolean;
}) {
  return (
    <div
      className={[
        'rounded border px-2 py-2',
        wide ? 'col-span-2' : '',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ].join(' ')}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold">
        {value}
      </div>
    </div>
  );
}
