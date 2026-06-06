import React from 'react';

export interface OcrSectionShellProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}

export const OcrSectionShell: React.FC<OcrSectionShellProps> = ({
  title,
  description,
  icon,
  children,
  actions,
  testId,
}) => {
  return (
    <section
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid={testId ?? 'ocr-section-shell'}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {icon ? (
            <div className="mt-0.5">
              {icon}
            </div>
          ) : null}

          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </h4>
            {description ? (
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="shrink-0">
            {actions}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
};
