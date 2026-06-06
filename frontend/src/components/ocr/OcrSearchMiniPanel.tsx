import React from 'react';
import type { OcrSearchMatch } from '@/core/ocr/ocrSearchIndex';

export interface OcrSearchMiniPanelProps {
  disabled?: boolean;
  onSearch: (query: string) => OcrSearchMatch[];
}

export const OcrSearchMiniPanel: React.FC<OcrSearchMiniPanelProps> = ({
  disabled,
  onSearch,
}) => {
  const [query, setQuery] = React.useState('');
  const [matches, setMatches] = React.useState<OcrSearchMatch[]>([]);

  const runSearch = React.useCallback((nextQuery: string) => {
    setQuery(nextQuery);

    if (!nextQuery.trim()) {
      setMatches([]);
      return;
    }

    setMatches(onSearch(nextQuery));
  }, [onSearch]);

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-search-mini-panel"
    >
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        Search OCR text
        <input
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          value={query}
          disabled={disabled}
          placeholder="Search OCR result"
          onChange={(event) => runSearch(event.currentTarget.value)}
        />
      </label>

      <div className="mt-2 space-y-1">
        {query.trim() && matches.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No OCR matches.
          </p>
        ) : null}

        {matches.slice(0, 8).map((match) => (
          <div
            key={match.item.id}
            className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300"
            data-testid="ocr-search-match"
          >
            <div className="truncate font-medium">
              {match.item.text}
            </div>
            <div className="text-[11px] text-slate-500">
              Page {match.item.pageIndex + 1} · {match.item.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
