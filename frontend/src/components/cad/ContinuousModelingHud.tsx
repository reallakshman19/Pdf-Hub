import React, { useEffect } from 'react';
import {
  Grid,
  Magnet,
  Maximize2,
  Box,
  Compass,
  Crosshair,
} from 'lucide-react';
import { useCadModelingStore } from '../../core/cad-modeling/store';

export interface ContinuousModelingHudProps {
  className?: string;
  enableShortcuts?: boolean;
}

export const ContinuousModelingHud: React.FC<ContinuousModelingHudProps> = ({
  className = '',
  enableShortcuts = true,
}) => {
  const {
    drafting,
    telemetry,
    dock3d,
    toggleGridVisible,
    toggleGridSnap,
    toggleOrtho,
    togglePolarTracking,
    toggleObjectSnap,
    toggle3DDock,
  } = useCadModelingStore();

  // Keyboard shortcut listener for standard CAD function keys
  useEffect(() => {
    if (!enableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'F7':
          e.preventDefault();
          toggleGridVisible();
          break;
        case 'F8':
          e.preventDefault();
          toggleOrtho();
          break;
        case 'F9':
          e.preventDefault();
          toggleGridSnap();
          break;
        case 'F10':
          e.preventDefault();
          togglePolarTracking();
          break;
        case 'F3':
          e.preventDefault();
          toggleObjectSnap();
          break;
        case '3':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggle3DDock();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableShortcuts,
    toggleGridVisible,
    toggleOrtho,
    toggleGridSnap,
    togglePolarTracking,
    toggleObjectSnap,
    toggle3DDock,
  ]);

  const xStr = telemetry.worldCoords ? telemetry.worldCoords.x.toFixed(2) : '0.00';
  const yStr = telemetry.worldCoords ? telemetry.worldCoords.y.toFixed(2) : '0.00';
  const lenStr = telemetry.activeLength !== null ? telemetry.activeLength.toFixed(2) : null;
  const angStr = telemetry.activeAngleDeg !== null ? telemetry.activeAngleDeg.toFixed(1) : null;

  return (
    <aside
      aria-label="CAD Continuous Modeling HUD"
      data-testid="cad-continuous-modeling-hud"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-slate-900/90 text-slate-200 border border-slate-700/80 rounded-full shadow-2xl backdrop-blur-md text-xs select-none font-mono transition-all ${className}`}
    >
      {/* 1. Coordinate Readout */}
      <div
        data-testid="hud-coordinates"
        className="flex items-center gap-2 pr-3 border-r border-slate-700/60"
      >
        <Crosshair className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-slate-400">X:</span>
        <span className="text-slate-100 font-semibold w-14 text-right">{xStr}</span>
        <span className="text-slate-400 ml-1">Y:</span>
        <span className="text-slate-100 font-semibold w-14 text-right">{yStr}</span>
      </div>

      {/* 2. Polar Readout (if anchor is active) */}
      {lenStr !== null && angStr !== null && (
        <div
          data-testid="hud-polar-readout"
          className="flex items-center gap-2 pr-3 border-r border-slate-700/60 text-amber-400"
        >
          <Compass className="w-3.5 h-3.5 text-amber-400" />
          <span>L:</span>
          <span className="font-semibold text-amber-200">{lenStr}</span>
          <span className="ml-1">∠</span>
          <span className="font-semibold text-amber-200">{angStr}°</span>
        </div>
      )}

      {/* 3. Snap Target Indicator Badge */}
      {telemetry.activeSnapType && (
        <div
          data-testid="hud-snap-badge"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-sans font-medium uppercase tracking-wider animate-pulse"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>{telemetry.activeSnapType}</span>
        </div>
      )}

      {/* 4. Drafting Constraint Toggles */}
      <div className="flex items-center gap-1 pl-1">
        {/* Grid Toggle (F7) */}
        <button
          type="button"
          data-testid="hud-toggle-grid"
          title="Grid Display (F7)"
          onClick={toggleGridVisible}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            drafting.gridVisible
              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="font-sans font-medium">GRID</span>
        </button>

        {/* Grid Snap Toggle (F9) */}
        <button
          type="button"
          data-testid="hud-toggle-grid-snap"
          title="Grid Snap (F9)"
          onClick={toggleGridSnap}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            drafting.gridSnapEnabled
              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
          <span className="font-sans font-medium">SNAP</span>
        </button>

        {/* Ortho Toggle (F8) */}
        <button
          type="button"
          data-testid="hud-toggle-ortho"
          title="Ortho Mode (F8)"
          onClick={toggleOrtho}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            drafting.orthoEnabled
              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="font-sans font-medium">ORTHO</span>
        </button>

        {/* Polar Tracking Toggle (F10) */}
        <button
          type="button"
          data-testid="hud-toggle-polar"
          title={`Polar Tracking ${drafting.polarAngleStepDeg}° (F10)`}
          onClick={togglePolarTracking}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            drafting.polarTrackingEnabled
              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span className="font-sans font-medium">POLAR</span>
        </button>

        {/* Object Snap Toggle (F3) */}
        <button
          type="button"
          data-testid="hud-toggle-osnap"
          title="Object Snap (F3)"
          onClick={toggleObjectSnap}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            drafting.objectSnapEnabled
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span className="font-sans font-medium">O-SNAP</span>
        </button>
      </div>

      {/* 5. 3D Preview Dock Trigger */}
      <div className="pl-2 border-l border-slate-700/60">
        <button
          type="button"
          data-testid="hud-toggle-3d-dock"
          title="Toggle 3D Viewport Dock (Ctrl+3)"
          onClick={toggle3DDock}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-sans font-semibold transition-all shadow-sm ${
            dock3d.isOpen
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/20'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D DOCK</span>
        </button>
      </div>
    </aside>
  );
};
