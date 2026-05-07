import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import { Moon, Search, Settings, Sun, TerminalSquare, X } from 'lucide-react';
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
  const { setSidebarTab, setLeftPanelWidth, leftPanelWidth } = useEditorStore();
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
      document.title = `${isDirty ? '* ' : ''}${fileName} - DocCraft`;
      return;
    }
    document.title = 'DocCraft';
  }, [fileName, isDirty]);

  if (query !== previousQuery) {
    setPreviousQuery(query);
    setLocalQuery(query);
  }

  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (!documentKey) return;
      if (!searchQuery.trim()) {
        clearSearch();
        return;
      }

      setIsSearching(true);
      try {
        const cache = SearchIndexer.getCache(documentKey);
        if (!cache) {
          setHits([]);
          return;
        }
        const results = SearchIndexer.search(cache, searchQuery, {
          caseSensitive: false,
          wholeWord: false,
          useRegex: false,
        });
        setHits(
          results.map((item, index) => ({
            id: `hit-${index}`,
            pageNumber: item.pageNumber,
            snippet: item.text,
            rects: [item.rect],
          })),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        logError('pdf-renderer', 'Search failed from top navigation', { error: message });
        addToast({
          type: 'error',
          title: 'Search Failed',
          message,
        });
      } finally {
        setIsSearching(false);
      }
    },
    [addToast, clearSearch, documentKey, setError, setHits, setIsSearching],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalQuery(value);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      setQuery('');
      clearSearch();
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      setQuery(value);
      void executeSearch(value);
    }, 300);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (leftPanelWidth < 1) {
      setLeftPanelWidth(20);
    }
    setSidebarTab('search');

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (!localQuery.trim()) {
      return;
    }

    if (localQuery === query) {
      nextHit();
      return;
    }

    setQuery(localQuery);
    void executeSearch(localQuery);
  };

  const handleClear = () => {
    setLocalQuery('');
    setQuery('');
    clearSearch();
  };

  const handleOpenDebug = () => {
    if (!debugEnabled) {
      addToast({
        type: 'info',
        title: 'Debug Console',
        message: 'Debug console is available only on local development hosts.',
      });
      return;
    }
    navigate('/debug');
  };

  return (
    <>
      <div className="flex items-center justify-between h-12 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-600 rounded-sm" />
            <span className="font-bold text-lg hidden sm:inline-block">
              {fileName ? (isDirty ? `* ${fileName}` : fileName) : 'DocCraft'}
            </span>
          </div>

          {fileName && (
            <div className="hidden lg:flex items-center ml-4 px-3 py-1 bg-slate-100 dark:bg-slate-800/50 rounded text-sm text-slate-700 dark:text-slate-300 font-medium">
              <span
                title={fileName}
                style={{
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  fontWeight: 450,
                  color: 'var(--color-text-primary)',
                  cursor: 'default',
                }}
              >
                {isDirty && <span className="text-blue-500 mr-1 font-bold">*</span>}
                {fileName.length > 40 ? `${fileName.slice(0, 39)}...` : fileName}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative hidden lg:block">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={localQuery}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Search document..."
              className="h-9 w-48 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {localQuery && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Tooltip content={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Button data-testid="theme-toggle" variant="ghost" size="icon" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </Tooltip>
          <Tooltip content="Open debug console">
            <Button
              variant="ghost"
              size="icon"
              title="Debug Console"
              onClick={handleOpenDebug}
              disabled={!debugEnabled}
            >
              <TerminalSquare className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </Button>
          </Tooltip>
          <Tooltip content="Open settings">
            <Button
              variant="ghost"
              size="icon"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </Button>
          </Tooltip>
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

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleTheme,
}) => {
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLeftPanelWidth(20);
              setRightPanelWidth(18);
              setSidebarTab('thumbnails');
              setInspectorTab('properties');
            }}
          >
            Reset Layout
          </Button>
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Debug Logs</div>
          <div className="text-xs text-slate-500 mb-2">Clear in-memory debug logs for this session.</div>
          <Button variant="secondary" size="sm" onClick={clearLogs}>
            Clear Logs
          </Button>
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500">
          <div>Document: {fileName ?? 'None'}</div>
          <div>Pages: {pageCount}</div>
          <div>Current page: {currentPage}</div>
          <div>Zoom: {zoom}%</div>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
