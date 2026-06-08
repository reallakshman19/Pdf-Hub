import React from 'react';
import {
  Loader2,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrPrimaryActionModel } from './OcrWorkflowTypes';

export interface OcrPrimaryActionBarProps {
  action: OcrPrimaryActionModel;
}

export const OcrPrimaryActionBar: React.FC<OcrPrimaryActionBarProps> = ({ action }) => {
  return (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm dark:border-blue-900 dark:bg-blue-950/20"
      data-testid="ocr-primary-action-bar"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            {primaryTitle(action)}
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            {action.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 dark:border-blue-900 dark:bg-slate-950">
              Page scope: {action.pageScopeLabel}
            </span>
            <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 dark:border-blue-900 dark:bg-slate-950">
              Profile: {action.profileLabel}
            </span>
            {action.progressLabel ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {action.progressLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            size="sm"
            onClick={action.onRun}
            disabled={!action.canRun || action.state === 'running'}
            data-testid="run-ocr-button"
          >
            {action.state === 'running' ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Running OCR...
              </>
            ) : (
              <>
                <Search className="mr-1 h-3.5 w-3.5" />
                {action.state === 'complete' ? 'Run again' : 'Run OCR'}
              </>
            )}
          </Button>

          {action.canCancel && action.onCancel ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={action.onCancel}
              data-testid="ocr-primary-cancel"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={action.onClear}
            disabled={!action.canClear && action.state !== 'error'}
            data-testid="clear-ocr-button"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {action.errorMessage ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-run-error"
        >
          <span className="font-semibold">OCR failed. </span>
          {action.errorMessage}
        </div>
      ) : null}
    </section>
  );
};

function primaryTitle(action: OcrPrimaryActionModel): string {
  if (action.state === 'running') return 'Running OCR...';
  if (action.state === 'complete') return action.completedLabel ?? 'OCR complete';
  if (action.state === 'error') return 'OCR needs attention';
  return 'Run OCR';
}

export default OcrPrimaryActionBar;
