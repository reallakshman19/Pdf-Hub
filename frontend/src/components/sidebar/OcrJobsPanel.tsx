import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import {
  createLegacyOcrRetirementNotice,
  normalizeLegacyOcrPageNumbers,
} from '@/core/ocr/legacyOcrCompat';
import OcrProgress from '../ocr/OcrProgress';

export interface OcrJobsPanelProps {
  ocrStore: OcrStore;
  documentKey: string;
  selectedPages: number[];
}

/**
 * Legacy compatibility wrapper.
 *
 * The active OCR UI is now OcrPanelWriterConnected. This component is retained
 * only so old imports/tests do not break while the sidebar is migrated.
 */
export default function OcrJobsPanel({
  ocrStore,
  documentKey,
  selectedPages,
}: OcrJobsPanelProps): JSX.Element {
  const notice = createLegacyOcrRetirementNotice();
  const normalizedPages = normalizeLegacyOcrPageNumbers(selectedPages);

  return (
    <div
      className="doccraft-sidebar-panel ocr-jobs-panel"
      data-testid="legacy-ocr-jobs-panel-retired"
    >
      <h3>OCR</h3>

      <div
        className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        data-testid="legacy-ocr-retirement-notice"
      >
        <div className="font-semibold">
          {notice.title}
        </div>
        <p className="mt-1">
          {notice.message}
        </p>
        <p className="mt-1">
          Replacement: {notice.replacement}
        </p>
        <p className="mt-1">
          Document: {documentKey || 'none'} · selected pages: {normalizedPages.length}
        </p>
      </div>

      <OcrProgress ocrStore={ocrStore} />
    </div>
  );
}