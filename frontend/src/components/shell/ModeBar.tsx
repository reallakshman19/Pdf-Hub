import React from 'react';
import {
  FolderOpen,
  MousePointer2,
  Highlighter,
  PenTool,
  Type,
  Layers,
  Sparkles,
  Undo2,
  Redo2,
  Minus,
  Plus,
} from 'lucide-react';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { ActiveMode } from '@/core/editor/types';

const MODES: Array<{ id: ActiveMode; icon: React.ComponentType<{ className?: string }>; label: string; ai?: boolean }> = [
  { id: 'file',     icon: FolderOpen,    label: 'File' },
  { id: 'view',     icon: MousePointer2, label: 'View' },
  { id: 'annotate', icon: Highlighter,   label: 'Annotate' },
  { id: 'draw',     icon: PenTool,       label: 'Draw' },
  { id: 'write',    icon: Type,          label: 'Write' },
  { id: 'organize', icon: Layers,        label: 'Organize' },
  { id: 'generate', icon: Sparkles,      label: 'Generate', ai: true },
];

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export const ModeBar: React.FC = () => {
  const { activeMode, setActiveMode } = useEditorStore();
  const { history, future, undo, redo } = useAnnotationStore();
  const { viewState, setZoom } = useSessionStore();

  const handleZoomOut = () => {
    const next = [...ZOOM_STEPS].reverse().find((s) => s < viewState.zoom) ?? 25;
    setZoom(next);
  };

  const handleZoomIn = () => {
    const next = ZOOM_STEPS.find((s) => s > viewState.zoom) ?? 400;
    setZoom(next);
  };

  return (
    <div className="flex items-center h-10 min-h-10 shrink-0 px-3 gap-1 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80">
      {/* Mode tab group */}
      <div className="flex items-center gap-px bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-[3px]">
        {MODES.map(({ id, icon: Icon, label, ai }) => {
          const isActive = activeMode === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveMode(id)}
              className={[
                'flex items-center gap-1.5 px-[11px] py-1 rounded-[7px] text-xs font-medium whitespace-nowrap transition-all select-none',
                isActive
                  ? ai
                    ? 'bg-slate-200 dark:bg-slate-800 text-purple-500 shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : ai
                    ? 'text-slate-500 dark:text-slate-400 hover:text-purple-500 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60',
              ].join(' ')}
            >
              <Icon className="w-[13px] h-[13px] shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center">
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Undo2 className="w-[13px] h-[13px]" />
          Undo
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Redo2 className="w-[13px] h-[13px]" />
          Redo
        </button>
      </div>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

      {/* Zoom controls */}
      <div className="flex items-center">
        <button
          onClick={handleZoomOut}
          disabled={viewState.zoom <= 25}
          className="flex items-center justify-center h-7 w-7 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Minus className="w-[11px] h-[11px]" />
        </button>
        <button className="flex items-center justify-center h-7 min-w-[48px] px-2 rounded font-mono text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-default">
          {viewState.zoom}%
        </button>
        <button
          onClick={handleZoomIn}
          disabled={viewState.zoom >= 400}
          className="flex items-center justify-center h-7 w-7 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Plus className="w-[11px] h-[11px]" />
        </button>
      </div>
    </div>
  );
};
