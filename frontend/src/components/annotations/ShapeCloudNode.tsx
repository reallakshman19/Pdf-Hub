import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

function cloudPath(width: number, height: number, amplitude = 6): string {
  const bumps = Math.max(3, Math.round(width / 18));
  const step = width / bumps;
  let d = `M 0 ${height / 2} `;

  for (let i = 0; i < bumps; i++) {
    const cx = i * step + step / 2;
    const cy = -amplitude;
    const ex = (i + 1) * step;
    d += `Q ${cx} ${cy} ${ex} 0 `;
  }

  const rightBumps = Math.max(2, Math.round(height / 18));
  const rStep = height / rightBumps;
  for (let i = 0; i < rightBumps; i++) {
    const cx = width + amplitude;
    const cy = i * rStep + rStep / 2;
    const ey = (i + 1) * rStep;
    d += `Q ${cx} ${cy} ${width} ${ey} `;
  }

  for (let i = bumps - 1; i >= 0; i--) {
    const cx = i * step + step / 2;
    const cy = height + amplitude;
    const ex = i * step;
    d += `Q ${cx} ${cy} ${ex} ${height} `;
  }

  for (let i = rightBumps - 1; i >= 0; i--) {
    const cx = -amplitude;
    const cy = i * rStep + rStep / 2;
    const ey = i * rStep;
    d += `Q ${cx} ${cy} 0 ${ey} `;
  }

  d += 'Z';
  return d;
}

export const ShapeCloudNode: React.FC<AnnotationNodeProps<'shape-cloud'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  const bg = annotation.data?.backgroundColor ?? 'transparent';
  const border = annotation.data?.borderColor ?? '#3b82f6';
  const width = annotation.data?.borderWidth ?? 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <path d={cloudPath(rect.width, rect.height, 6 * scale)} fill={bg} stroke={border} strokeWidth={width} />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
