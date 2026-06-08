import React from 'react';
import {
  PlayCircle,
  Settings2,
} from 'lucide-react';
import { OcrSectionShell } from './OcrSectionShell';

export interface OcrRunSectionProps {
  engineControls?: React.ReactNode;
  executionSettings?: React.ReactNode;
  pipelineMode?: React.ReactNode;
  workerMode?: React.ReactNode;
  batchQueue?: React.ReactNode;
  runControls?: React.ReactNode;
  executionDiagnostics?: React.ReactNode;
  errorMessage?: string | null;
}

export const OcrRunSection: React.FC<OcrRunSectionProps> = ({
  engineControls,
  executionSettings,
  pipelineMode,
  workerMode,
  batchQueue,
  runControls,
  executionDiagnostics,
  errorMessage,
}) => {
  const hasAdvancedSettings = Boolean(
    engineControls || pipelineMode || workerMode || executionSettings || executionDiagnostics || batchQueue,
  );
  const [manualAdvancedOpen, setManualAdvancedOpen] = React.useState(false);
  const advancedOpen = Boolean(executionDiagnostics) || manualAdvancedOpen;

  return (
    <OcrSectionShell
      title="Start OCR"
      description="Run OCR first. Fine-tune settings only when a document needs it."
      icon={<PlayCircle className="h-4 w-4 text-emerald-600" />}
      testId="ocr-run-section"
    >
      {runControls ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 dark:border-emerald-900 dark:bg-emerald-950/30"
          data-testid="ocr-run-controls"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                Recommended settings
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                OCR will create searchable text and review tools.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              {runControls}
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-run-error"
        >
          <span className="font-semibold">OCR could not continue. </span>
          {errorMessage}
        </div>
      ) : null}

      {hasAdvancedSettings ? (
        <details
          className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          data-testid="ocr-run-advanced-settings"
          open={advancedOpen}
          onToggle={(event) => {
            if (!executionDiagnostics) setManualAdvancedOpen(event.currentTarget.open);
          }}
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Settings2 className="h-3.5 w-3.5" />
            Advanced OCR settings
            <span className="font-normal text-slate-500 dark:text-slate-400">
              engine, pages, memory, timeout, pipeline
            </span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
            {engineControls ? (
              <div data-testid="ocr-run-engine-controls">
                <PanelLabel title="Recognition" subtitle="Engine, scan profile, and forced OCR behavior." />
                {engineControls}
              </div>
            ) : null}

            {pipelineMode ? (
              <div data-testid="ocr-run-pipeline-mode">
                <PanelLabel title="Pipeline" subtitle="Main-thread or worker-backed execution." />
                {pipelineMode}
              </div>
            ) : null}

            {workerMode ? (
              <div data-testid="ocr-run-worker-mode">
                {workerMode}
              </div>
            ) : null}

            {executionSettings ? (
              <div data-testid="ocr-run-execution-settings">
                <PanelLabel title="Execution limits" subtitle="Memory and batch size for large documents." />
                {executionSettings}
              </div>
            ) : null}

            {executionDiagnostics ? (
              <div data-testid="ocr-run-execution-diagnostics">
                <PanelLabel title="Execution notes" subtitle="Planner messages before the OCR job starts." />
                {executionDiagnostics}
              </div>
            ) : null}

            {batchQueue ? (
              <div data-testid="ocr-run-batch-queue">
                {batchQueue}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </OcrSectionShell>
  );
};

function PanelLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-2">
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>
    </div>
  );
}
