/**
 * WriterFindReplacePanel
 *
 * A self-contained Find & Replace panel that works against the currently
 * active Lexical editor registered in `useActiveEditorStore`.
 *
 * Implementation strategy:
 *  - All text searching + replacing is done via Lexical's `editor.update()` API,
 *    walking the root and collecting TextNode references.
 *  - `TextNode.spliceText(offset, length, replacement)` handles in-place
 *    replacement while preserving inline styles (bold, italic, etc.).
 *  - Replace All uses original matches in reverse order, never rescanning replacement text.
 */

import React from 'react';
import {
  $getRoot,
  $getNodeByKey,
  $isTextNode,
  $isElementNode,
  type LexicalNode,
} from 'lexical';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
import { currentRichEditorBinding } from '@/core/writer-v2/editor/richEditorImageInsertion';
import { findWriterLiteralMatches } from '@/core/writer-v2/editor/writerFindReplace';
import { ChevronDown, ChevronUp, X, Replace, ReplaceAll } from 'lucide-react';

interface Match {
  nodeKey: string;
  startOffset: number;
  length: number;
}

function collectMatches(
  root: LexicalNode,
  rawSearch: string,
  caseSensitive: boolean,
): Match[] {
  if (!rawSearch) return [];

  const results: Match[] = [];
  function walk(node: LexicalNode): void {
    if ($isTextNode(node)) {
      for (const match of findWriterLiteralMatches(node.getTextContent(), rawSearch, caseSensitive)) {
        results.push({ nodeKey: node.getKey(), ...match });
      }
    } else if ($isElementNode(node)) {
      for (const child of node.getChildren()) walk(child);
    }
  }

  walk(root);
  return results;
}

