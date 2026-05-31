import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const ShapeEllipseNode: React.FC<AnnotationNodeProps<'shape-ellipse'>> = ({
  annotation, rect, isSelected, onSelect, onTransformStart,
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
        <ellipse
          cx={rect.width / 2} cy={rect.height / 2}
          rx={rect.width / 2} ry={rect.height / 2}
          fill={bg} stroke={border} strokeWidth={width}
        />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
