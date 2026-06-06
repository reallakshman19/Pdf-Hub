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
  const hasContent = messages.length > 0 || Boolean(children);

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

      {messages.length > 0 ? (
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

      {children ? (
        <div data-testid="ocr-diagnostics-extra">
          {children}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};

function DiagnosticRow({
  item,
}: {
  item: OcrDiagnosticsMessage;
}) {
  const level = item.level ?? 'info';

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
      {item.code ? (
        <span className="font-semibold">
          {item.code}:{' '}
        </span>
      ) : null}
      {item.message}
    </div>
  );
}
