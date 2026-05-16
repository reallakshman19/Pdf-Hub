import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';

/**
 * Highlight annotation — semi-transparent rect over text.
 *
 * RULES:
 * 1. Must NOT render annotation.data.content (it's a highlight, not a label)
 * 2. Must use mixBlendMode: 'multiply' so underlying text shows through
 * 3. opacity should be ~0.35 (configurable via data.opacity)
 * 4. No text, no border by default
 */
export const HighlightNode: React.FC<AnnotationNodeProps<'highlight'>> = ({
  annotation,
  rect,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const color   = annotation.data?.backgroundColor ?? '#FFFF00';
  const opacity = annotation.data?.opacity ?? 0.35;

  return (
    <div
      style={{
        position:        'absolute',
        left:            rect.x,
        top:             rect.y,
        width:           rect.width,
        height:          rect.height,
        backgroundColor: color,
        opacity,
        mixBlendMode:    'multiply',
        cursor:          'pointer',
        outline:         isSelected ? '1px dashed rgba(59,130,246,0.8)' : 'none',
        pointerEvents:   'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    />
  );
};
