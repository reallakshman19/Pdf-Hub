import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  Moon, Search, Settings, Sun, Wand2, X, FolderOpen, Save, Highlighter, MessageSquare,
  ChevronRight, Menu, FlaskConical, MousePointer2, PenTool, Type, Layers, Sparkles,
  Undo2, Redo2, Minus, Plus
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
  } = useEditorStore(useShallow((state) => ({
    setSidebarTab: state.setSidebarTab,
    setLeftPanelWidth: state.setLeftPanelWidth,
    leftPanelWidth: state.leftPanelWidth,
    mobileDrawerOpen: state.mobileDrawerOpen,
    setMobileDrawerOpen: state.setMobileDrawerOpen,
    activeMode: state.activeMode,
    setActiveMode: state.setActiveMode,
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
    setQuery,
    clearSearch,
    nextHit,
  } = useSearchStore(useShallow((state) => ({
    query: state.query,
    setQuery: state.setQuery,
    clearSearch: state.clearSearch,
    nextHit: state.nextHit,
  })));

  const [localQuery, setLocalQuery] = useState(query);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
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

  if (query !== previousQuery) {
    setPreviousQuery(query);
    setLocalQuery(query);
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalQuery(value);
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
    if (leftPanelWidth < 1) setLeftPanelWidth(20);
    setSidebarTab('search');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!localQuery.trim()) return;
    if (localQuery === query) { nextHit(); return; }
    setQuery(localQuery);
  };

  const handleClear = () => { setLocalQuery(''); setQuery(''); clearSearch(); };


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

        {/* Right side: Mock + Hamburger */}
        <div className="flex items-center gap-1">
          {mockEnabled && (
            <Tooltip content={mockLoading ? 'Generating…' : 'Open mock benchmark PDF'}>
              <Button
                data-testid="mock-pdf-btn"
                variant="ghost"
                size="icon"
                onClick={() => void openMockPdf()}
                disabled={mockLoading}
                className="min-h-[44px] min-w-[44px] text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                <FlaskConical className="w-5 h-5" />
              </Button>
            </Tooltip>
          )}
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
              className="h-[28px] w-full pl-8 pr-8 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                <span className="font-mono text-[9px] text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-1 py-px rounded border border-slate-300/40">⌘</span>
                <span className="font-mono text-[9px] text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-1 py-px rounded border border-slate-300/40">K</span>
              </div>
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
              className="flex items-center justify-center h-6 w-6 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer border-none bg-transparent"
            >
              <Plus className="w-[11px] h-[11px]" />
            </button>
          </div>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

          {/* Mock PDF button — dev/localhost only */}
          {mockEnabled && (
            <Tooltip content={mockLoading ? 'Generating benchmark PDF…' : 'Open mock benchmark PDF (dev only)'}>
              <Button
                data-testid="mock-pdf-btn"
                variant="ghost"
                size="icon"
                onClick={() => void openMockPdf()}
                disabled={mockLoading}
                className="relative h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                <FlaskConical className={['w-3.5 h-3.5', mockLoading ? 'animate-pulse' : ''].join(' ')} />
                {/* Amber dot indicator */}
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
              </Button>
            </Tooltip>
          )}

          <Tooltip content={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Button data-testid="theme-toggle" variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={toggleDarkMode}>
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </Tooltip>
          <Tooltip content="Open settings">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>

          {/* Avatar */}
          <div className="w-6.5 h-6.5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-semibold cursor-pointer shrink-0 select-none">
            JD
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleDarkMode}
      />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggleTheme={toggleDarkMode}
        canOpenMacroBuilder={capabilities.hasMacroConsole}
        onOpenMacroBuilder={() => {
          setPaletteOpen(false);
          setActiveMode('generate');
          setSidebarTab('macros');
          if (leftPanelWidth < 1) setLeftPanelWidth(20);
        }}
      />
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
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, onToggleTheme }) => {
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
  isOpen: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  canOpenMacroBuilder: boolean;
  onOpenMacroBuilder: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onToggleTheme, canOpenMacroBuilder, onOpenMacroBuilder }) => {
  const [filter, setFilter] = useState('');
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setFilter('');
  }

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen]);

  type Cmd = { icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; section: string; action: () => void };

  const commands: Cmd[] = [
    { icon: FolderOpen,   label: 'Open PDF…',          hint: '⌘O', section: 'Recent', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:open')); } },
    { icon: Save,         label: 'Save',                hint: '⌘S', section: 'Recent', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:save')); } },
    { icon: Highlighter,  label: 'Highlight selection', hint: 'H',   section: 'Annotate', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'highlight' })); } },
    { icon: MessageSquare,label: 'Add sticky note',     hint: 'N',   section: 'Annotate', action: () => { onClose(); document.dispatchEvent(new CustomEvent('pdf-hub:tool', { detail: 'sticky-note' })); } },
    ...(canOpenMacroBuilder
      ? [{ icon: Wand2, label: 'Open Automate', hint: '⌘M', section: 'Automate', action: onOpenMacroBuilder }]
      : []),
    { icon: Moon,         label: 'Toggle dark mode',    section: 'View', action: () => { onClose(); onToggleTheme(); } },
  ];

  const filtered = filter.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()))
    : commands;

  const sections = [...new Set(filtered.map((c) => c.section))];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div
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
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search or run a command…"
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
                {filtered.filter((c) => c.section === section).map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={cmd.action}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <cmd.icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.hint && (
                      <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{cmd.hint}</kbd>
                    )}
                    <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
