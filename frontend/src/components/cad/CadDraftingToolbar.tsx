import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import { Grid, Magnet, Box } from 'lucide-react';
import type { CadGridMode } from '@/core/cad-grid/types';

export interface CadDraftingToolbarProps {
  className?: string;
}

export const CadDraftingToolbar: React.FC<CadDraftingToolbarProps> = ({ className = '' }) => {
  const {
    cadGridMode,
    cadIsoplane,
    cadGridSnap,
    cadGridSpacing,
    setCadGridMode,
    toggleCadGridSnap,
    setCadGridSpacing,
    cycleCadIsoplane,
  } = useEditorStore(
    useShallow((state) => ({
      cadGridMode: state.cadGridMode,
      cadIsoplane: state.cadIsoplane,
      cadGridSnap: state.cadGridSnap,
      cadGridSpacing: state.cadGridSpacing,
      setCadGridMode: state.setCadGridMode,
      toggleCadGridSnap: state.toggleCadGridSnap,
      setCadGridSpacing: state.setCadGridSpacing,
      cycleCadIsoplane: state.cycleCadIsoplane,
    })),
  );

  // Keyboard shortcut listener: F5 cycles isoplane, Ctrl+G toggles grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'F5' && cadGridMode === 'isometric') {
        e.preventDefault();
        cycleCadIsoplane();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cadGridMode, cycleCadIsoplane]);

  const handleCycleGridMode = () => {
    const modes: CadGridMode[] = ['none', 'ortho', 'isometric'];
    const nextIdx = (modes.indexOf(cadGridMode) + 1) % modes.length;
    setCadGridMode(modes[nextIdx]);
  };

  return (
    <div
      data-testid="cad-drafting-toolbar"
      className={`flex items-center gap-1.5 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg text-xs select-none ${className}`}
    >
      {/* Grid Mode Button */}
      <button
        type="button"
        data-testid="cad-grid-mode-btn"
        onClick={handleCycleGridMode}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors ${
          cadGridMode !== 'none'
            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={`Cycle Grid Mode (Current: ${cadGridMode.toUpperCase()})`}
      >
        <Grid className="w-3.5 h-3.5" />
        <span className="capitalize">{cadGridMode === 'none' ? 'Grid Off' : cadGridMode}</span>
      </button>

      {/* Grid Snap Toggle */}
      <button
        type="button"
        data-testid="cad-grid-snap-btn"
        onClick={toggleCadGridSnap}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
          cadGridSnap
            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={cadGridSnap ? 'Grid Snapping Active (Click to disable)' : 'Enable Magnetic Grid Snapping'}
      >
        <Magnet className="w-3.5 h-3.5" />
        <span>Snap</span>
      </button>

      {/* Isoplane Selector (Visible when Isometric grid is active) */}
      {cadGridMode === 'isometric' && (
        <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-800">
          <button
            type="button"
            data-testid="cad-isoplane-btn"
            onClick={cycleCadIsoplane}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-medium"
            title="Cycle Isoplane (F5) - Top, Right, Left, All"
          >
            <Box className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="capitalize">Iso {cadIsoplane}</span>
            <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-normal">(F5)</span>
          </button>
        </div>
      )}

      {/* Grid Spacing Preset */}
      {cadGridMode !== 'none' && (
        <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500">
          <button
            type="button"
            onClick={() => setCadGridSpacing(cadGridSpacing === 10 ? 20 : cadGridSpacing === 20 ? 40 : 10)}
            className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle Grid Spacing (10pt, 20pt, 40pt)"
          >
            {cadGridSpacing}pt
          </button>
        </div>
      )}
    </div>
  );
};
