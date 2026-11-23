import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import type { RestraintType } from '../../core/pipeline-geometry/types';

export const PipingSupportNode: React.FC<AnnotationNodeProps> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const restraintType: RestraintType =
    (annotation.data?.restraintType as RestraintType) || 'ANC';
  const label =
    (annotation.data?.nodeName as string) ||
    (annotation.data?.label as string) ||
    (annotation.data?.text as string) ||
    `${restraintType}`;

  const width = Math.max(rect.width * scale, 36);
  const height = Math.max(rect.height * scale, 36);

  return (
    <div
      data-testid="piping-support-node"
      data-annotation-type="piping-support"
      data-restraint-type={restraintType}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      style={{
        position: 'absolute',
        left: rect.x * scale,
        top: rect.y * scale,
        width,
        height,
        cursor: 'pointer',
        pointerEvents: 'all',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 40 40"
        className="overflow-visible"
        data-testid={`support-svg-${restraintType.toLowerCase()}`}
      >
        <defs>
          <pattern id="hatch-45" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#0f172a" strokeWidth="0.8" />
          </pattern>
        </defs>

        {/* 1. ANCHOR GLYPH */}
        {restraintType === 'ANC' && (
          <g transform="translate(4, 4)">
            {/* Pipe Center Attachment Dot */}
            <circle cx="16" cy="10" r="4" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />
            {/* Rigid Pedestal Block */}
            <rect x="6" y="14" width="20" height="8" fill="#1e293b" rx="1" />
            {/* Grounding Baseplate */}
            <line x1="2" y1="22" x2="30" y2="22" stroke="#0f172a" strokeWidth="2" />
            {/* Grounding Hatch */}
            <rect x="2" y="22" width="28" height="6" fill="url(#hatch-45)" />
          </g>
        )}

        {/* 2. GUIDE GLYPH */}
        {restraintType === 'GUIDE' && (
          <g transform="translate(4, 4)">
            {/* Pipe Centerline */}
            <line x1="4" y1="16" x2="28" y2="16" stroke="#2563eb" strokeWidth="2" strokeDasharray="3,2" />
            {/* Transverse Jaws */}
            <path d="M 6,6 L 6,10 L 12,10" fill="none" stroke="#0f172a" strokeWidth="2" />
            <path d="M 26,6 L 26,10 L 20,10" fill="none" stroke="#0f172a" strokeWidth="2" />
            <path d="M 6,26 L 6,22 L 12,22" fill="none" stroke="#0f172a" strokeWidth="2" />
            <path d="M 26,26 L 26,22 L 20,22" fill="none" stroke="#0f172a" strokeWidth="2" />
            {/* Guide Arrows */}
            <path d="M 16,4 L 16,12 M 13,8 L 16,4 L 19,8" stroke="#16a34a" strokeWidth="1.5" fill="none" />
            <path d="M 16,28 L 16,20 M 13,24 L 16,28 L 19,24" stroke="#16a34a" strokeWidth="1.5" fill="none" />
          </g>
        )}

        {/* 3. LINE STOP GLYPH */}
        {restraintType === 'LINE-STOP' && (
          <g transform="translate(4, 4)">
            {/* Pipe Centerline */}
            <line x1="2" y1="16" x2="30" y2="16" stroke="#2563eb" strokeWidth="2" />
            {/* Thrust Collars */}
            <rect x="10" y="8" width="4" height="16" fill="#0f172a" />
            <rect x="18" y="8" width="4" height="16" fill="#0f172a" />
            {/* Axial Limit Stops */}
            <line x1="8" y1="6" x2="8" y2="26" stroke="#ef4444" strokeWidth="2" />
            <line x1="24" y1="6" x2="24" y2="26" stroke="#ef4444" strokeWidth="2" />
          </g>
        )}

        {/* 4. +Y RESTING SUPPORT */}
        {(restraintType === '+Y' || restraintType === '-Y') && (
          <g transform="translate(4, 4)">
            {/* Pipe Cross-Section */}
            <circle cx="16" cy="10" r="6" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.5" />
            {/* Support Triangle Shoe */}
            <polygon points="16,16 8,24 24,24" fill="#0284c7" stroke="#0369a1" strokeWidth="1.5" />
            {/* Steel Beam Top Flange */}
            <line x1="2" y1="25" x2="30" y2="25" stroke="#0f172a" strokeWidth="2.5" />
          </g>
        )}

        {/* 5. SPRING HANGER */}
        {restraintType === 'SPR' && (
          <g transform="translate(4, 4)">
            {/* Top Rod */}
            <line x1="16" y1="2" x2="16" y2="8" stroke="#0f172a" strokeWidth="1.5" />
            {/* Barrel Box */}
            <rect x="10" y="8" width="12" height="16" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" rx="2" />
            {/* Spring Coil */}
            <path d="M 12,12 Q 16,10 20,13 Q 12,16 20,19 Q 12,21 16,23" fill="none" stroke="#e11d48" strokeWidth="1.5" />
            {/* Bottom Turnbuckle Eye */}
            <circle cx="16" cy="27" r="2.5" fill="none" stroke="#0f172a" strokeWidth="1.5" />
          </g>
        )}

        {/* Fallback Symbol */}
        {restraintType === 'ROD' && (
          <g transform="translate(4, 4)">
            <circle cx="16" cy="16" r="8" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" />
            <text x="16" y="20" fontSize="10" textAnchor="middle" fontWeight="bold" fill="#0369a1">R</text>
          </g>
        )}
      </svg>

      {/* Label Badge */}
      <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-white text-[9px] font-mono px-1 py-0.2 rounded shadow-xs pointer-events-none border border-slate-700">
        {label}
      </div>

      {isSelected && onTransformStart && (
        <SelectionHandles
          rect={{ x: 0, y: 0, width, height }}
          onTransformStart={onTransformStart}
        />
      )}
    </div>
  );
};
