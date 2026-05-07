import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

function squigglyPath(width: number, height: number, amplitude = 2): string {
  const bumps = Math.max(3, Math.round(width / 8));
  const step = width / bumps;
  let d = `M 0 ${height} `;
  for (let i = 0; i < bumps; i++) {
    const cx = i * step + step / 2;
    const cy = height + (i % 2 === 0 ? amplitude : -amplitude);
    const ex = (i + 1) * step;
    d += `Q ${cx} ${cy} ${ex} ${height} `;
  }
  return d;
}

export const SquigglyNode: React.FC<AnnotationNodeProps<'squiggly'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#ef4444';
  const width = annotation.data?.borderWidth ?? 1.5;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y,
        width: rect.width, height: rect.height,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <path
          d={squigglyPath(rect.width, rect.height, 2 * scale)}
          fill="none"
          stroke={color}
          strokeWidth={width}
        />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
