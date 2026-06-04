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
 *  - Matches are recollected after every replace so indices stay stable.
 */

import React from 'react';
import {
  $getRoot,
  $isTextNode,
  $isElementNode,
  type LexicalNode,
} from 'lexical';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
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

  const search = caseSensitive ? rawSearch : rawSearch.toLowerCase();
  const results: Match[] = [];

  function walk(node: LexicalNode): void {
    if ($isTextNode(node)) {
      const raw = node.getTextContent();
      const text = caseSensitive ? raw : raw.toLowerCase();
      let offset = 0;
      while (offset < text.length) {
        const idx = text.indexOf(search, offset);
        if (idx === -1) break;
        results.push({ nodeKey: node.getKey(), startOffset: idx, length: search.length });
        offset = idx + search.length;
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

  const [search, setSearch] = React.useState('');
  const [replacement, setReplacement] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [lastReplaceAll, setLastReplaceAll] = React.useState<number | null>(null);

  const searchRef = React.useRef(search);
  const caseRef = React.useRef(caseSensitive);

  React.useEffect(() => {
    searchRef.current = search;
    caseRef.current = caseSensitive;
  }, [search, caseSensitive]);

  // Recount matches whenever search / case changes
  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!activeEditor || !search) {
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }
    activeEditor.getEditorState().read(() => {
      const root = $getRoot();
      const matches = collectMatches(root, search, caseSensitive);
      setMatchCount(matches.length);
      setCurrentIndex((prev) => (matches.length > 0 ? Math.min(prev, matches.length - 1) : 0));
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeEditor, search, caseSensitive]);

  // Navigate
  const navigateTo = (delta: 1 | -1) => {
    if (matchCount === 0) return;
    setCurrentIndex((prev) => (prev + delta + matchCount) % matchCount);
  };

  // Replace current match
  const replaceCurrent = () => {
    if (!activeEditor || !search || matchCount === 0) return;

    activeEditor.update(() => {
      const root = $getRoot();
      const matches = collectMatches(root, searchRef.current, caseRef.current);
      const safeIndex = Math.min(currentIndex, matches.length - 1);
      const match = matches[safeIndex];
      if (!match) return;

      // Resolve node by key
      const nodeMap = root.getLatest().__cachedText === null ? root : root;
      void nodeMap; // unused but keeps TS happy
      const editorState = activeEditor.getEditorState();
      const node = editorState._nodeMap.get(match.nodeKey);
      if (!node || !$isTextNode(node)) return;

      node.spliceText(match.startOffset, match.length, replacement, true);
    });

    // After replace, index stays or wraps if it was the last one
    setCurrentIndex((prev) => (matchCount - 1 > 0 ? Math.min(prev, matchCount - 2) : 0));
  };

  // Replace all
  const replaceAll = () => {
    if (!activeEditor || !search) return;

    let replaced = 0;
    activeEditor.update(() => {
      const root = $getRoot();
      // Collect fresh each iteration because spliceText shifts offsets
      let matches = collectMatches(root, searchRef.current, caseRef.current);

      while (matches.length > 0) {
        const match = matches[0];
        const editorState = activeEditor.getEditorState();
        const node = editorState._nodeMap.get(match.nodeKey);
        if (node && $isTextNode(node)) {
          node.spliceText(match.startOffset, match.length, replacement, false);
          replaced += 1;
        }
        matches = collectMatches(root, searchRef.current, caseRef.current);
      }
    });

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
