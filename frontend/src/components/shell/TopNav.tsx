import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import { Moon, Search, Settings, Sun, TerminalSquare, Wand2, X } from 'lucide-react';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useSearchStore } from '@/core/search/store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useLoggerStore } from '@/core/logger/store';
import { SearchIndexer } from '@/core/search/indexer';
import { isDebugRouteEnabled } from '@/core/debug/availability';
import { error as logError } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';

export const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { documentKey, fileName, isDirty } = useSessionStore();
  const { setSidebarTab, setLeftPanelWidth, leftPanelWidth, setMacroBuilderOpen } = useEditorStore();
  const addToast = useToastStore((state) => state.addToast);
  const debugEnabled = isDebugRouteEnabled(window.location.hostname, import.meta.env.DEV);

  const {
    query,
    setQuery,
    setHits,
    setError,
    clearSearch,
    nextHit,
    setIsSearching,
  } = useSearchStore();

  const [localQuery, setLocalQuery] = useState(query);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  React.useEffect(() => {
    if (fileName) {
      document.title = `${isDirty ? '* ' : ''}${fileName} - PDF Hub`;
      return;
    }
    document.title = 'PDF Hub';
  }, [fileName, isDirty]);

  if (query !== previousQuery) {
    setPreviousQuery(query);
    setLocalQuery(query);
  }

  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (!documentKey) return;
      if (!searchQuery.trim()) { clearSearch(); return; }
      setIsSearching(true);
      try {
        const cache = SearchIndexer.getCache(documentKey);
        if (!cache) { setHits([]); return; }
        const results = SearchIndexer.search(cache, searchQuery, {
          caseSensitive: false, wholeWord: false, useRegex: false,
        });
        setHits(results.map((item, index) => ({
          id: `hit-${index}`,
          pageNumber: item.pageNumber,
          snippet: item.text,
          rects: [item.rect],
        })));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        logError('pdf-renderer', 'Search failed from top navigation', { error: message });
        addToast({ type: 'error', title: 'Search Failed', message });
      } finally {
        setIsSearching(false);
      }
    },
    [addToast, clearSearch, documentKey, setError, setHits, setIsSearching],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalQuery(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!value.trim()) { setQuery(''); clearSearch(); return; }
    setSidebarTab('search');
    if (leftPanelWidth < 1) setLeftPanelWidth(20);
    debounceRef.current = window.setTimeout(() => {
      setQuery(value);
      void executeSearch(value);
    }, 300);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (leftPanelWidth < 1) setLeftPanelWidth(20);
    setSidebarTab('search');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!localQuery.trim()) return;
    if (localQuery === query) { nextHit(); return; }
    setQuery(localQuery);
    void executeSearch(localQuery);
  };

  const handleClear = () => { setLocalQuery(''); setQuery(''); clearSearch(); };

  const handleOpenDebug = () => {
    if (!debugEnabled) {
      addToast({ type: 'info', title: 'Debug Console', message: 'Debug console is available only on local development hosts.' });
      return;
    }
    navigate('/debug');
  };

  const displayName = fileName
    ? fileName.length > 38 ? `${fileName.slice(0, 37)}…` : fileName
    : null;

  return (
    <>
      <div className="flex items-center h-12 px-3 gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        {/* Logo */}
        <a
          href="#"
          className="flex items-center gap-2 mr-1.5 shrink-0 no-underline"
          onClick={(e) => e.preventDefault()}
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
              <path d="M3 2h7l3 3v9H3V2z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
              <path d="M10 2v3h3" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M5 7h6M5 9.5h4" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100 tracking-tight hidden sm:block">
            PDF<span className="text-blue-600">Hub</span>
          </span>
        </a>

        {/* File chip */}
        {displayName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md cursor-default max-w-[230px] shrink-0">
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
            <span
              className="text-[12.5px] font-[450] text-slate-800 dark:text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap"
              title={fileName ?? ''}
            >
              {displayName}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Search / command pill */}
        <div className="relative hidden lg:block">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={localQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search or run a command…"
            className="h-8 w-52 pl-8 pr-8 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          {localQuery ? (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5 pointer-events-none">
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 px-1 py-px bg-slate-200 dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600">⌘</span>
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 px-1 py-px bg-slate-200 dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-600">K</span>
            </div>
          )}
        </div>

        {/* Save status badge */}
        {fileName && (
          <div
            className={[
              'flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full transition-all',
              isDirty
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
                : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
            ].join(' ')}
          >
            <span className={['w-1.5 h-1.5 rounded-full', isDirty ? 'bg-amber-500' : 'bg-emerald-500'].join(' ')} />
            {isDirty ? 'Unsaved' : 'Saved'}
          </div>
        )}

        <Tooltip content={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}>
          <Button data-testid="theme-toggle" variant="ghost" size="icon" onClick={toggleDarkMode}>
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </Tooltip>
        <Tooltip content="Open macro builder">
          <Button variant="ghost" size="icon" onClick={() => setMacroBuilderOpen(true)}>
            <Wand2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>
        <Tooltip content="Open debug console">
          <Button variant="ghost" size="icon" onClick={handleOpenDebug} disabled={!debugEnabled}>
            <TerminalSquare className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>
        <Tooltip content="Open settings">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-semibold cursor-pointer shrink-0 select-none">
          JD
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleDarkMode}
      />
    </>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, onToggleTheme }) => {
  const fileName = useSessionStore((state) => state.fileName);
  const pageCount = useSessionStore((state) => state.pageCount);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);
  const zoom = useSessionStore((state) => state.viewState.zoom);
  const setLeftPanelWidth = useEditorStore((state) => state.setLeftPanelWidth);
  const setRightPanelWidth = useEditorStore((state) => state.setRightPanelWidth);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const clearLogs = useLoggerStore((state) => state.clear);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Theme</div>
          <div className="text-xs text-slate-500 mb-2">Current: {isDarkMode ? 'Dark' : 'Light'}</div>
          <Button variant="secondary" size="sm" onClick={onToggleTheme}>
            Switch to {isDarkMode ? 'Light' : 'Dark'}
          </Button>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Layout</div>
          <div className="text-xs text-slate-500 mb-2">Reset side panels and inspector tabs to default.</div>
          <Button variant="secondary" size="sm" onClick={() => { setLeftPanelWidth(20); setRightPanelWidth(18); setSidebarTab('thumbnails'); setInspectorTab('properties'); }}>
            Reset Layout
          </Button>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Debug Logs</div>
          <div className="text-xs text-slate-500 mb-2">Clear in-memory debug logs for this session.</div>
          <Button variant="secondary" size="sm" onClick={clearLogs}>Clear Logs</Button>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500">
          <div>Document: {fileName ?? 'None'}</div>
          <div>Pages: {pageCount}</div>
          <div>Current page: {currentPage}</div>
          <div>Zoom: {zoom}%</div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};
