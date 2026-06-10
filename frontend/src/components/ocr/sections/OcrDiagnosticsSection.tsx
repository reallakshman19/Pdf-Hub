import React from 'react';
import {
  Info,
} from 'lucide-react';
import { OcrSectionShell } from './OcrSectionShell';

export interface OcrDiagnosticsMessage {
  level?: 'info' | 'warning' | 'error';
  code?: string;
  message: string;
}

export interface OcrDiagnosticsSectionProps {
  messages?: OcrDiagnosticsMessage[];
  children?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const OcrDiagnosticsSection: React.FC<OcrDiagnosticsSectionProps> = ({
  messages = [],
  children,
  emptyState,
}) => {
  const [userOpen, setUserOpen] = React.useState(false);
  const counts = summarizeDiagnostics(messages);
  const hasContent = messages.length > 0 || Boolean(children);
  const hasError = counts.error > 0;
  const diagnosticsOpen = hasError || userOpen;

  return (
    <OcrSectionShell
      title="Diagnostics"
      description="Source, pipeline, worker, execution, and export messages."
      icon={<Info className="h-4 w-4 text-slate-600" />}
      testId="ocr-diagnostics-section"
    >
      {!hasContent ? (
        emptyState ?? (
          <div
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            data-testid="ocr-diagnostics-empty"
          >
            No OCR diagnostics yet.
          </div>
        )
      ) : null}

      {hasContent ? (
        <div
          className="space-y-2"
          data-testid="ocr-diagnostics-summary"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <div className="flex flex-wrap items-center gap-1.5">
              <DiagnosticBadge label="Errors" value={counts.error} tone="error" />
              <DiagnosticBadge label="Warnings" value={counts.warning} tone="warning" />
              <DiagnosticBadge label="Info" value={counts.info} tone="info" />
              {children ? (
                <span
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  data-testid="ocr-diagnostics-progress-badge"
                >
                  Progress attached
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => setUserOpen((current) => !current)}
              data-testid="ocr-diagnostics-toggle"
            >
              {diagnosticsOpen ? 'Hide diagnostics' : 'Show diagnostics'}
            </button>
          </div>

          {hasError ? (
            <div
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              data-testid="ocr-diagnostics-error-prominent"
            >
              OCR has {counts.error} error diagnostic(s). Details are expanded automatically.
            </div>
          ) : null}
        </div>
      ) : null}

      {messages.length > 0 && diagnosticsOpen ? (
        <div
          className="space-y-1"
          data-testid="ocr-diagnostics-message-list"
        >
          {messages.map((item, index) => (
            <DiagnosticRow
              key={`${item.code ?? 'diagnostic'}-${index}`}
              item={item}
            />
          ))}
        </div>
      ) : null}

      {children && diagnosticsOpen ? (
        <div data-testid="ocr-diagnostics-extra">
          {children}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};

function DiagnosticBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'error' | 'warning' | 'info';
}) {
  const className =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
      data-testid={`ocr-diagnostics-badge-${tone}`}
    >
      {label}: {value}
    </span>
  );
}

function DiagnosticRow({
  item,
}: {
  item: OcrDiagnosticsMessage;
}) {
  const level = item.level ?? 'info';
  const codeLabel = item.code ? formatDiagnosticCode(item.code) : null;

  const className =
    level === 'error'
      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
      : level === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';

  return (
    <div
      className={`rounded border px-2 py-1 text-xs ${className}`}
      data-testid="ocr-diagnostics-message"
    >
      {item.code && codeLabel ? (
        <span className="font-semibold">
          {codeLabel} ({item.code}):{' '}
        </span>
      ) : null}
      {item.message}
    </div>
  );
}

function summarizeDiagnostics(messages: OcrDiagnosticsMessage[]) {
  return messages.reduce(
    (acc, item) => {
      const level = item.level ?? 'info';
      acc[level] += 1;
      return acc;
    },
    {
      info: 0,
      warning: 0,
      error: 0,
    },
  );
}

function formatDiagnosticCode(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((part, index) => (index === 0 ? part.toUpperCase() : part))
    .join(' ');
}
