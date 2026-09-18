import {
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrProfileId } from '@/core/ocr/ocrProfiles';

export interface OcrEngineOption {
  id: string;
  label: string;
}

export interface OcrProfileOption {
  id: OcrProfileId;
  label: string;
}

export interface OcrEngineControlsProps {
  engines: OcrEngineOption[];
  profiles: OcrProfileOption[];
  engineId: string;
  profileId: OcrProfileId;
  forceOcr: boolean;
  onEngineChange: (engineId: string) => void;
  onProfileChange: (profileId: OcrProfileId) => void;
  onForceOcrChange: (forceOcr: boolean) => void;
}

export function OcrEngineControls({
  engines,
  profiles,
  engineId,
  profileId,
  forceOcr,
  onEngineChange,
  onProfileChange,
  onForceOcrChange,
}: OcrEngineControlsProps) {
  return (
    <div className="grid grid-cols-1 gap-2" data-testid="ocr-engine-controls-workflow">
      <label className="text-xs text-slate-600 dark:text-slate-300">
        Engine
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={engineId}
          data-testid="ocr-engine-select"
          onChange={(event) => onEngineChange(event.currentTarget.value || 'mock')}
        >
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-slate-600 dark:text-slate-300">
        Profile
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={profileId}
          onChange={(event) => onProfileChange(event.currentTarget.value as OcrProfileId)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={forceOcr}
          onChange={(event) => onForceOcrChange(event.currentTarget.checked)}
        />
        Force OCR even if embedded text exists
      </label>
    </div>
  );
}

export interface OcrRunActionsProps {
  running: boolean;
  onRun: () => void;
  onClear: () => void;
  onCancel?: () => void;
  clearDisabled?: boolean;
  showClear?: boolean;
}

export function OcrRunActions({
  running,
  onRun,
  onClear,
  onCancel,
  clearDisabled = false,
  showClear = true,
}: OcrRunActionsProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="ocr-run-actions-workflow">
      <Button
        type="button"
        size="sm"
        onClick={onRun}
        disabled={running}
        data-testid="run-ocr-button"
      >
        {running ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Recognizing
          </>
        ) : (
          <>
            <Search className="mr-1 h-3.5 w-3.5" />
            Recognize text
          </>
        )}
      </Button>

      {running && onCancel ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onCancel}
          data-testid="cancel-ocr-button"
        >
          Cancel
        </Button>
      ) : null}

      {showClear ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={running || clearDisabled}
          data-testid="clear-ocr-button"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset OCR
        </Button>
      ) : null}
    </div>
  );
}
