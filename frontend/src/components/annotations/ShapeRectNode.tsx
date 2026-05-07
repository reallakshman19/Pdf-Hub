import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const ShapeRectNode: React.FC<AnnotationNodeProps<'shape-rect'>> = ({
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
        background: bg,
        border: `${width}px solid ${border}`,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
