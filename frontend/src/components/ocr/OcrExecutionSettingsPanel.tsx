import React from 'react';
import {
  Gauge,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  createOcrExecutionPolicy,
  formatBytes,
  OCR_EXECUTION_PRESETS,
  type OcrExecutionPolicy,
  type OcrExecutionScalePreset,
} from '@/core/ocr/ocrExecutionPolicy';

export interface OcrExecutionSettingsPanelProps {
  policy: OcrExecutionPolicy;
  estimatedMemoryBytes?: number;
  running?: boolean;
  onChange: (policy: OcrExecutionPolicy) => void;
  onCancel?: () => void;
}

export const OcrExecutionSettingsPanel: React.FC<OcrExecutionSettingsPanelProps> = ({
  policy,
  estimatedMemoryBytes = 0,
  running = false,
  onChange,
  onCancel,
}) => {
  const updatePolicy = (patch: Partial<OcrExecutionPolicy>) => {
    onChange(
      createOcrExecutionPolicy({
        ...policy,
        ...patch,
      }),
    );
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-execution-settings-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            OCR Performance
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Control OCR quality, memory, page limits, and timeout.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Preset
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={policy.preset}
            data-testid="ocr-execution-preset"
            disabled={running}
            onChange={(event) =>
              onChange(
                createOcrExecutionPolicy({
                  preset: event.currentTarget.value as OcrExecutionScalePreset,
                }),
              )
            }
          >
            {Object.keys(OCR_EXECUTION_PRESETS).map((preset) => (
              <option
                key={preset}
                value={preset}
              >
                {preset}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Raster scale"
            value={policy.rasterScale}
            min={0.5}
            max={4}
            step={0.25}
            disabled={running}
            testId="ocr-execution-scale"
            onChange={(value) => updatePolicy({ rasterScale: value })}
          />

          <NumberField
            label="Max pages"
            value={policy.maxPagesPerJob}
            min={1}
            max={200}
            step={1}
            disabled={running}
            testId="ocr-execution-max-pages"
            onChange={(value) => updatePolicy({ maxPagesPerJob: value })}
          />

          <NumberField
            label="Max pixels"
            value={policy.maxCanvasPixels}
            min={1_000_000}
            max={64_000_000}
            step={1_000_000}
            disabled={running}
            testId="ocr-execution-max-pixels"
            onChange={(value) => updatePolicy({ maxCanvasPixels: value })}
          />

          <NumberField
            label="Timeout ms"
            value={policy.timeoutMs}
            min={5_000}
            max={600_000}
            step={5_000}
            disabled={running}
            testId="ocr-execution-timeout"
            onChange={(value) => updatePolicy({ timeoutMs: value })}
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={policy.allowLargeJobs}
            disabled={running}
            data-testid="ocr-execution-allow-large"
            onChange={(event) =>
              updatePolicy({
                allowLargeJobs: event.currentTarget.checked,
              })
            }
          />
          Allow large OCR jobs
        </label>

        <div
          className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-execution-memory"
        >
          Estimated raster memory: {formatBytes(estimatedMemoryBytes)}
        </div>
      </div>

      {running ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            data-testid="ocr-execution-cancel"
          >
            <Square className="mr-1 h-3.5 w-3.5" />
            Cancel OCR
          </Button>
        </div>
      ) : null}
    </div>
  );
};

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs text-slate-600 dark:text-slate-300">
      {label}
      <input
        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) =>
          onChange(Number(event.currentTarget.value))
        }
      />
    </label>
  );
}
