import React from 'react';
import { FileText } from 'lucide-react';
import type {
  OcrHeaderPill,
  OcrHeaderSummaryModel,
  OcrPillTone,
} from './OcrWorkflowTypes';

export interface OcrHeaderSummaryProps {
  summary: OcrHeaderSummaryModel;
}

export const OcrHeaderSummary: React.FC<OcrHeaderSummaryProps> = ({ summary }) => {
  const pills: OcrHeaderPill[] = [
    {
      label: 'PDF',
      value: summary.sourceState,
      tone: summary.workflowState === 'missing-source' ? 'warning' : 'success',
    },
    {
      label: 'Pages',
      value: summary.pageCount,
      tone: 'neutral',
    },
    {
      label: 'Selected',
      value: summary.selectedPageCount || 'all',
      tone: 'neutral',
    },
    {
      label: 'Scope',
      value: summary.scopeLabel,
      tone: 'info',
    },
  ];

  if (summary.workflowState === 'complete') {
    pills.push({
      label: 'Confidence',
      value: `${Math.round(summary.averageConfidence ?? 0)}%`,
      tone: 'success',
    });
    pills.push({
      label: 'Review',
      value: summary.lowConfidenceCount ?? 0,
      tone: (summary.lowConfidenceCount ?? 0) > 0 ? 'warning' : 'success',
    });
  }

  if (summary.workflowState === 'error') {
    pills.push({ label: 'Status', value: 'failed', tone: 'danger' });
  }

  return (
    <header
      className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-header-summary"
    >
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <FileText className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1" data-testid="ocr-unified-summary">
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            OCR Assistant
          </div>
          <div
            className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300"
            title={`${summary.fileName} · ${summary.pageCount} pages · ${summary.selectedPageCount || 'all'} selected · ${summary.sourceState}`}
          >
            {summary.fileName} · {summary.pageCount} pages ·{' '}
            {summary.selectedPageCount || 'all'} selected · {summary.sourceState}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pills.map((pill) => (
              <SummaryPill key={`${pill.label}-${pill.value}`} pill={pill} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

function SummaryPill({ pill }: { pill: OcrHeaderPill }) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
        pillToneClass(pill.tone ?? 'neutral'),
      ].join(' ')}
      title={`${pill.label}: ${pill.value}`}
    >
      <span className="font-semibold uppercase tracking-wide opacity-70">
        {pill.label}
      </span>
      <span className="max-w-[160px] truncate font-semibold">
        {pill.value}
      </span>
    </span>
  );
}

function pillToneClass(tone: OcrPillTone): string {
  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (tone === 'danger') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200';
  }
  if (tone === 'info') {
    return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
}

export default OcrHeaderSummary;
