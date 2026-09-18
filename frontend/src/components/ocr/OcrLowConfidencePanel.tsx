import React from 'react';
import type { OcrLowConfidenceWord } from '@/core/ocr/ocrConfidence';

export interface OcrLowConfidencePanelProps {
  words: OcrLowConfidenceWord[];
  selectedWordId?: string | null;
  maxItems?: number;
  onSelectWord?: (item: OcrLowConfidenceWord) => void;
}

export const OcrLowConfidencePanel: React.FC<OcrLowConfidencePanelProps> = ({
  words,
  selectedWordId,
  maxItems = 12,
  onSelectWord,
}) => {
  const visibleWords = words.slice(0, maxItems);

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-low-confidence-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Low-confidence OCR
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Review words below 70% confidence.
          </p>
        </div>

        <span
          className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          data-testid="ocr-low-confidence-count"
        >
          {words.length}
        </span>
      </div>

      {visibleWords.length === 0 ? (
        <p className="rounded bg-slate-50 px-2 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          No low-confidence words.
        </p>
      ) : (
        <div className="space-y-1">
          {visibleWords.map((item) => {
            const selected = selectedWordId === item.word.id;

            return (
              <button
                key={`${item.pageIndex}:${item.word.id}`}
                type="button"
                className={[
                  'w-full rounded border px-2 py-1 text-left text-xs',
                  selected
                    ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                ].join(' ')}
                data-testid="ocr-low-confidence-item"
                onClick={() => onSelectWord?.(item)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {item.word.text}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {Math.round(item.word.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Page {item.pageIndex + 1} · show in document
                </div>
              </button>
            );
          })}
        </div>
      )}

      {words.length > visibleWords.length ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Showing {visibleWords.length} of {words.length}.
        </p>
      ) : null}
    </div>
  );
};