export const WriterFindReplacePanel: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const activeEditor = useActiveEditorStore((s) => s.activeEditor);
  // The panel is a gesture belonging to its opening editor, not the next editor.
  const [owner] = React.useState(() => activeEditor ? { editor: activeEditor, binding: currentRichEditorBinding(activeEditor) } : null);
  const isCurrent = () => !!owner?.binding && useActiveEditorStore.getState().activeEditor === owner.editor
    && currentRichEditorBinding(owner.editor) === owner.binding;
  React.useEffect(() => {
    if (activeEditor !== owner?.editor || !isCurrent()) onClose();
  }, [activeEditor, owner, onClose]);

  const [search, setSearch] = React.useState('');
  const [replacement, setReplacement] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [lastReplaceAll, setLastReplaceAll] = React.useState<number | null>(null);

  // Recount against committed editor state, including edits outside this panel.
  React.useEffect(() => {
    if (!activeEditor || !search || !isCurrent()) {
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }
    const recount = () => {
      if (!isCurrent()) return;
      activeEditor.getEditorState().read(() => {
        const count = collectMatches($getRoot(), search, caseSensitive).length;
        setMatchCount(count);
        setCurrentIndex(prev => count ? Math.min(prev, count - 1) : 0);
      });
    };
    recount();
    return activeEditor.registerUpdateListener(recount);
  }, [activeEditor, owner, search, caseSensitive]);

  const navigateTo = (delta: 1 | -1) => {
    if (!activeEditor || !isCurrent() || !search || !matchCount) return;
    const index = (currentIndex + delta + matchCount) % matchCount;
    activeEditor.update(() => {
      if (!isCurrent()) return;
      const matches = collectMatches($getRoot(), search, caseSensitive);
      const match = matches[index % matches.length];
      if (!match) return;
      const node = $getNodeByKey(match.nodeKey);
      if ($isTextNode(node)) node.select(match.startOffset, match.startOffset + match.length);
    });
    setCurrentIndex(index);
  };

  const replaceCurrent = () => {
    if (!activeEditor || !isCurrent() || !search || !matchCount) return;
    activeEditor.update(() => {
      if (!isCurrent()) return;
      const matches = collectMatches($getRoot(), search, caseSensitive);
      const match = matches[Math.min(currentIndex, matches.length - 1)];
      if (!match) return;
      const node = $getNodeByKey(match.nodeKey);
      if ($isTextNode(node)) node.spliceText(match.startOffset, match.length, replacement, true);
    }, { discrete: true });
  };

  const replaceAll = () => {
    if (!activeEditor || !isCurrent() || !search) return;
    let replaced = 0;
    activeEditor.update(() => {
      if (!isCurrent()) return;
      // Each original match is visited once. Right-to-left preserves UTF-16 offsets.
      const matches = collectMatches($getRoot(), search, caseSensitive).reverse();
      for (const match of matches) {
        const node = $getNodeByKey(match.nodeKey);
        if (!$isTextNode(node)) continue;
        node.spliceText(match.startOffset, match.length, replacement, false);
        replaced += 1;
      }
    }, { discrete: true });
    setLastReplaceAll(replaced);
    setCurrentIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); navigateTo(1); }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); navigateTo(-1); }
  };

  return (
    <div
      role="dialog"
      aria-label="Find and Replace"
      data-writer-ribbon="true"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        zIndex: 60,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        minWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      className="dark:bg-slate-900 dark:border-slate-700"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }} className="dark:text-slate-200">
          Find & Replace
        </span>
        <button
          aria-label="Close Find & Replace"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          aria-label="Find text"
          placeholder="Find…"
          value={search}
          autoFocus
          onChange={(e) => { setSearch(e.target.value); setLastReplaceAll(null); }}
          onKeyDown={handleKeyDown}
          style={inputStyle}
          className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
        />
        <button
          aria-label="Case sensitive"
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
          style={{
            ...smallBtnStyle,
            background: caseSensitive ? '#dbeafe' : 'transparent',
            color: caseSensitive ? '#1d4ed8' : '#64748b',
            border: caseSensitive ? '1px solid #2563eb' : '1px solid #cbd5e1',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.04em',
            minWidth: 26,
          }}
        >
          Aa
        </button>
        <button aria-label="Previous match" title="Previous (Shift+Enter)" onClick={() => navigateTo(-1)} disabled={matchCount === 0} style={smallBtnStyle}>
          <ChevronUp size={13} />
        </button>
        <button aria-label="Next match" title="Next (Enter)" onClick={() => navigateTo(1)} disabled={matchCount === 0} style={smallBtnStyle}>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Match count */}
      <div style={{ fontSize: 11, color: '#64748b', minHeight: 16 }}>
        {search && matchCount === 0 && 'No matches'}
        {search && matchCount > 0 && `${currentIndex + 1} of ${matchCount} match${matchCount > 1 ? 'es' : ''}`}
        {lastReplaceAll !== null && ` — replaced ${lastReplaceAll}`}
      </div>

      {/* Replace row */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          aria-label="Replace with"
          placeholder="Replace with…"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
          style={inputStyle}
          className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
        />
        <button
          aria-label="Replace current match"
          title="Replace"
          onClick={replaceCurrent}
          disabled={!search || matchCount === 0}
          style={{ ...smallBtnStyle, gap: 4, padding: '0 8px', minWidth: 'auto' }}
        >
          <Replace size={12} />
        </button>
        <button
          aria-label="Replace all matches"
          title="Replace all"
          onClick={replaceAll}
          disabled={!search || matchCount === 0}
          style={{ ...smallBtnStyle, gap: 4, padding: '0 8px', minWidth: 'auto', background: '#2563eb', color: '#fff', border: '1px solid #2563eb' }}
        >
          <ReplaceAll size={12} />
        </button>
      </div>

      <div style={{ fontSize: 10, color: '#94a3b8' }}>
        Enter / Shift+Enter to navigate · Esc to close
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  border: '1px solid #cbd5e1',
  borderRadius: 5,
  padding: '0 8px',
  fontSize: 12,
  outline: 'none',
  background: '#fff',
};

const smallBtnStyle: React.CSSProperties = {
  height: 28,
  minWidth: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #cbd5e1',
  borderRadius: 5,
  background: 'transparent',
  color: '#374151',
  cursor: 'pointer',
  fontSize: 12,
};
