import React, { useState, useEffect } from 'react';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';

const MODE_LABELS: Record<string, string> = {
  view: 'View',
  annotate: 'Annotate',
  draw: 'Draw',
  write: 'Write',
  organize: 'Organize',
  generate: 'Generate',
};

export const StatusBar: React.FC = () => {
  const { isDirty, viewState, pageCount, setZoom, setPage } = useSessionStore();
  const { activeMode } = useEditorStore();

  const [visiblePage, setVisiblePage] = useState(1);
  const [localPageValue, setLocalPageValue] = useState<string>('');
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);

  const pageDisplayValue = isEditingPageInput
    ? localPageValue
    : String(visiblePage ?? viewState.currentPage);

  useEffect(() => {
    const container = document.getElementById('workspace-scroll-container');
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) {
          const pageAttr = (mostVisible.target as HTMLElement).dataset.page;
          if (pageAttr) setVisiblePage(parseInt(pageAttr, 10));
        }
      },
      { root: container, threshold: [0, 0.5, 1.0] },
    );

    container.querySelectorAll('[data-page]').forEach((el) => observer.observe(el));

    const mutationObs = new MutationObserver(() => {
      observer.disconnect();
      container.querySelectorAll('[data-page]').forEach((el) => observer.observe(el));
    });
    mutationObs.observe(container, { childList: true, subtree: true });

    return () => { observer.disconnect(); mutationObs.disconnect(); };
  }, []);

  const commitPageInput = React.useCallback(
    (raw: string) => {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= pageCount) setPage(parsed);
      setIsEditingPageInput(false);
    },
    [pageCount, setPage],
  );

  const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const closest = zoomSteps.reduce((prev, curr) =>
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev,
    );
    setZoom(closest);
  };

  return (
    <div className="flex items-center h-7 min-h-7 shrink-0 px-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-[11px] text-slate-500 dark:text-slate-400 z-10">
      {/* Left items */}
      <div className="flex items-center">
        <span className="px-1.5">PDF Hub</span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-1 shrink-0" title="Unsaved changes" />
        )}
      </div>

      <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
      <div className="px-1.5">{pageCount > 0 ? `${pageCount} pages` : '—'}</div>

      <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

      {/* Page input */}
      <div className="flex items-center gap-1 px-1.5">
        <span>Page</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pageDisplayValue}
          aria-label={`Page ${pageDisplayValue} of ${pageCount}`}
          className="w-8 text-center text-[11px] font-mono px-1 py-px bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          onFocus={() => { setLocalPageValue(String(viewState.currentPage)); setIsEditingPageInput(true); }}
          onChange={(e) => setLocalPageValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitPageInput(e.currentTarget.value); e.currentTarget.blur(); }
            if (e.key === 'Escape') { setIsEditingPageInput(false); e.currentTarget.blur(); }
          }}
          onBlur={(e) => commitPageInput(e.currentTarget.value)}
          disabled={pageCount === 0}
        />
        <span>/ <span className="text-slate-600 dark:text-slate-300">{pageCount > 0 ? pageCount : '—'}</span></span>
      </div>

      <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

      {/* Active mode indicator */}
      <div className="px-1.5 text-slate-600 dark:text-slate-300">{MODE_LABELS[activeMode] ?? activeMode}</div>

      <div className="flex-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1.5 px-1.5">
        <span className="w-10 text-right text-slate-600 dark:text-slate-300">{viewState.zoom}%</span>
        <input
          type="range"
          min="25"
          max="400"
          step="1"
          value={viewState.zoom}
          onChange={handleZoomChange}
          className="w-[72px] h-0.5 rounded-full bg-slate-300 dark:bg-slate-700 appearance-none cursor-pointer accent-blue-500"
        />
      </div>
    </div>
  );
};
