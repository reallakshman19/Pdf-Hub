import React, { useMemo } from 'react';
import type { Point2D, ScaleCalibration } from '@/core/annotations/types';
import type { IsoplaneMode } from '@/core/cad-grid/types';
import { computePolarTracking } from '@/core/cad-grid/gridMath';

export interface CursorPolarTrackingHudProps {
  origin: Point2D | null;
  current: Point2D | null;
  scale: number;
  calibration?: ScaleCalibration;
  isAngleConstrained?: boolean;
  isoplane?: IsoplaneMode;
}

export const CursorPolarTrackingHud: React.FC<CursorPolarTrackingHudProps> = ({
  origin,
  current,
  scale,
  calibration,
  isAngleConstrained = false,
  isoplane = 'all',
}) => {
  const polar = useMemo(() => {
    if (!origin || !current) return null;
    return computePolarTracking(origin, current, calibration);
  }, [origin, current, calibration]);

  if (!origin || !current || !polar) {
    return null;
  }

  // Pixel screen position for HUD tooltip (offset from cursor so crosshair is clear)
  const hudX = current.x * scale + 16;
  const hudY = current.y * scale + 16;

  return (
    <div
      data-testid="cursor-polar-tracking-hud"
      className="absolute pointer-events-none z-50 select-none transition-all duration-75"
      style={{
        left: hudX,
        top: hudY,
        transform: 'translate(0, 0)',
      }}
    >
      <div className="flex flex-col gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900/90 text-white shadow-xl backdrop-blur-md border border-slate-700/80 text-[11px] font-mono whitespace-nowrap">
        {/* Main length and angle row */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-400 text-xs">
            {polar.formattedLength}
          </span>
          <span className="text-slate-400 font-medium">
            {polar.formattedAngle}
          </span>

          {/* Active axis badge */}
          {polar.axisLabel && (
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider ${
                polar.isIsometricAxis
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {polar.axisLabel}
            </span>
          )}
        </div>

        {/* Delta X / Y row & Isoplane badge */}
        <div className="flex items-center gap-2 text-[10px] text-slate-400 border-t border-slate-800/80 pt-0.5">
          <span>
            ΔX: <strong className="text-slate-200">{polar.deltaXReal.toLocaleString()}</strong>
          </span>
          <span>
            ΔY: <strong className="text-slate-200">{polar.deltaYReal.toLocaleString()}</strong> {polar.unit}
          </span>

          {isAngleConstrained && (
            <span className="ml-auto text-[9px] text-amber-400 font-semibold">
              SHIFT LOCK
            </span>
          )}

          {isoplane !== 'all' && (
            <span className="ml-auto text-[9px] text-purple-400 uppercase">
              ISO {isoplane}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
