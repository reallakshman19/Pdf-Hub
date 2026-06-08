import React from 'react';
import { Settings2 } from 'lucide-react';

export interface OcrAdvancedPanelProps {
  forceOpen?: boolean;
  children: React.ReactNode;
}

export const OcrAdvancedPanel: React.FC<OcrAdvancedPanelProps> = ({
  forceOpen = false,
  children,
}) => {
  const [open, setOpen] = React.useState(forceOpen);

  React.useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <details
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-advanced-panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <Settings2 className="h-3.5 w-3.5 text-slate-500" />
        Advanced OCR settings
        <span className="font-normal text-slate-500 dark:text-slate-400">
          engine, profile, execution limits, project restore, diagnostics, fixtures
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
        {children}
      </div>
    </details>
  );
};

export function OcrAdvancedGroup({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section data-testid={testId}>
      <div className="mb-2">
        <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </div>
        {description ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default OcrAdvancedPanel;
