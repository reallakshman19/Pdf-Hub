import React, { useId } from 'react';
import type { CadGridMode, IsoplaneMode } from '@/core/cad-grid/types';

export interface CadGridOverlayProps {
  gridMode: CadGridMode;
  isoplane?: IsoplaneMode;
  spacing?: number;
  scale: number;
  width: number;
  height: number;
}

export const CadGridOverlay: React.FC<CadGridOverlayProps> = ({
  gridMode,
  isoplane = 'all',
  spacing = 20,
  scale,
  width,
  height,
}) => {
  const uniqueId = useId().replace(/:/g, '');

  if (gridMode === 'none' || width <= 0 || height <= 0 || spacing <= 0) {
    return null;
  }

  const scaledSpacing = spacing * scale;
  if (scaledSpacing < 4) {
    // If zoomed out so far that grid lines would form a solid blur, avoid rendering
    return null;
  }

  const orthoPatternId = `cad-ortho-grid-${uniqueId}`;
  const isoPatternId = `cad-iso-grid-${uniqueId}`;

  // Isometric cell dimensions:
  // Step dx = s * sqrt(3) / 2
  // Cell repeat width = 2 * dx = s * sqrt(3)
  // Cell repeat height = s
  const isoCellW = scaledSpacing * Math.sqrt(3);
  const isoCellH = scaledSpacing;

  const showVerticals = isoplane !== 'top';
  const showSlopesLeft = isoplane !== 'right';
  const showSlopesRight = isoplane !== 'left';

  return (
    <div
      data-testid="cad-grid-overlay"
      className="absolute inset-0 pointer-events-none z-10 select-none overflow-hidden"
      style={{ width, height }}
    >
      <svg
        className="w-full h-full pointer-events-none"
        width={width}
        height={height}
      >
        <defs>
          {/* Orthogonal Grid Pattern */}
          {gridMode === 'ortho' && (
            <pattern
              id={orthoPatternId}
              width={scaledSpacing}
              height={scaledSpacing}
              patternUnits="userSpaceOnUse"
            >
              {/* Grid Lines */}
              <path
                d={`M ${scaledSpacing} 0 L 0 0 0 ${scaledSpacing}`}
                fill="none"
                stroke="currentColor"
                className="text-slate-400/25 dark:text-slate-600/30"
                strokeWidth={0.8}
              />
              {/* Intersection Node Dot */}
              <circle
                cx={0}
                cy={0}
                r={1.2}
                fill="currentColor"
                className="text-blue-500/40 dark:text-blue-400/40"
              />
            </pattern>
          )}

          {/* Isometric Diamond Grid Pattern */}
          {gridMode === 'isometric' && (
            <pattern
              id={isoPatternId}
              width={isoCellW}
              height={isoCellH}
              patternUnits="userSpaceOnUse"
            >
              {/* Vertical isometric lines */}
              {showVerticals && (
                <>
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={isoCellH}
                    stroke="currentColor"
                    className="text-cyan-500/25 dark:text-cyan-400/25"
                    strokeWidth={0.8}
                  />
                  <line
                    x1={isoCellW / 2}
                    y1={0}
                    x2={isoCellW / 2}
                    y2={isoCellH}
                    stroke="currentColor"
                    className="text-cyan-500/25 dark:text-cyan-400/25"
                    strokeWidth={0.8}
                  />
                </>
              )}

              {/* +30° diagonal lines (bottom-left to top-right) */}
              {showSlopesRight && (
                <>
                  <line
                    x1={0}
                    y1={isoCellH}
                    x2={isoCellW}
                    y2={0}
                    stroke="currentColor"
                    className="text-cyan-500/25 dark:text-cyan-400/25"
                    strokeWidth={0.8}
                  />
                  <line
                    x1={0}
                    y1={0}
                    x2={isoCellW / 2}
                    y2={isoCellH / 2}
                    stroke="currentColor"
                    className="text-cyan-500/20 dark:text-cyan-400/20"
                    strokeWidth={0.8}
                  />
                </>
              )}

              {/* -30° diagonal lines (top-left to bottom-right) */}
              {showSlopesLeft && (
                <>
                  <line
                    x1={0}
                    y1={0}
                    x2={isoCellW}
                    y2={isoCellH}
                    stroke="currentColor"
                    className="text-cyan-500/25 dark:text-cyan-400/25"
                    strokeWidth={0.8}
                  />
                  <line
                    x1={0}
                    y1={isoCellH}
                    x2={isoCellW / 2}
                    y2={isoCellH / 2}
                    stroke="currentColor"
                    className="text-cyan-500/20 dark:text-cyan-400/20"
                    strokeWidth={0.8}
                  />
                </>
              )}

              {/* Isometric Node Dots */}
              <circle
                cx={0}
                cy={0}
                r={1.2}
                fill="currentColor"
                className="text-cyan-500/50 dark:text-cyan-300/50"
              />
              <circle
                cx={isoCellW / 2}
                cy={isoCellH / 2}
                r={1.2}
                fill="currentColor"
                className="text-cyan-500/50 dark:text-cyan-300/50"
              />
            </pattern>
          )}
        </defs>

        {/* Full surface grid rect */}
        <rect
          width="100%"
          height="100%"
          fill={gridMode === 'ortho' ? `url(#${orthoPatternId})` : `url(#${isoPatternId})`}
        />
      </svg>
    </div>
  );
};
