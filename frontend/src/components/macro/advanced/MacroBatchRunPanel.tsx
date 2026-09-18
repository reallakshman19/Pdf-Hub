import React from 'react';
import { Files, Play, Square } from 'lucide-react';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { BatchRunDialog } from '@/components/dialogs/BatchRunDialog';
import { Button } from '@/components/ui/Button';
import { downloadBlob } from '@/core/document/download';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { runMacroBatch } from '@/core/macro/batchRunner';
import type { MacroRecipe } from '@/core/macro/types';
import { useToastStore } from '@/core/toast/store';

export interface MacroBatchRunPanelProps {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export const MacroBatchRunPanel: React.FC<MacroBatchRunPanelProps> = ({
  disabled = false,
  onBusyChange,
}) => {
  const addToast = useToastStore((state) => state.addToast);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeRecipeName, setActiveRecipeName] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    onBusyChange?.(isRunning);
    return () => {
      if (isRunning) onBusyChange?.(false);
    };
  }, [isRunning, onBusyChange]);

  React.useEffect(() => () => {
    abortRef.current?.abort('Batch workflow panel unmounted');
  }, []);

  const runBatch = async (recipe: MacroRecipe) => {
    if (disabled || isRunning) return;

    const controller = new AbortController();
    abortRef.current?.abort('Superseded by a new batch workflow');
    abortRef.current = controller;
    setIsRunning(true);
    setActiveRecipeName(recipe.name);

    try {
      const sources = await FileAdapter.pickPdfFileSources(true);
      if (sources.length === 0 || controller.signal.aborted) return;

      const report = await runMacroBatch({
        sources,
        recipe,
        continueOnError: true,
        abortSignal: controller.signal,
        onOutput: ({ inputIndex, fileName, bytes }) => {
          if (controller.signal.aborted) return;
          FileAdapter.downloadBytes(
            bytes,
            buildBatchOutputName(inputIndex, fileName, recipe.id),
          );
        },
      });

      if (controller.signal.aborted || report.cancelled) {
        addToast({
          type: 'info',
          title: 'Batch Run Cancelled',
          message: 'Remaining PDFs were not processed.',
        });
        return;
      }

      downloadBlob(
        new Blob(
          [JSON.stringify(report, null, 2)],
          { type: 'application/json;charset=utf-8' },
        ),
        `batch-report-${Date.now()}.json`,
      );

      addToast({
        type: report.summary.failed > 0 ? 'info' : 'success',
        title: 'Batch Run Complete',
        message:
          `Processed ${report.summary.processed} file(s): `
          + `${report.summary.succeeded} succeeded, `
          + `${report.summary.failed} failed.`,
      });
    } catch (error) {
      if (
        controller.signal.aborted
        || isOperationCancelledError(error)
      ) {
        return;
      }

      addToast({
        type: 'error',
        title: 'Batch Run Failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsRunning(false);
      setActiveRecipeName(null);
    }
  };

  return (
    <section
      className="mb-4"
      aria-label="Batch process PDFs"
      data-testid="automate-batch-run"
    >
      <article className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-2">
          <Files className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Batch Process PDFs
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Run one workflow across multiple PDFs. Each processed PDF downloads as it completes, followed by a JSON report.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {isRunning ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs text-red-600"
              onClick={() => abortRef.current?.abort('Cancelled by user')}
            >
              <Square className="mr-1 h-3 w-3" />
              Cancel Batch
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => setDialogOpen(true)}
              disabled={disabled}
            >
              <Play className="mr-1 h-3 w-3" />
              Choose Workflow
            </Button>
          )}
        </div>

        {isRunning && activeRecipeName ? (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Running {activeRecipeName}…
          </p>
        ) : null}
      </article>

      <BatchRunDialog
        isOpen={dialogOpen}
        disabled={disabled || isRunning}
        onClose={() => {
          if (!isRunning) setDialogOpen(false);
        }}
        onConfirm={(recipe) => void runBatch(recipe)}
      />
    </section>
  );
};

function buildBatchOutputName(
  inputIndex: number,
  fileName: string,
  recipeId: string,
): string {
  const rawBase = fileName.replace(/\.pdf$/i, '') || 'document';
  const base = rawBase
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-|-$/g, '')
    || 'document';
  const safeRecipe = recipeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'workflow';
  const order = String(inputIndex + 1).padStart(3, '0');
  return `${order}-${base}-${safeRecipe}.pdf`;
}
