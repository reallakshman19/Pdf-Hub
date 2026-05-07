import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';

export const StrikeoutNode: React.FC<AnnotationNodeProps<'strikeout'>> = ({
  annotation, rect, isSelected, onSelect, onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#000000';

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
      <svg width={rect.width} height={rect.height} style={{ overflow: 'visible' }}>
        <line
          x1={0} y1={rect.height / 2}
          x2={rect.width} y2={rect.height / 2}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
