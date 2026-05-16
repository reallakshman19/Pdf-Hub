import React, { useState, useEffect } from 'react';
import { useSessionStore } from '@/core/session/store';

export const StatusBar: React.FC = () => {
  const { isDirty, viewState, pageCount, setZoom, setPage } = useSessionStore();

  const [visiblePage, setVisiblePage] = useState(1);
  const [localPageValue, setLocalPageValue] = useState<string>('');
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);

  // Derive display value
  const pageDisplayValue = isEditingPageInput
    ? localPageValue
    : String(visiblePage ?? viewState.currentPage);

  useEffect(() => {
    const container = document.getElementById('workspace-scroll-container');
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (mostVisible) {
          const pageAttr = (mostVisible.target as HTMLElement).dataset.page;
          if (pageAttr) {
            const num = parseInt(pageAttr, 10);
            setVisiblePage(num);
          }
        }
      },
      {
        root: container,
        threshold: [0, 0.5, 1.0],
      },
    );

    container.querySelectorAll('[data-page]').forEach(el => observer.observe(el));

    const mutationObs = new MutationObserver(() => {
      observer.disconnect();
      container.querySelectorAll('[data-page]').forEach(el => observer.observe(el));
    });
    mutationObs.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObs.disconnect();
    };
  }, []);



  const commitPageInput = React.useCallback((raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= pageCount) {
      setPage(parsed);
    }
    // If invalid or out of range: silently revert — no error state needed
    setIsEditingPageInput(false);
  }, [pageCount, setPage]);

  const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const closest = zoomSteps.reduce((prev, curr) =>
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev,
    );
    setZoom(closest);
  };

  return (
    <div className="flex items-center justify-between px-4 h-8 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 z-10 shrink-0">
      <div className="flex items-center space-x-4">
        <span>DocCraft</span>
        {isDirty && (
          <div
            title="Unsaved changes"
            aria-label="Unsaved changes"
            style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   'var(--color-text-warning)',
              marginLeft:   5,
              flexShrink:   0,
              alignSelf:    'center',
            }}
          />
        )}
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1">
          <span className="font-mono text-slate-500">Page</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pageDisplayValue}
            aria-label={`Page ${pageDisplayValue} of ${pageCount}`}
            style={{
              width:        36,
              textAlign:    'center',
              fontSize:     12,
              padding:      '1px 4px',
              border:       '0.5px solid var(--color-border-secondary)',
              borderRadius: 4,
              background:   'var(--color-background-secondary)',
              color:        'var(--color-text-primary)',
              outline:      'none',
            }}
            onFocus={() => {
              setLocalPageValue(String(viewState.currentPage));
              setIsEditingPageInput(true);
            }}
            onChange={(e) => {
              // Local display only — DO NOT call setPage
              setLocalPageValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitPageInput(e.currentTarget.value);
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                setIsEditingPageInput(false);
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              commitPageInput(e.currentTarget.value);
            }}
            disabled={pageCount === 0}
          />
          <span className="font-mono text-slate-500">of {pageCount > 0 ? pageCount : '—'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-mono w-12 text-right">{viewState.zoom}%</span>
          <input
            type="range"
            min="25"
            max="400"
            step="1"
            value={viewState.zoom}
            onChange={handleZoomChange}
            className="w-24 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
          />
        </div>
      </div>
    </div>
  );
};
