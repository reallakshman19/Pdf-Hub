import React from 'react';
import { Check, X, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import type { OcrWord } from '@/core/ocr/types';
import { generateOcrSuggestions } from '@/core/ocr/corrections/useOcrProofreader';

export interface InlineOcrCorrectionPopoverProps {
  word: OcrWord;
  initialText: string;
  anchorRect: DOMRect | { left: number; top: number; width: number; height: number };
  onCommit: (newText: string) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onClose: () => void;
}

export const InlineOcrCorrectionPopover: React.FC<InlineOcrCorrectionPopoverProps> = ({
  word,
  initialText,
  anchorRect,
  onCommit,
  onNavigateNext,
  onNavigatePrev,
  onClose,
}) => {
  const [value, setValue] = React.useState(initialText);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const suggestions = React.useMemo(() => {
    return generateOcrSuggestions(word.text);
  }, [word.text]);

  React.useEffect(() => {
    setValue(initialText);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [initialText, word.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onCommit(value);
      if (e.shiftKey) {
        onNavigatePrev?.();
      } else {
        onNavigateNext?.();
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue(suggestion);
    onCommit(suggestion);
  };

  // Compute popover screen position (anchor above word, or below if too close to top edge)
  const popoverWidth = 260;
  const popoverHeight = 135;
  const isNearTop = anchorRect.top < popoverHeight + 20;

  const top = isNearTop
    ? anchorRect.top + anchorRect.height + 6
    : anchorRect.top - popoverHeight - 6;

  const left = Math.max(
    10,
    Math.min(
      window.innerWidth - popoverWidth - 10,
      anchorRect.left + anchorRect.width / 2 - popoverWidth / 2,
    ),
  );

  const confidencePct = Math.round((word.confidence ?? 1.0) * 100);
  const isLowConf = (word.confidence ?? 1.0) < 0.75;

  return (
    <div
      data-testid="inline-ocr-correction-popover"
      className="fixed z-50 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${popoverWidth}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
          Original: &quot;{word.text}&quot;
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            isLowConf
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          }`}
        >
          {confidencePct}% conf
        </span>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="ocr-correction-input"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Correct text..."
        />
        <button
          type="button"
          onClick={() => onCommit(value)}
          data-testid="ocr-correction-apply-btn"
          title="Apply (Enter)"
          className="rounded bg-indigo-600 p-1 text-white hover:bg-indigo-700 focus:outline-none"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          data-testid="ocr-correction-close-btn"
          title="Dismiss (Esc)"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-2" data-testid="ocr-suggestions-list">
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-slate-400">
            <Sparkles className="h-2.5 w-2.5 text-amber-500" />
          </span>
          {suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => handleSuggestionClick(sug)}
              data-testid="ocr-suggestion-chip"
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-2 text-[10px] text-slate-400 dark:border-slate-800">
        <span>Tab: Next | Esc: Close</span>
        <div className="flex items-center gap-1">
          {onNavigatePrev && (
            <button
              type="button"
              onClick={onNavigatePrev}
              data-testid="ocr-prev-btn"
              title="Previous low-confidence word (Shift+Tab)"
              className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
          {onNavigateNext && (
            <button
              type="button"
              onClick={onNavigateNext}
              data-testid="ocr-next-btn"
              title="Next low-confidence word (Tab)"
              className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
