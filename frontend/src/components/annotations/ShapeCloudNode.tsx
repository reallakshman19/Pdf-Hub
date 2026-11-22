import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

/**
 * Computes a true circular Bézier arc revision cloud path along a rectangular boundary.
 * Adheres to ISO 32000-1 §12.5.6.8 Border Effect (Cloud) geometry.
 */
export function computeParametricCloudPath(
  width: number,
  height: number,
  arcRadius = 8,
  inverted = false,
): string {
  const chord = Math.max(12, arcRadius * 2);
  const sign = inverted ? -1 : 1;

  const emitSideArcs = (x1: number, y1: number, x2: number, y2: number): string => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return '';
    const numArcs = Math.max(1, Math.round(len / chord));
    const step = len / numArcs;
    const ux = dx / len;
    const uy = dy / len;
    // Normal vector pointing outward (to the right of direction of traversal if clockwise)
    const nx = -uy * sign;
    const ny = ux * sign;
    const sagitta = (step / 2) * 0.7; // arc amplitude

    let sideD = '';
    for (let i = 0; i < numArcs; i++) {
      const p0x = x1 + ux * (i * step);
      const p0y = y1 + uy * (i * step);
      const p1x = x1 + ux * ((i + 1) * step);
      const p1y = y1 + uy * ((i + 1) * step);

      const cp1x = p0x + nx * sagitta * 0.8;
      const cp1y = p0y + ny * sagitta * 0.8;
      const cp2x = p1x + nx * sagitta * 0.8;
      const cp2y = p1y + ny * sagitta * 0.8;
      sideD += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1x.toFixed(2)} ${p1y.toFixed(2)} `;
    }
    return sideD;
  };

  let d = 'M 0 0 ';
  d += emitSideArcs(0, 0, width, 0);
  d += emitSideArcs(width, 0, width, height);
  d += emitSideArcs(width, height, 0, height);
  d += emitSideArcs(0, height, 0, 0);
  d += 'Z';
  return d;
}

export const ShapeCloudNode: React.FC<AnnotationNodeProps<'shape-cloud'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  const bg = annotation.data?.backgroundColor ?? 'transparent';
  const border = annotation.data?.borderColor ?? '#3b82f6';
  const width = annotation.data?.borderWidth ?? 2;
  const arcRadius = (annotation.data?.cloudArcRadius ?? 8) * scale;
  const inverted = Boolean(annotation.data?.cloudInverted);
  const pathD = computeParametricCloudPath(rect.width, rect.height, arcRadius, inverted);

  return (
    <div
      data-annotation-type="shape-cloud"
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        opacity: annotation.data?.opacity ?? 1,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <path d={pathD} fill={bg} stroke={border} strokeWidth={width} strokeLinejoin="round" />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
