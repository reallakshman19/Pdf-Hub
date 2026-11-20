import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { orientedTextMarkupQuads, pointOnTextMarkupQuad, textMarkupPreviewRotation } from './shared/textMarkupQuads';

/**
 * Renders a 2px line at the bottom edge of the annotation rect.
 * The div is the event target (invisible); the visible element is the SVG line.
 */
export const UnderlineNode: React.FC<AnnotationNodeProps<'underline'>> = ({
  annotation, rect, isSelected, pageRotation, onSelect, onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#000000';
  const orientation = textMarkupPreviewRotation(pageRotation, annotation.data.nativeMarkupRotationSourceHash,
    annotation.data.nativeMarkupPreviewOffset, annotation.data.nativeMarkupTurn);
  const quads = orientedTextMarkupQuads(annotation.data?.textMarkupQuads, rect.width, rect.height, orientation)
    ?? [{ x: 0, y: 0, width: rect.width, height: rect.height, angle: 0 }];

  return (
    <div
      data-annotation-type="underline"
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y,
        width: rect.width, height: rect.height,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width={rect.width} height={rect.height} style={{ overflow: 'visible' }}>
        {quads.map((quad, index) => {
          const start = pointOnTextMarkupQuad(quad, 0, quad.height * 0.83);
          const end = pointOnTextMarkupQuad(quad, quad.width, quad.height * 0.83);
          return <line key={index}
          x1={start.x} y1={start.y}
          x2={end.x} y2={end.y}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 2}
          strokeLinecap="round"
        />; })}
      </svg>
    </div>
  );
};
