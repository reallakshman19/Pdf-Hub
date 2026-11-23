import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';

import {
  useSearchStore,
} from '@/core/search/store';

export interface SearchFloatingHudProps {
  onNext?: () => void;
  onPrev?: () => void;
  onClose?: () => void;
}

export const SearchFloatingHud: React.FC<SearchFloatingHudProps> = ({
  onNext: propOnNext,
  onPrev: propOnPrev,
  onClose: propOnClose,
}) => {
  const {
    query,
    hits,
    activeHitId,
    isOverlayVisible,
    nextHit,
    prevHit,
    clearSearch,
    toggleOverlayVisible,
  } = useSearchStore(
    useShallow((state) => ({
      query: state.query,
      hits: state.hits,
      activeHitId: state.activeHitId,
      isOverlayVisible: state.isOverlayVisible,
      nextHit: state.nextHit,
      prevHit: state.prevHit,
      clearSearch: state.clearSearch,
      toggleOverlayVisible: state.toggleOverlayVisible,
    })),
  );

  const { index, count } = React.useMemo(() => {
    if (hits.length === 0) return { index: 0, count: 0 };
    const currentIndex = activeHitId ? hits.findIndex((h) => h.id === activeHitId) : -1;
    return {
      index: currentIndex >= 0 ? currentIndex + 1 : 0,
      count: hits.length,
    };
  }, [hits, activeHitId]);

  const handleNext = () => {
    if (propOnNext) {
      propOnNext();
    } else {
      nextHit();
    }
  };

  const handlePrev = () => {
    if (propOnPrev) {
      propOnPrev();
    } else {
      prevHit();
    }
  };

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      clearSearch();
    }
  };

  if (!query.trim()) {
    return null;
  }

  const queryDisplay = query.length > 20 ? `${query.slice(0, 19)}…` : query;

  return (
    <div
      data-testid="search-floating-hud"
      role="toolbar"
      aria-label="Search navigation"
      className="absolute top-4 right-4 z-40 flex items-center gap-1.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 select-none animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center gap-1.5 pr-1 border-r border-slate-200 dark:border-slate-800 max-w-[160px]">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span
          data-testid="search-hud-query"
          className="font-medium truncate text-slate-900 dark:text-slate-100"
          title={query}
        >
          {queryDisplay}
        </span>
      </div>

      <div
        data-testid="search-hud-match-count"
        className="px-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0"
      >
        {count === 0 ? 'No matches' : `${index} of ${count}`}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          data-testid="search-hud-prev"
          aria-label="Previous match (Shift+Enter, Shift+F3)"
          title="Previous match (Shift+Enter, Shift+F3)"
          disabled={count === 0}
          onClick={handlePrev}
          className="flex items-center justify-center h-6 w-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="search-hud-next"
          aria-label="Next match (Enter, F3)"
          title="Next match (Enter, F3)"
          disabled={count === 0}
          onClick={handleNext}
          className="flex items-center justify-center h-6 w-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-slate-800">
        <button
          type="button"
          data-testid="search-hud-visibility-toggle"
          aria-label={isOverlayVisible ? 'Hide highlights' : 'Show highlights'}
          title={isOverlayVisible ? 'Hide highlights' : 'Show highlights'}
          onClick={toggleOverlayVisible}
          className={`flex items-center justify-center h-6 w-6 rounded transition-colors ${
            isOverlayVisible
              ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
          }`}
        >
          {isOverlayVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          data-testid="search-hud-close"
          aria-label="Close search (Escape)"
          title="Close search (Escape)"
          onClick={handleClose}
          className="flex items-center justify-center h-6 w-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default SearchFloatingHud;
