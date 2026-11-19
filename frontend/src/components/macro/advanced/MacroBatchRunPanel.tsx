import React from 'react';
import { Files, Play, Square } from 'lucide-react';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { BatchRunDialog } from '@/components/dialogs/BatchRunDialog';
import { Button } from '@/components/ui/Button';
import { downloadBlob } from '@/core/document/download';
import { isOperationCancelledError, throwIfAborted } from '@/core/cancellation/operationCancellation';
import { runMacroBatch, type BatchRunResult } from '@/core/macro/batchRunner';
import { useMacroOutputQueueStore } from '@/core/macro/outputQueueStore';
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
  const lastReport = useMacroOutputQueueStore((state) => state.lastBatchReport);
  const setLastReport = useMacroOutputQueueStore((state) => state.setLastBatchReport);
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

  const downloadReport = (report: BatchRunResult) => {
    downloadBlob(
      new Blob(
        [JSON.stringify(report, null, 2)],
        { type: 'application/json;charset=utf-8' },
      ),
      `batch-report-${report.metadata.runId}.json`,
    );
  };

  const runBatch = async (recipe: MacroRecipe) => {
    if (disabled || isRunning) return;

    const controller = new AbortController();
    abortRef.current?.abort('Superseded by a new batch workflow');
    abortRef.current = controller;
    onBusyChange?.(true);
    setIsRunning(true);
    setActiveRecipeName(recipe.name);
    setLastReport(null);

    try {
      const sources = await FileAdapter.pickPdfFileSources(true);
      if (sources.length === 0 || controller.signal.aborted) return;

      const report = await runMacroBatch({
        sources,
        recipe,
        continueOnError: true,
        abortSignal: controller.signal,
        onOutputs: async (outputs) => {
          throwIfAborted(controller.signal, 'batch PDF custody');
          // All PDFs from one input are verified and added in ONE queue change.
          // Never publish the primary while an auxiliary remains unaccounted for.
          const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(outputs);
          if (ids.length !== outputs.length) {
            throw new Error('Batch output group could not be staged completely.');
          }
        },
      });

      setLastReport(report);
      // The report's browser download is unverified; retain it in this panel
      // for retry, even after partial cancellation.
      let reportDownloadInitiated = false;
      try {
        downloadReport(report);
        reportDownloadInitiated = true;
      } catch {
        // Retained report remains available through explicit retry.
      }

      if (controller.signal.aborted || report.cancelled) {
        addToast({
          type: 'info',
          title: 'Batch Run Cancelled',
          message: 'Processed outputs already queued remain available. The remaining PDFs were not processed.',
        });
        return;
      }

      addToast({
        type: report.summary.failed > 0 ? 'info' : 'success',
        title: 'Batch Run Complete',
        message:
          `Processed ${report.summary.processed} file(s): `
          + `${report.summary.succeeded} succeeded, `
          + `${report.summary.failed} failed. `
          + `${report.summary.outputsHandedOff} PDFs (including auxiliary files) are queued for explicit saving; `
          + (reportDownloadInitiated
            ? 'report download was initiated but receipt is unverified.'
            : 'report download did not start; use Download JSON Report Again.'),
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
      onBusyChange?.(false);
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
              Run one workflow across multiple PDFs. Every generated PDF, including extracts, is grouped and verified in the Output Queue. Save or confirm each file; the JSON report records per-output provenance.
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

        {lastReport ? (
          <div className="mt-2 space-y-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => downloadReport(lastReport)}
            >
              Download JSON Report Again
            </Button>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              PDF outputs and this report are held in this browser session,
              not durable across reload. Download initiation does not prove receipt;
              save or confirm before closing the tab.
            </p>
          </div>
        ) : null}

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

