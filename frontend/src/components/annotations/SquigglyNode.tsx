import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { squiggleSegmentBudget, squiggleWave } from '../../core/annotations/squigglyGeometry';
import { SelectionHandles } from './shared/SelectionHandles';
import { hasKnownMarkupOrientation, orientedTextMarkupQuads, textMarkupPreviewRotation } from './shared/textMarkupQuads';

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

function generatedSquigglyPath(width: number, height: number, scale: number, budget: number): string {
  if (![width, height, scale].every(Number.isFinite) || width <= 0 || height <= 0 || scale <= 0) return '';
  const wave = squiggleWave(width / scale, height / scale, budget);
  return wave.map(({ fraction, displacement }, index) =>
    `${index ? 'L' : 'M'} ${width * fraction} ${height * 0.84 - displacement * Math.min(1, height / scale) * scale}`,
  ).join(' ');
}

export const SquigglyNode: React.FC<AnnotationNodeProps<'squiggly'>> = ({
  annotation, rect, scale, isSelected, pageRotation, onSelect, onTransformStart,
}) => {
  const knownGenerated = hasKnownMarkupOrientation(annotation.data);
  const color = annotation.data?.borderColor ?? (knownGenerated ? '#405980' : '#ef4444');
  const width = knownGenerated ? Math.min(5, Math.max(0.5, annotation.data?.borderWidth ?? 1)) * scale
    : annotation.data?.borderWidth ?? 1.5;
  const opacity = knownGenerated ? Math.min(1, Math.max(0, annotation.data?.opacity ?? 1)) : 1;
  const orientation = textMarkupPreviewRotation(pageRotation, annotation.data.nativeMarkupRotationSourceHash,
    annotation.data.nativeMarkupPreviewOffset, annotation.data.nativeMarkupTurn, annotation.data.nativeMarkupDraft);
  const quads = orientedTextMarkupQuads(annotation.data?.textMarkupQuads, rect.width, rect.height, orientation, knownGenerated)
    ?? [{ x: 0, y: 0, width: rect.width, height: rect.height, angle: 0 }];
  const segmentBudget = Math.max(3, Math.floor(4096 / quads.length));

  return (
    <div
      data-annotation-type="squiggly"
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y,
        width: rect.width, height: rect.height,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: knownGenerated ? 'hidden' : 'visible' }}>
        {quads.map((quad, index) => <path key={index}
          d={knownGenerated ? generatedSquigglyPath(quad.width, quad.height, scale, squiggleSegmentBudget(quads.length))
            : squigglyPath(quad.width, quad.height, 2 * scale, segmentBudget)}
          transform={`translate(${quad.x} ${quad.y})${quad.angle ? ` rotate(${quad.angle})` : ''}`}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap={knownGenerated ? 'round' : undefined}
          opacity={opacity}
        />)}
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
