import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const ShapePolygonNode: React.FC<AnnotationNodeProps<'shape-polygon'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  const bg = annotation.data?.backgroundColor ?? 'transparent';
  const border = annotation.data?.borderColor ?? '#3b82f6';
  const width = annotation.data?.borderWidth ?? 2;
  const points = (annotation.data?.points ?? []).map((p, i) => i % 2 === 0 ? p * scale - rect.x : p * scale - rect.y);

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
        <polygon points={points.reduce((acc, curr, idx) => acc + (idx % 2 === 0 ? `${curr},` : `${curr} `), '').trim()} fill={bg} stroke={border} strokeWidth={width} />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
