import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';

/**
 * Renders a 2px line at the bottom edge of the annotation rect.
 * The div is the event target (invisible); the visible element is the SVG line.
 */
export const UnderlineNode: React.FC<AnnotationNodeProps<'underline'>> = ({
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
          x1={0} y1={rect.height}
          x2={rect.width} y2={rect.height}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
