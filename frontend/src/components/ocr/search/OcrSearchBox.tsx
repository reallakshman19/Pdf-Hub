/**
 * In-Memory OCR Search Component with Match Navigation.
 *
 * Provides real-time search across recognized OCR pages, supporting exact,
 * case-sensitive, and fuzzy queries with live jumping and count feedback.
 *
 * Invariant INV-4 & INV-11 compliant: No console.log, accessible controls.
 */

import React, { useState, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown, Sparkles, CaseSensitive } from 'lucide-react';
import type { OcrDocumentResult } from '@/core/ocr/types';
import {
  searchOcrDocument,
  createSearchNavigation,
  nextSearchMatch,
  previousSearchMatch,
  type OcrSearchHighlightMatch,
  type OcrSearchNavigationState,
} from '@/core/ocr/search/ocrSearchIndexEngine';

export interface OcrSearchBoxProps {
  document: OcrDocumentResult;
  onActiveMatchChange?: (match: OcrSearchHighlightMatch | null, allMatches: OcrSearchHighlightMatch[]) => void;
  className?: string;
}

export const OcrSearchBox: React.FC<OcrSearchBoxProps> = ({
  document,
  onActiveMatchChange,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [fuzzy, setFuzzy] = useState(false);
  const [navState, setNavState] = useState<OcrSearchNavigationState>({
    query: '',
    matches: [],
    activeIndex: -1,
  });

  // Evaluate query whenever input or options change
  useEffect(() => {
    if (!query.trim()) {
      setNavState({ query: '', matches: [], activeIndex: -1 });
      onActiveMatchChange?.(null, []);
      return;
    }

    const matches = searchOcrDocument(document, query, {
      caseSensitive,
      fuzzy,
      maxEditDistance: 1,
    });

    const newNav = createSearchNavigation(matches);
    setNavState(newNav);

    const activeMatch = matches.length > 0 ? matches[0] : null;
    onActiveMatchChange?.(activeMatch, matches);
  }, [query, caseSensitive, fuzzy, document]);

  const handleNext = () => {
    const updated = nextSearchMatch(navState);
    setNavState(updated);
    const active = updated.activeIndex >= 0 ? updated.matches[updated.activeIndex] : null;
    onActiveMatchChange?.(active, updated.matches);
  };

  const handlePrevious = () => {
    const updated = previousSearchMatch(navState);
    setNavState(updated);
    const active = updated.activeIndex >= 0 ? updated.matches[updated.activeIndex] : null;
    onActiveMatchChange?.(active, updated.matches);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
      data-testid="ocr-search-box"
    >
      <Search className="h-4 w-4 text-slate-400 ml-1" />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search OCR text (Enter = next)..."
        className="w-48 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
        data-testid="ocr-search-input"
      />

      {query ? (
        <button
          onClick={() => setQuery('')}
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="Clear search"
          data-testid="ocr-search-clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* Match counter badge */}
      {query.trim() ? (
        <span
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          data-testid="ocr-search-match-count"
        >
          {navState.matches.length > 0
            ? `${navState.activeIndex + 1} of ${navState.matches.length}`
            : '0 matches'}
        </span>
      ) : null}

      {/* Navigation Buttons */}
      <div className="flex items-center border-l border-slate-200 pl-1 dark:border-slate-800">
        <button
          onClick={handlePrevious}
          disabled={navState.matches.length === 0}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
          title="Previous match (Shift+Enter)"
          data-testid="ocr-search-prev"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleNext}
          disabled={navState.matches.length === 0}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
          title="Next match (Enter)"
          data-testid="ocr-search-next"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Option Toggles */}
      <div className="flex items-center gap-1 border-l border-slate-200 pl-1 dark:border-slate-800">
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={`rounded p-1 text-xs ${
            caseSensitive
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Match Case"
          data-testid="ocr-search-case-toggle"
        >
          <CaseSensitive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setFuzzy(!fuzzy)}
          className={`rounded p-1 text-xs ${
            fuzzy
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Fuzzy OCR Match"
          data-testid="ocr-search-fuzzy-toggle"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
