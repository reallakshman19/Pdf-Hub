import React from 'react';
import {
  Workflow,
} from 'lucide-react';
import {
  OCR_PIPELINE_MODE_OPTIONS,
  getOcrPipelineModeOption,
  resolveOcrPipelineMode,
  type OcrPipelineMode,
  type OcrPipelineCapabilities,
} from '@/core/ocr/ocrPipelineMode';

export interface OcrPipelineModePanelProps {
  mode: OcrPipelineMode;
  disabled?: boolean;
  capabilities?: Partial<OcrPipelineCapabilities>;
  onChange: (mode: OcrPipelineMode) => void;
}

export const OcrPipelineModePanel: React.FC<OcrPipelineModePanelProps> = ({
  mode,
  disabled = false,
  capabilities,
  onChange,
}) => {
  const resolved = resolveOcrPipelineMode({
    requestedMode: mode,
    capabilities,
  });

  const selected = getOcrPipelineModeOption(mode);

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-pipeline-mode-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <Workflow className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            OCR Pipeline Mode
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Choose where rasterization and OCR recognition run.
          </p>
        </div>
      </div>

      <label className="text-xs text-slate-600 dark:text-slate-300">
        Pipeline
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={mode}
          disabled={disabled}
          data-testid="ocr-pipeline-mode-select"
          onChange={(event) =>
            onChange(event.currentTarget.value as OcrPipelineMode)
          }
        >
          {OCR_PIPELINE_MODE_OPTIONS.map((option) => (
            <option
              key={option.id}
              value={option.id}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div
        className="mt-2 rounded bg-slate-50 px-2 py-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300"
        data-testid="ocr-pipeline-mode-description"
      >
        <div className="font-medium text-slate-800 dark:text-slate-100">
          {selected.label}
        </div>
        <div className="mt-0.5">
          {selected.description}
        </div>
        <div className="mt-1 text-slate-500">
          Recommended for: {selected.recommendedFor}
        </div>
      </div>

      {resolved.diagnostics.some((diagnostic) => diagnostic.level === 'warning') ? (
        <div
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="ocr-pipeline-mode-warning"
        >
          {resolved.diagnostics
            .filter((diagnostic) => diagnostic.level === 'warning')
            .map((diagnostic) => diagnostic.message)
            .join(' ')}
        </div>
      ) : null}

      <div
        className="mt-2 text-[11px] text-slate-500"
        data-testid="ocr-pipeline-effective-mode"
      >
        Effective mode: {resolved.option.label}
      </div>
    </div>
  );
};
