import React from 'react';
import {
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrProfileId } from '@/core/ocr/ocrProfiles';
import {
  normalizeOcrLanguageSet,
} from '@/core/ocr/ocrLanguageSet';

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
  languageHints: string[];
  forceOcr: boolean;
  disabled?: boolean;
  onEngineChange: (engineId: string) => void;
  onProfileChange: (profileId: OcrProfileId) => void;
  onLanguageHintsChange: (languageHints: string[]) => void;
  onForceOcrChange: (forceOcr: boolean) => void;
}

export function OcrEngineControls({
  engines,
  profiles,
  engineId,
  profileId,
  languageHints,
  forceOcr,
  disabled = false,
  onEngineChange,
  onProfileChange,
  onLanguageHintsChange,
  onForceOcrChange,
}: OcrEngineControlsProps) {
  const canonicalLanguageSpec = languageHints.join('+');
  const [languageDraft, setLanguageDraft] = React.useState(canonicalLanguageSpec);
  const [languageError, setLanguageError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLanguageDraft(canonicalLanguageSpec);
    setLanguageError(null);
  }, [canonicalLanguageSpec]);

  const commitLanguages = () => {
    try {
      const normalized = normalizeOcrLanguageSet(languageDraft);
      setLanguageDraft(normalized.join('+'));
      setLanguageError(null);
      onLanguageHintsChange(normalized);
    } catch (error) {
      setLanguageError(
        error instanceof Error
          ? error.message
          : 'Invalid OCR language set.',
      );
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2" data-testid="ocr-engine-controls-workflow">
      <label className="text-xs text-slate-600 dark:text-slate-300">
        Engine
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={engineId}
          data-testid="ocr-engine-select"
          disabled={disabled}
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
          disabled={disabled}
          onChange={(event) => onProfileChange(event.currentTarget.value as OcrProfileId)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-slate-600 dark:text-slate-300">
        Languages
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          type="text"
          value={languageDraft}
          disabled={disabled}
          data-testid="ocr-language-input"
          aria-invalid={languageError ? 'true' : 'false'}
          aria-describedby={languageError ? 'ocr-language-error' : 'ocr-language-help'}
          onChange={(event) => setLanguageDraft(event.currentTarget.value)}
          onBlur={commitLanguages}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitLanguages();
            }
          }}
        />
        <span
          id="ocr-language-help"
          className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400"
        >
          Ordered OCR codes, for example eng+hin+tam.
        </span>
        {languageError ? (
          <span
            id="ocr-language-error"
            role="alert"
            className="mt-1 block text-[11px] text-red-600 dark:text-red-400"
          >
            {languageError}
          </span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={forceOcr}
          disabled={disabled}
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
  runDisabled?: boolean;
  clearDisabled?: boolean;
  showClear?: boolean;
}

export function OcrRunActions({
  running,
  onRun,
  onClear,
  onCancel,
  runDisabled = false,
  clearDisabled = false,
  showClear = true,
}: OcrRunActionsProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="ocr-run-actions-workflow">
      <Button
        type="button"
        size="sm"
        onClick={onRun}
        disabled={running || runDisabled}
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
