import React from 'react';
import {
  Highlighter,
  Underline as UnderlineIcon,
  Strikethrough,
  MessageSquare,
  MessageCircle,
  Copy,
  Check,
  X,
} from 'lucide-react';
import type { Rect } from '@/core/annotations/types';

export interface TextSelectionActionBubbleProps {
  pageWidth: number;
  pageHeight: number;
  scale: number;
  unionRect: Rect;
  selectedText: string;
  onHighlight: () => void;
  onUnderline: () => void;
  onStrikeout: () => void;
  onSquiggly: () => void;
  onStickyNote: () => void;
  onCallout: () => void;
  onDismiss: () => void;
  onCopy?: (text: string) => void;
}

const BUBBLE_ESTIMATED_WIDTH = 370;

export const TextSelectionActionBubble: React.FC<TextSelectionActionBubbleProps> = ({
  pageWidth,
  scale,
  unionRect,
  selectedText,
  onHighlight,
  onUnderline,
  onStrikeout,
  onSquiggly,
  onStickyNote,
  onCallout,
  onDismiss,
  onCopy,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedText);
      }
    } catch {
      // Fallback or permission blocked
    }
    setCopied(true);
    onCopy?.(selectedText);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  const scaledTop = unionRect.y * scale;
  const scaledBottom = (unionRect.y + unionRect.height) * scale;
  const scaledCenterX = (unionRect.x + unionRect.width / 2) * scale;

  // Collision detection: Flip below selection if too close to top edge
  const flipsBelow = scaledTop < 45;
  const top = flipsBelow ? scaledBottom + 8 : Math.max(6, scaledTop - 42);

  // Horizontal clamping within page margins
  const minLeft = 8;
  const maxLeft = Math.max(8, pageWidth * scale - BUBBLE_ESTIMATED_WIDTH - 8);
  const left = Math.max(minLeft, Math.min(maxLeft, scaledCenterX - BUBBLE_ESTIMATED_WIDTH / 2));

  return (
    <div
      role="toolbar"
      aria-label="Text selection actions"
      data-testid="text-selection-action-bubble"
      className="absolute z-30 flex items-center gap-1 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 p-1.5 shadow-2xl backdrop-blur-md border border-slate-700/80 animate-in fade-in duration-150 select-none"
      style={{
        left,
        top,
      }}
      onMouseDown={(e) => {
        // Prevent clicking inside toolbar from clearing the window text selection
        e?.stopPropagation?.();
      }}
    >
      <button
        type="button"
        data-testid="bubble-action-highlight"
        aria-label="Highlight"
        title="Highlight"
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg text-amber-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onHighlight();
        }}
      >
        <Highlighter className="w-3.5 h-3.5 text-amber-400" />
        <span>Highlight</span>
      </button>

      <button
        type="button"
        data-testid="bubble-action-underline"
        aria-label="Underline"
        title="Underline"
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg text-emerald-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onUnderline();
        }}
      >
        <UnderlineIcon className="w-3.5 h-3.5 text-emerald-400" />
        <span>Underline</span>
      </button>

      <button
        type="button"
        data-testid="bubble-action-strikeout"
        aria-label="Strikeout"
        title="Strikeout"
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg text-rose-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onStrikeout();
        }}
      >
        <Strikethrough className="w-3.5 h-3.5 text-rose-400" />
        <span>Strikeout</span>
      </button>

      <button
        type="button"
        data-testid="bubble-action-squiggly"
        aria-label="Squiggly"
        title="Squiggly"
        className="flex items-center gap-1 px-1.5 py-1 text-xs font-medium rounded-lg text-orange-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onSquiggly();
        }}
      >
        <svg className="w-3.5 h-3.5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M2 14c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        </svg>
        <span>Squiggly</span>
      </button>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      <button
        type="button"
        data-testid="bubble-action-note"
        aria-label="Note"
        title="Note"
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg text-sky-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onStickyNote();
        }}
      >
        <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
        <span>Note</span>
      </button>

      <button
        type="button"
        data-testid="bubble-action-callout"
        aria-label="Callout"
        title="Callout"
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg text-indigo-300 hover:bg-slate-800 transition-colors"
        onClick={(e) => {
          e?.stopPropagation?.();
          onCallout();
        }}
      >
        <MessageCircle className="w-3.5 h-3.5 text-indigo-400" />
        <span>Callout</span>
      </button>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      <button
        type="button"
        data-testid="bubble-action-copy"
        aria-label="Copy"
        title="Copy text"
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
          copied ? 'bg-emerald-900/60 text-emerald-300' : 'text-slate-300 hover:bg-slate-800'
        }`}
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </>
        )}
      </button>

      <button
        type="button"
        data-testid="bubble-action-dismiss"
        aria-label="x"
        title="Dismiss (Esc)"
        className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors ml-0.5 text-xs font-bold"
        onClick={(e) => {
          e?.stopPropagation?.();
          onDismiss();
        }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
