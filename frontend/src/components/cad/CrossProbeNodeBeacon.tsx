import React from 'react';
import type { PipelineCoordinateRow } from '@/core/pipeline-geometry/types';
import { Crosshair, X } from 'lucide-react';

export interface CrossProbeNodeBeaconProps {
  node: PipelineCoordinateRow;
  scale: number;
  onDismiss?: () => void;
  className?: string;
}

/**
 * 2D PDF Sheet Crosshair Beacon for 3-Way Cross-Probing.
 *
 * Renders an animated pulsating CAD target ring and coordinate tooltip chip
 * directly over the exact PDF point location of the active piping node.
 *
 * Invariant INV-4: Pure TypeScript styling, zero library dependencies.
 */
export const CrossProbeNodeBeacon: React.FC<CrossProbeNodeBeaconProps> = ({
  node,
  scale,
  onDismiss,
  className = '',
}) => {
  if (!node.pdfPoint) return null;

  const screenX = node.pdfPoint.x * scale;
  const screenY = node.pdfPoint.y * scale;

  return (
    <div
      data-testid="cross-probe-node-beacon"
      className={`absolute pointer-events-none select-none z-30 ${className}`}
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* SVG Pulsating CAD Crosshair Rings */}
      <svg
        width="64"
        height="64"
        viewBox="-32 -32 64 64"
        className="overflow-visible pointer-events-none"
      >
        {/* Outer Pulsing Wave */}
        <circle
          cx="0"
          cy="0"
          r="22"
          className="animate-ping"
          stroke="#06b6d4"
          strokeWidth="2"
          fill="none"
          opacity="0.75"
        />

        {/* Mid Ring */}
        <circle
          cx="0"
          cy="0"
          r="13"
          stroke="#0891b2"
          strokeWidth="2"
          strokeDasharray="4 2"
          fill="#06b6d4"
          fillOpacity="0.2"
        />

        {/* Center Target Dot */}
        <circle cx="0" cy="0" r="3.5" fill="#0891b2" stroke="#ffffff" strokeWidth="1.5" />

        {/* Crosshair Axis Ticks */}
        <line x1="-28" y1="0" x2="-8" y2="0" stroke="#0891b2" strokeWidth="1.5" opacity="0.85" />
        <line x1="8" y1="0" x2="28" y2="0" stroke="#0891b2" strokeWidth="1.5" opacity="0.85" />
        <line x1="0" y1="-28" x2="0" y2="-8" stroke="#0891b2" strokeWidth="1.5" opacity="0.85" />
        <line x1="0" y1="8" x2="0" y2="28" stroke="#0891b2" strokeWidth="1.5" opacity="0.85" />
      </svg>

      {/* Floating Info Chip Badge */}
      <div
        className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full shadow-lg bg-slate-900/95 dark:bg-cyan-950/95 text-white border border-cyan-400/60 backdrop-blur-xs font-mono text-[10.5px] whitespace-nowrap pointer-events-auto"
        data-testid="cross-probe-chip"
      >
        <Crosshair className="w-3 h-3 text-cyan-400 shrink-0" />
        <span className="font-bold text-cyan-300">Node #{node.nodeNumber}</span>
        <span className="text-slate-400">|</span>
        <span className="text-emerald-300 font-medium">Z: {node.z.toLocaleString()} mm</span>
        {node.branchName && (
          <>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300 truncate max-w-[90px]" title={node.branchName}>
              {node.branchName}
            </span>
          </>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            data-testid="beacon-dismiss-btn"
            className="ml-0.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Deselect Node"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
};
