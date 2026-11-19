import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { axisAlignedTextMarkupQuads } from './shared/textMarkupQuads';

function squigglyPath(width: number, height: number, amplitude = 2, segmentBudget = 1024): string {
  if (![width, height, amplitude].every(Number.isFinite) || width <= 0 || height <= 0) return '';
  // A document can contain a huge finite Rect; cap work even in fallback.
  const bumps = Math.min(segmentBudget, 1024, Math.max(3, Math.round(width / 8)));
  const step = width / bumps;
  // Draw squiggly just below the text baseline (83% of span height)
  const y = height * 0.83;
  let d = `M 0 ${y} `;
  for (let i = 0; i < bumps; i++) {
    const cx = i * step + step / 2;
    const cy = y + (i % 2 === 0 ? amplitude : -amplitude);
    const ex = (i + 1) * step;
    d += `Q ${cx} ${cy} ${ex} ${y} `;
  }
  return d;
}

export const SquigglyNode: React.FC<AnnotationNodeProps<'squiggly'>> = ({
  annotation, rect, scale, isSelected, pageRotation, onSelect, onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#ef4444';
  const width = annotation.data?.borderWidth ?? 1.5;
  const quads = axisAlignedTextMarkupQuads(annotation.data?.textMarkupQuads, rect.width, rect.height, { pageRotation })
    ?? [{ x: 0, y: 0, width: rect.width, height: rect.height }];
  const segmentBudget = Math.max(3, Math.floor(4096 / quads.length));

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
        {quads.map((quad, index) => <path key={index}
          d={squigglyPath(quad.width, quad.height, 2 * scale, segmentBudget)}
          transform={`translate(${quad.x} ${quad.y})`}
          fill="none"
          stroke={color}
          strokeWidth={width}
        />)}
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
