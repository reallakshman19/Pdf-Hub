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
  return (
    <OcrSectionShell
      title="Run OCR"
      description="Configure the engine, pipeline, performance policy, and batch execution."
      icon={<PlayCircle className="h-4 w-4 text-emerald-600" />}
      testId="ocr-run-section"
    >
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

      {errorMessage ? (
        <div
          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          data-testid="ocr-run-error"
        >
          {errorMessage}
        </div>
      ) : null}

      {runControls ? (
        <div
          className="flex flex-wrap gap-2"
          data-testid="ocr-run-controls"
        >
          {runControls}
        </div>
      ) : null}
    </OcrSectionShell>
  );
};
