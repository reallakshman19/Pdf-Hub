import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  Moon, Search, Settings, Sun, Wand2, X, FolderOpen, Save, Highlighter, MessageSquare,
  ChevronRight, Menu, FlaskConical, MousePointer2, PenTool, Type, Layers, Sparkles,
  Undo2, Redo2, Minus, Plus, FilePlus2, HelpCircle, MessageSquareDot, Printer,
  Stamp, Crop, Maximize2, GitMerge,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import type { ActiveMode } from '@/core/editor/types';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useSearchStore } from '@/core/search/store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useIsMobile } from '@/hooks/useIsMobile';
import { isMockEnabled } from '@/core/mock/isMockEnabled';
import { useMockPdf } from '@/hooks/useMockPdf';

export const TopNav: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { fileName, isDirty, viewState, setZoom } = useSessionStore(useShallow((state) => ({
    fileName: state.fileName,
    isDirty: state.isDirty,
    viewState: state.viewState,
    setZoom: state.setZoom,
  })));
  const {
    setSidebarTab,
    setLeftPanelWidth,
    leftPanelWidth,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    activeMode,
    setActiveMode,
    setMacroBuilderOpen,
  } = useEditorStore(useShallow((state) => ({
    setSidebarTab: state.setSidebarTab,
    setLeftPanelWidth: state.setLeftPanelWidth,
    leftPanelWidth: state.leftPanelWidth,
    mobileDrawerOpen: state.mobileDrawerOpen,
    setMobileDrawerOpen: state.setMobileDrawerOpen,
    activeMode: state.activeMode,
    setActiveMode: state.setActiveMode,
    setMacroBuilderOpen: state.setMacroBuilderOpen,
  })));
  const { documentUndoStack, documentRedoStack } = useHistoryStore(useShallow((state) => ({
    documentUndoStack: state.undoStack,
    documentRedoStack: state.redoStack,
  })));
  const { documentMeta, undoWriter, redoWriter, writerUndoStack, writerRedoStack } = useWriterV2Store(useShallow((state) => ({
    documentMeta: state.documentMeta,
    undoWriter: state.undoWriter,
    redoWriter: state.redoWriter,
    writerUndoStack: state.undoStack,
    writerRedoStack: state.redoStack,
  })));
  const useLocalWriterHistory =
    activeMode === 'write' && documentMeta?.mode === 'blankDocument';
  const canUndo = useLocalWriterHistory
    ? writerUndoStack.length > 0
    : documentUndoStack.length > 0;
  const canRedo = useLocalWriterHistory
    ? writerRedoStack.length > 0
    : documentRedoStack.length > 0;
  const handleUndo = () => {
    if (useLocalWriterHistory) {
      undoWriter();
      return;
    }
    void applyUndo();
  };
  const handleRedo = () => {
    if (useLocalWriterHistory) {
      redoWriter();
      return;
    }
    void applyRedo();
  };

  const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

  const handleZoomOut = () => {
    const next = [...ZOOM_STEPS].reverse().find((s) => s < viewState.zoom) ?? 25;
    setZoom(next);
  };

  const handleZoomIn = () => {
    const next = ZOOM_STEPS.find((s) => s > viewState.zoom) ?? 400;
    setZoom(next);
  };

  const MODES: Array<{ id: ActiveMode; icon: React.ComponentType<{ className?: string }>; label: string; ai?: boolean }> = [
    { id: 'file',     icon: FolderOpen,    label: 'File' },
    { id: 'view',     icon: MousePointer2, label: 'View' },
    { id: 'annotate', icon: Highlighter,   label: 'Annotate' },
    { id: 'draw',     icon: PenTool,       label: 'Draw' },
    { id: 'write',    icon: Type,          label: 'Write' },
    { id: 'organize', icon: Layers,        label: 'Organize' },
    { id: 'generate', icon: Sparkles,      label: 'Automate', ai: true },
  ];
  const capabilities = useCapabilities();
  const isMobile = useIsMobile();
  const mockEnabled = isMockEnabled(window.location.hostname);
  const { openMockPdf, loading: mockLoading } = useMockPdf();

  const {
    query,
    hits,
    activeHitId,
    setQuery,
    clearSearch,
    nextHit,
    prevHit,
  } = useSearchStore(useShallow((state) => ({
    query: state.query,
    hits: state.hits,
    activeHitId: state.activeHitId,
    setQuery: state.setQuery,
    clearSearch: state.clearSearch,
    nextHit: state.nextHit,
    prevHit: state.prevHit,
  })));

  const { matchIndex, matchCount } = React.useMemo(() => {
    if (hits.length === 0) return { matchIndex: 0, matchCount: 0 };
    const idx = activeHitId ? hits.findIndex((h) => h.id === activeHitId) : -1;
    return {
      matchIndex: idx >= 0 ? idx + 1 : 0,
      matchCount: hits.length,
    };
  }, [hits, activeHitId]);

  const [queryDraft, setQueryDraft] = useState<{ baseQuery: string; value: string } | null>(null);
  const localQuery = queryDraft && queryDraft.baseQuery === query ? queryDraft.value : query;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSeedFilter, setPaletteSeedFilter] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteSeedFilter('');
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  React.useEffect(() => {
    if (fileName) {
      document.title = `${isDirty ? '* ' : ''}${fileName} - PDF Hub`;
      return;
    }
    document.title = 'PDF Hub';
  }, [fileName, isDirty]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value.startsWith('>')) {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      setQueryDraft(null);
      setPaletteSeedFilter(value.slice(1));
      setPaletteOpen(true);
      return;
    }
    setQueryDraft({ baseQuery: query, value });
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!value.trim()) { setQuery(''); clearSearch(); return; }
    setSidebarTab('search');
    if (leftPanelWidth < 1) setLeftPanelWidth(20);
    debounceRef.current = window.setTimeout(() => {
      setQuery(value);
    }, 300);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (localQuery.startsWith('>')) {
      setPaletteSeedFilter(localQuery.slice(1));
      setPaletteOpen(true);
      return;
    }
    if (leftPanelWidth < 1) setLeftPanelWidth(20);
    setSidebarTab('search');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!localQuery.trim()) return;
    if (localQuery === query) {
      if (event.shiftKey) {
        prevHit();
      } else {
        nextHit();
      }
      return;
    }
    setQuery(localQuery);
  };

  const handleClear = () => { setQueryDraft(null); setQuery(''); clearSearch(); };


  const displayName = fileName
    ? fileName.length > 38 ? `${fileName.slice(0, 37)}…` : fileName
    : null;

  if (isMobile) {
    return (
      <div className="flex items-center justify-between h-12 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        {/* Logo */}
        <a
          href="#"
          className="flex items-center gap-2 shrink-0 no-underline"
          onClick={(e) => e.preventDefault()}
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
              <path d="M3 2h7l3 3v9H3V2z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
              <path d="M10 2v3h3" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M5 7h6M5 9.5h4" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </div>
        </a>

        {/* File chip */}
        {displayName ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md cursor-default max-w-[180px] shrink-0">
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
            <span
              className="text-[12px] font-medium text-slate-800 dark:text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap"
              title={fileName ?? ''}
            >
              {fileName && fileName.length > 20 ? `${fileName.slice(0, 19)}…` : fileName}
            </span>
          </div>
        ) : (
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            PDF<span className="text-blue-600">Hub</span>
          </span>
        )}

        {/* Right side: Hamburger */}
        <div className="flex items-center gap-1">
          {/* Hamburger Menu Button */}
          <Button
            data-testid="mobile-hamburger"
            variant="ghost"
            size="icon"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="min-h-[44px] min-w-[44px]"
          >
            <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between h-[48px] px-3 gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 select-none">
        {/* Left: Logo & Modes Tab Group */}
        <div className="flex items-center gap-4 shrink-0">
          <a
            href="#"
            className="flex items-center gap-2 no-underline"
            onClick={(e) => e.preventDefault()}
          >
            <div className="w-[30px] h-[30px] rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
                <path d="M3 2h7l3 3v9H3V2z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
                <path d="M10 2v3h3" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5 7h6M5 9.5h4" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[14px] font-bold text-slate-900 dark:text-slate-100 tracking-tight hidden lg:block">
              PDF<span className="text-blue-600">Hub</span>
            </span>
          </a>

          {/* Mode tab group */}
          <div className="flex items-center gap-px bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl p-[2px] shrink-0">
            {MODES.map(({ id, icon: Icon, label, ai }) => {
              const isActive = activeMode === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveMode(id);
                    if (id === 'generate') {
                      setSidebarTab('macros');
                      if (leftPanelWidth < 1) setLeftPanelWidth(20);
                    }
                  }}
                  className={[
                    'flex items-center gap-1.5 px-[10px] py-1 rounded-[8px] text-[11.5px] font-[500] whitespace-nowrap transition-all select-none border-none cursor-pointer bg-transparent',
                    isActive
                      ? ai
                        ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                      : ai
                        ? 'text-slate-500 dark:text-slate-400 hover:text-purple-500 hover:bg-slate-100 dark:hover:bg-slate-850/50'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-850/50',
                  ].join(' ')}
                >
                  <Icon className="w-[12.5px] h-[12.5px] shrink-0" />
                  <span className="hidden xl:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Middle: File Info & Search Bar */}
        <div className="flex items-center gap-2 justify-center flex-1 max-w-[420px] min-w-[200px]">
          {/* File chip */}
          {displayName && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 rounded-md cursor-default shrink-0 overflow-hidden max-w-[150px]">
              {isDirty && (
                <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
              )}
              <span
                className="text-[11px] font-[450] text-slate-700 dark:text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap"
                title={fileName ?? ''}
              >
                {displayName}
              </span>
            </div>
          )}

          {/* Search / command pill */}
          <div className="relative flex-1 max-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={localQuery}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Search or run command…"
              className={`h-[28px] w-full pl-8 ${matchCount > 0 ? 'pr-16' : 'pr-11'} text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
            />
            {localQuery ? (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {matchCount > 0 && (
                  <span
                    data-testid="topnav-search-match-badge"
                    className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-700/80 px-1 py-0.5 rounded leading-none tabular-nums"
                  >
                    {matchIndex}/{matchCount}
                  </span>
                )}
                <button
                  onClick={handleClear}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPaletteSeedFilter('');
                  setPaletteOpen(true);
                }}
                title="Open Command Palette (⌘K or type >)"
                aria-label="Open Command Palette"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 cursor-pointer bg-transparent border-none p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors"
              >
                <span className="font-mono text-[9px] text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-1 py-px rounded border border-slate-300/40">⌘</span>
                <span className="font-mono text-[9px] text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-1 py-px rounded border border-slate-300/40">K</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Undo/Redo, Zoom & Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 rounded-lg p-[1px]">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo"
              className="flex items-center justify-center h-6 w-7 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer border-none bg-transparent"
            >
              <Undo2 className="w-[13px] h-[13px]" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo"
              className="flex items-center justify-center h-6 w-7 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer border-none bg-transparent"
            >
              <Redo2 className="w-[13px] h-[13px]" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 rounded-lg p-[1px]">
            <button
              onClick={handleZoomOut}
              disabled={viewState.zoom <= 25}
              aria-label="Zoom out"
              className="flex items-center justify-center h-6 w-6 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer border-none bg-transparent"
            >
              <Minus className="w-[11px] h-[11px]" />
            </button>
            <span className="flex items-center justify-center h-6 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:text-slate-400 select-none">
              {viewState.zoom}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={viewState.zoom >= 400}
              aria-label="Zoom in"
              className="flex items-center justify-center h-6 w-6 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer border-none bg-transparent"
            >
              <Plus className="w-[11px] h-[11px]" />
            </button>
          </div>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

          <Tooltip content={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Button data-testid="theme-toggle" variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </Tooltip>
          <Tooltip content="Open settings">
            <Button variant="ghost" size="icon" aria-label="Settings" className="h-7 w-7 text-slate-500" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleDarkMode}
        mockEnabled={mockEnabled}
        mockLoading={mockLoading}
        onOpenMockPdf={() => {
          setSettingsOpen(false);
          void openMockPdf();
        }}
      />
      {paletteOpen && (
        <CommandPalette
          key={`palette-${paletteSeedFilter}`}
          initialFilter={paletteSeedFilter}
          onClose={() => {
            setPaletteOpen(false);
            setPaletteSeedFilter('');
          }}
          onToggleTheme={toggleDarkMode}
          canOpenAutomate={capabilities.canUseClientMacros}
          onOpenAutomate={() => {
            setPaletteOpen(false);
            setActiveMode('generate');
            setSidebarTab('macros');
            if (leftPanelWidth < 1) setLeftPanelWidth(20);
          }}
          onOpenMacroStudio={() => {
            setPaletteOpen(false);
            setActiveMode('generate');
            setSidebarTab('macros');
            if (leftPanelWidth < 1) setLeftPanelWidth(20);
            setMacroBuilderOpen(true);
          }}
        />
      )}
    </>
  );
};

const ToggleRow: React.FC<{ label: string; on: boolean; onToggle: () => void }> = ({ label, on, onToggle }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    <button
      onClick={onToggle}
      className={[
        'relative w-9 h-5 rounded-full transition-colors shrink-0',
        on ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600',
      ].join(' ')}
    >
      <span className={[
        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
        on ? 'translate-x-4' : 'translate-x-0.5',
      ].join(' ')} />
    </button>
  </div>
);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  mockEnabled: boolean;
  mockLoading: boolean;
  onOpenMockPdf: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onToggleTheme,
  mockEnabled,
  mockLoading,
  onOpenMockPdf,
}) => {
  const fileName = useSessionStore((state) => state.fileName);
  const pageCount = useSessionStore((state) => state.pageCount);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);
  const zoom = useSessionStore((state) => state.viewState.zoom);
  const leftPanelWidth = useEditorStore((state) => state.leftPanelWidth);
  const rightPanelWidth = useEditorStore((state) => state.rightPanelWidth);
  const setLeftPanelWidth = useEditorStore((state) => state.setLeftPanelWidth);
  const setRightPanelWidth = useEditorStore((state) => state.setRightPanelWidth);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);

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
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-2">Visibility</div>
          <ToggleRow
            label="Show sidebar"
            on={leftPanelWidth > 0.1}
            onToggle={() => setLeftPanelWidth(leftPanelWidth > 0.1 ? 0 : 20)}
          />
          <ToggleRow
            label="Show inspector"
            on={rightPanelWidth > 0.1}
            onToggle={() => setRightPanelWidth(rightPanelWidth > 0.1 ? 0 : 18)}
          />
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Layout</div>
          <div className="text-xs text-slate-500 mb-2">Reset side panels and inspector tabs to default.</div>
          <Button variant="secondary" size="sm" onClick={() => { setLeftPanelWidth(20); setRightPanelWidth(18); setSidebarTab('thumbnails'); setInspectorTab('properties'); }}>
            Reset Layout
          </Button>
        </div>
        {mockEnabled && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
            <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">Sample Benchmark Document</div>
            <div className="text-xs text-slate-500 mb-2">Generate and open a multi-page sample PDF locally.</div>
            <Button
              data-testid="mock-pdf-btn"
              variant="secondary"
              size="sm"
              disabled={mockLoading}
              onClick={onOpenMockPdf}
            >
              <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              {mockLoading ? 'Generating…' : 'Open Benchmark PDF'}
            </Button>
          </div>
        )}
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

interface CommandPaletteProps {
  initialFilter: string;
  onClose: () => void;
  onToggleTheme: () => void;
  canOpenAutomate: boolean;
  onOpenAutomate: () => void;
  onOpenMacroStudio: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  initialFilter,
  onClose,
  onToggleTheme,
  canOpenAutomate,
  onOpenAutomate,
  onOpenMacroStudio,
}) => {
  const [filter, setFilter] = useState(initialFilter);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, []);

  type Cmd = { icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; section: string; action: () => void };

  const commands: Cmd[] = [
    { icon: FolderOpen,       label: 'Open PDF…',             hint: '⌘O', section: 'Document', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:open')); } },
    { icon: FilePlus2,        label: 'New Blank Document',    section: 'Document', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:new-blank')); } },
    { icon: Save,             label: 'Save',                  hint: '⌘S', section: 'Document', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:save')); } },
    { icon: Printer,          label: 'Print…',                hint: '⌘P', section: 'Document', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:print')); } },
    { icon: Highlighter,      label: 'Highlight selection',   hint: 'H',  section: 'Annotate & Draw', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'highlight' })); } },
    { icon: MessageSquare,    label: 'Add sticky note',       hint: 'N',  section: 'Annotate & Draw', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'sticky-note' })); } },
    { icon: MessageSquareDot, label: 'Add callout',           section: 'Annotate & Draw', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'callout' })); } },
    { icon: PenTool,          label: 'Draw freehand ink',     section: 'Annotate & Draw', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'ink' })); } },
    { icon: Stamp,            label: 'Bates Numbering…',      section: 'Organize', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:organize-action', { detail: 'bates' })); } },
    { icon: Crop,             label: 'Crop Margins…',         section: 'Organize', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:organize-action', { detail: 'crop' })); } },
    { icon: Maximize2,        label: 'Normalize Page Size…',  section: 'Organize', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:organize-action', { detail: 'normalize' })); } },
    { icon: GitMerge,         label: 'Collate with PDF…',     section: 'Organize', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:organize-action', { detail: 'collate' })); } },
    { icon: Type,             label: 'Open Writer Rich Box',  section: 'Write', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'writer-rich-box' })); } },
    ...(canOpenAutomate
      ? [
          { icon: Sparkles, label: 'Open Automate',     section: 'Automate', action: onOpenAutomate },
          { icon: Wand2,    label: 'Open Macro Studio', hint: '⌘M', section: 'Automate', action: onOpenMacroStudio },
        ]
      : []),
    { icon: Moon,             label: 'Toggle dark mode',      section: 'View', action: () => { onClose(); onToggleTheme(); } },
    { icon: HelpCircle,       label: 'Help & Keyboard Shortcuts', section: 'View', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:help')); } },
  ];

  const normalizedFilter = filter.trim().replace(/^>\s*/, '').toLowerCase();
  const filtered = normalizedFilter
    ? commands.filter((c) => c.label.toLowerCase().includes(normalizedFilter))
    : commands;

  const activeIndex = filtered.length > 0 ? Math.min(selectedIndex, filtered.length - 1) : -1;
  const sections = [...new Set(filtered.map((c) => c.section))];

  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' && filtered.length > 0) {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
      return;
    }
    if (event.key === 'ArrowUp' && filtered.length > 0) {
      event.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      filtered[activeIndex]?.action();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Command Palette"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handlePaletteKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">ESC</kbd>
        </div>

        {/* Commands */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No commands found</div>
          ) : (
            sections.map((section) => (
              <div key={section}>
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{section}</div>
                {filtered.filter((c) => c.section === section).map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  const isHighlighted = idx === activeIndex;
                  return (
                    <button
                      key={cmd.label}
                      type="button"
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left cursor-pointer border-none',
                        isHighlighted
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent',
                      ].join(' ')}
                    >
                      <cmd.icon className="w-4 h-4 opacity-70 shrink-0" />
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.hint && (
                        <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{cmd.hint}</kbd>
                      )}
                      <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
