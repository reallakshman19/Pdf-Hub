/**
 * Deprecated compatibility component.
 *
 * New OCR UX uses OcrPipelineModePanel as the single execution switch.
 * Keep this component temporarily so older tests/imports do not break.
 */

import React from 'react';
import {
  Cpu,
} from 'lucide-react';

export interface OcrWorkerModeToggleProps {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}

export const OcrWorkerModeToggle: React.FC<OcrWorkerModeToggleProps> = ({
  enabled,
  disabled = false,
  onChange,
}) => {
  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-worker-mode-toggle"
    >
      <div className="mb-2 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            OCR Worker Mode (Deprecated)
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Deprecated compatibility control. Use OCR Pipeline Mode instead.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          data-testid="ocr-worker-mode-checkbox"
          onChange={(event) => {
            onChange(event.currentTarget.checked);
          }}
        />
        Use worker-backed OCR runner
      </label>

      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        {enabled
          ? 'Worker mode is enabled. OCR should avoid blocking the UI thread.'
          : 'Main-thread mode is active. Use this for debugging and fallback.'}
      </p>
    </div>
  );
};
