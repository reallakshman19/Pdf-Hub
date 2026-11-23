import React, { useMemo } from 'react';
import type { ScaleCalibration } from '../../core/annotations/calibration';
import { Ruler } from 'lucide-react';

export interface DrawingScaleBarProps {
  calibration: ScaleCalibration;
  scale?: number; // viewport zoom scale (default 1)
  onOpenCalibration?: () => void;
  className?: string;
}

export const DrawingScaleBar: React.FC<DrawingScaleBarProps> = ({
  calibration,
  scale = 1,
  onOpenCalibration,
  className = '',
}) => {
  const { scaleRatio, unit } = calibration;

  // Compute a standard division length on paper (approx 100 points or ~35mm on screen)
  const divisionInfo = useMemo(() => {
    // 72 pt = 25.4 mm on sheet.
    // Length in sheet mm for 72 points:
    const sheetMm = 25.4;
    const realMm = sheetMm * scaleRatio;

    // Pick nice round numbers
    let val1 = realMm / 2;
    let val2 = realMm;

    let displayUnit = unit;
    if (unit === 'mm' && val2 >= 1000) {
      val1 = val1 / 1000;
      val2 = val2 / 1000;
      displayUnit = 'm';
    }

    return {
      barWidthPt: 72 * scale,
      val1: Math.round(val1 * 10) / 10,
      val2: Math.round(val2 * 10) / 10,
      unit: displayUnit,
      label: `1:${scaleRatio.toLocaleString()} (${unit})`,
    };
  }, [scaleRatio, unit, scale]);

  const halfWidth = divisionInfo.barWidthPt / 2;
  const fullWidth = divisionInfo.barWidthPt;

  return (
    <div
      data-testid="drawing-scale-bar"
      className={`inline-flex flex-col items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-2 rounded-md border border-slate-200 dark:border-slate-800 shadow-xs select-none ${className}`}
    >
      {/* Clickable Header Badge */}
      <button
        type="button"
        onClick={onOpenCalibration}
        className="flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-1"
        title="Click to calibrate drawing scale"
      >
        <Ruler className="w-3 h-3 text-blue-600" />
        <span>Scale: {divisionInfo.label}</span>
      </button>

      {/* SVG Graphic Scale Bar */}
      <svg
        width={fullWidth + 24}
        height={22}
        className="overflow-visible"
        data-testid="scale-bar-svg"
      >
        <g transform="translate(12, 12)">
          {/* Segment 1: Solid block */}
          <rect
            x={0}
            y={-3}
            width={halfWidth}
            height={6}
            fill="#0f172a"
            stroke="#0f172a"
            strokeWidth={1}
          />
          {/* Segment 2: Open/white block */}
          <rect
            x={halfWidth}
            y={-3}
            width={halfWidth}
            height={6}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1}
          />

          {/* Division Ticks */}
          <line x1={0} y1={-7} x2={0} y2={7} stroke="#0f172a" strokeWidth={1.5} />
          <line x1={halfWidth} y1={-7} x2={halfWidth} y2={7} stroke="#0f172a" strokeWidth={1.5} />
          <line x1={fullWidth} y1={-7} x2={fullWidth} y2={7} stroke="#0f172a" strokeWidth={1.5} />

          {/* Value Labels */}
          <text x={0} y={-8} textAnchor="middle" fontSize={8} fontWeight="600" fill="#475569">
            0
          </text>
          <text x={halfWidth} y={-8} textAnchor="middle" fontSize={8} fontWeight="600" fill="#475569">
            {divisionInfo.val1}
          </text>
          <text x={fullWidth} y={-8} textAnchor="middle" fontSize={8} fontWeight="600" fill="#475569">
            {divisionInfo.val2} {divisionInfo.unit}
          </text>
        </g>
      </svg>
    </div>
  );
};
