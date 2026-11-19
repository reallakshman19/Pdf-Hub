import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { axisAlignedTextMarkupQuads } from './shared/textMarkupQuads';

/**
 * Renders a 2px line at the bottom edge of the annotation rect.
 * The div is the event target (invisible); the visible element is the SVG line.
 */
export const UnderlineNode: React.FC<AnnotationNodeProps<'underline'>> = ({
  annotation, rect, isSelected, pageRotation, onSelect, onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#000000';
  const quads = axisAlignedTextMarkupQuads(annotation.data?.textMarkupQuads, rect.width, rect.height, { pageRotation })
    ?? [{ x: 0, y: 0, width: rect.width, height: rect.height }];

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
        {quads.map((quad, index) => <line key={index}
          x1={quad.x} y1={quad.y + quad.height * 0.83}
          x2={quad.x + quad.width} y2={quad.y + quad.height * 0.83}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 2}
          strokeLinecap="round"
        />)}
      </svg>
    </div>
  );
};
