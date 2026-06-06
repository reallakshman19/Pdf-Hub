import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import {
  createLegacyOcrLaunchPlan,
  createLegacyOcrRetirementNotice,
  shouldDisableLegacyPreviewOcr,
} from '@/core/ocr/legacyOcrCompat';

export interface OcrLauncherProps {
  ocrStore: OcrStore;
  documentKey: string;
  pageNumbers: number[];
  language?: string;
  onLegacyBlocked?: (message: string) => void;
}

export default function OcrLauncher({
  documentKey,
  pageNumbers,
  language = 'eng',
  onLegacyBlocked,
}: OcrLauncherProps): JSX.Element {
  const notice = createLegacyOcrRetirementNotice();
  const disabled = shouldDisableLegacyPreviewOcr();

  const handleClick = () => {
    const plan = createLegacyOcrLaunchPlan({
      documentKey,
      pageNumbers,
      language,
    });

    onLegacyBlocked?.(
      plan.diagnostics.map((diagnostic) => diagnostic.message).join(' '),
    );
  };

  return (
    <div
      className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      data-testid="legacy-ocr-launcher-retired"
    >
      <div className="font-semibold">
        {notice.title}
      </div>
      <p className="mt-1">
        {notice.message}
      </p>
      <button
        type="button"
        data-ocr-mode="retired-preview"
        data-testid="legacy-ocr-launcher-button"
        onClick={handleClick}
        disabled={disabled}
        className="mt-2 rounded border border-amber-300 px-2 py-1 opacity-60"
        title="Legacy preview OCR is retired"
      >
        Run preview OCR retired
      </button>
    </div>
  );
}