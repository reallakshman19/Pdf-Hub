import React from 'react';
import type { Point2D } from '../../core/annotations/types';
import type { SnapResult } from '../../core/annotations/cadSnapping';

export interface SnapIndicatorOverlayProps {
  snapResult: SnapResult | null;
  originPoint?: Point2D | null;
  isAngleConstrained?: boolean;
  constraintAngleLabel?: string;
  scale: number;
}

export const SnapIndicatorOverlay: React.FC<SnapIndicatorOverlayProps> = ({
  snapResult,
  originPoint,
  isAngleConstrained = false,
  constraintAngleLabel,
  scale,
}) => {
  if (!snapResult || (!snapResult.snapped && !isAngleConstrained)) {
    return null;
  }

  const snapX = snapResult.point.x * scale;
  const snapY = snapResult.point.y * scale;
  const kind = snapResult.kind ?? 'vertex';

  const label = isAngleConstrained
    ? (constraintAngleLabel ?? '45° Ortho')
    : kind === 'endpoint'
      ? 'Endpoint'
      : kind === 'midpoint'
        ? 'Midpoint'
        : kind === 'center'
          ? 'Center'
          : 'Vertex';

  return (
    <div
      data-testid="snap-indicator-overlay"
      className="absolute inset-0 pointer-events-none z-50"
      style={{ overflow: 'visible' }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
      >
        {/* Orthogonal Guideline when angle constraint is active */}
        {isAngleConstrained && originPoint && (
          <line
            x1={originPoint.x * scale}
            y1={originPoint.y * scale}
            x2={snapX}
            y2={snapY}
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4,4"
            data-testid="snap-guide-line"
          />
        )}

        {/* Snap Glyph */}
        <g transform={`translate(${snapX}, ${snapY})`}>
          {kind === 'midpoint' ? (
            // Triangle for midpoint
            <polygon
              points="0,-6 6,5 -6,5"
              fill="rgba(34, 197, 94, 0.3)"
              stroke="#16a34a"
              strokeWidth={1.5}
              data-testid="snap-glyph-midpoint"
            />
          ) : kind === 'center' ? (
            // Circle for center
            <circle
              r={5}
              fill="rgba(34, 197, 94, 0.3)"
              stroke="#16a34a"
              strokeWidth={1.5}
              data-testid="snap-glyph-center"
            />
          ) : (
            // Square for endpoint / vertex / corner
            <rect
              x={-5}
              y={-5}
              width={10}
              height={10}
              fill="rgba(34, 197, 94, 0.3)"
              stroke="#16a34a"
              strokeWidth={1.5}
              data-testid="snap-glyph-square"
            />
          )}

          {/* Tooltip Tag */}
          <g transform="translate(10, -10)">
            <rect
              x={0}
              y={-9}
              width={label.length * 6.5 + 8}
              height={16}
              rx={3}
              fill="#1e293b"
              stroke="#22c55e"
              strokeWidth={1}
              opacity={0.95}
            />
            <text
              x={4}
              y={-1}
              dominantBaseline="central"
              fontSize={9}
              fontWeight="600"
              fill="#22c55e"
            >
              {label}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
};
