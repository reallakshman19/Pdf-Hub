import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import type { ComponentType } from '../../core/pipeline-geometry/types';

export const PipingValveNode: React.FC<AnnotationNodeProps<any>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const componentType: ComponentType =
    (annotation.data?.componentType as ComponentType) || 'VALVE';
  const label =
    (annotation.data?.componentRefNo as string) ||
    (annotation.data?.label as string) ||
    (annotation.data?.text as string) ||
    'V-101';
  const weightKg =
    typeof annotation.data?.weight === 'number'
      ? annotation.data.weight
      : 85;

  const width = Math.max(rect.width * scale, 40);
  const height = Math.max(rect.height * scale, 30);

  return (
    <div
      data-testid="piping-valve-node"
      data-annotation-type="piping-valve"
      data-component-type={componentType}
      onClick={(e) => {
        e.stopPropagation();
        (onSelect as any)?.(e);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (onSelect as any)?.(e);
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
        viewBox="0 0 50 36"
        className="overflow-visible"
        data-testid={`valve-svg-${componentType.toLowerCase()}`}
      >
        {/* Flanged Connections (Left & Right bars) */}
        <line x1="4" y1="8" x2="4" y2="24" stroke="#0f172a" strokeWidth="2.5" />
        <line x1="46" y1="8" x2="46" y2="24" stroke="#0f172a" strokeWidth="2.5" />

        {/* Valve Body: Opposing Triangles */}
        <polygon
          points="4,8 25,16 4,24"
          fill="#3b82f6"
          stroke="#1d4ed8"
          strokeWidth="1.5"
        />
        <polygon
          points="46,8 25,16 46,24"
          fill="#3b82f6"
          stroke="#1d4ed8"
          strokeWidth="1.5"
        />

        {/* Stem & Handwheel */}
        <line x1="25" y1="16" x2="25" y2="4" stroke="#0f172a" strokeWidth="1.5" />
        <line x1="18" y1="4" x2="32" y2="4" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />

        {/* Check valve flap indicator if CHECK */}
        {componentType === 'CHECK' && (
          <path d="M 25,10 L 32,16 L 25,22" fill="none" stroke="#ef4444" strokeWidth="1.5" />
        )}
      </svg>

      {/* Valve Tag & Weight Badge */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap bg-slate-900/90 text-white text-[9px] font-mono px-1 py-0.2 rounded shadow-xs pointer-events-none border border-slate-700">
        <span className="font-bold text-amber-300">{label}</span>
        <span className="text-slate-400">|</span>
        <span className="text-emerald-300">{weightKg}kg</span>
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
