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

  return (
    <OcrSectionShell
      title="Start OCR"
      description="One clear action starts OCR. Keep advanced settings closed unless the document is large, slow, or needs a specific engine."
      icon={<PlayCircle className="h-4 w-4 text-emerald-600" />}
      testId="ocr-run-section"
    >
      {runControls ? (
        <div
          className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-950"
          data-testid="ocr-run-controls"
        >
          <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                Recommended
              </div>
              <h4 className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">
                Run OCR with safe defaults
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Start here for most PDFs. The result, searchable text, low-confidence words, and Writer insertion tools appear in the review area after processing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {runControls}
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-run-error"
        >
          <span className="font-semibold">OCR could not continue. </span>
          {errorMessage}
        </div>
      ) : null}

      {hasAdvancedSettings ? (
        <details
          className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          data-testid="ocr-run-advanced-settings"
        >
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Settings2 className="h-3.5 w-3.5" />
            Advanced OCR settings
            <span className="font-normal text-slate-500 dark:text-slate-400">
              engine, pages, memory, timeout, pipeline
            </span>
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800">
            {engineControls ? (
              <div data-testid="ocr-run-engine-controls">
                <PanelLabel title="Recognition" subtitle="Engine, scan profile, and forced OCR behavior." />
                {engineControls}
              </div>
            ) : null}

            {pipelineMode ? (
              <div data-testid="ocr-run-pipeline-mode">
                <PanelLabel title="Pipeline" subtitle="Choose main-thread or worker-backed execution when available." />
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
                <PanelLabel title="Execution limits" subtitle="Control memory and batch size for large documents." />
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
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        {subtitle}
      </div>
    </div>
  );
}
