import React from 'react';
import { FileSearch } from 'lucide-react';

export interface OcrSourcePanelProps {
  hasWarning: boolean;
  children: React.ReactNode;
}

export const OcrSourcePanel: React.FC<OcrSourcePanelProps> = ({
  hasWarning,
  children,
}) => {
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-source-panel"
      open={hasWarning}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <FileSearch className="h-3.5 w-3.5 text-blue-600" />
        Source details
        <span className="font-normal text-slate-500 dark:text-slate-400">
          {hasWarning ? 'check PDF source warning' : 'PDF source, page scope, and bytes source'}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        {children}
      </div>
    </details>
  );
};

export default OcrSourcePanel;
