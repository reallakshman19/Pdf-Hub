import React from 'react';
import {
  PlayCircle,
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
      description="Use the default settings first. Open advanced settings only when you need control over engine, pages, or performance."
      icon={<PlayCircle className="h-4 w-4 text-emerald-600" />}
      testId="ocr-run-section"
    >
      {runControls ? (
        <div
          className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"
          data-testid="ocr-run-controls"
        >
          <p className="mb-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            Recommended path: click Start OCR, then review the extracted text below.
          </p>
          <div className="flex flex-wrap gap-2">
            {runControls}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-run-error"
        >
          {errorMessage}
        </div>
      ) : null}

      {hasAdvancedSettings ? (
        <details
          className="rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          data-testid="ocr-run-advanced-settings"
        >
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Advanced OCR settings
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
            {engineControls ? (
              <div data-testid="ocr-run-engine-controls">
                {engineControls}
              </div>
            ) : null}

            {pipelineMode ? (
              <div data-testid="ocr-run-pipeline-mode">
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
                {executionSettings}
              </div>
            ) : null}

            {executionDiagnostics ? (
              <div data-testid="ocr-run-execution-diagnostics">
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
