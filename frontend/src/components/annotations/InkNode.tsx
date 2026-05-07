import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

/**
 * Renders free-hand ink annotation as SVG paths.
 *
 * data.paths: Array<Array<{ x: number; y: number }>>
 * Each inner array is one continuous stroke.
 * Coordinates are in PDF space (unscaled); we scale them here.
 *
 * COMMON FAILURE MODE: rendering a placeholder <div> because data.paths
 * is not consumed. This component must always render SVG paths.
 */
export const InkNode: React.FC<AnnotationNodeProps<'ink'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const paths: Array<Array<{ x: number; y: number } | number>> = annotation.data?.paths ?? [];
  const strokeColor = annotation.data?.borderColor ?? '#000000';
  const strokeWidth = (annotation.data?.borderWidth ?? 2) * scale;

  // Convert path arrays to SVG path data strings. Some ink nodes might use an array of numbers [x, y, x, y] instead of objects.
  const pathDStrings = paths.map(stroke => {
    if (stroke.length === 0) return '';
    let d = '';
    if (typeof stroke[0] === 'number') {
      const nums = stroke as number[];
      for (let i = 0; i < nums.length; i += 2) {
        const cx = (nums[i] * scale).toFixed(2);
        const cy = (nums[i+1] * scale).toFixed(2);
        d += i === 0 ? `M ${cx} ${cy}` : ` L ${cx} ${cy}`;
      }
    } else {
      const points = stroke as {x: number, y: number}[];
      const [first, ...rest] = points;
      const move = `M ${(first.x * scale).toFixed(2)} ${(first.y * scale).toFixed(2)}`;
      const lines = rest.map(p => `L ${(p.x * scale).toFixed(2)} ${(p.y * scale).toFixed(2)}`);
      d = `${move} ${lines.join(' ')}`;
    }
    return d;
  }).filter(Boolean);

  if (pathDStrings.length === 0) {
    // Fallback: render a visible error indicator so missing data is obvious
    return (
      <div
        style={{
          position: 'absolute',
          left: rect.x, top: rect.y,
          width: rect.width, height: rect.height,
          border: '1px dashed red',
          fontSize: 10,
          color: 'red',
        }}
      >
        ink: no paths
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y,
        width: rect.width, height: rect.height,
        cursor: 'pointer',
        pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg
        width={rect.width}
        height={rect.height}
        style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0 }}
      >
        {pathDStrings.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {isSelected && (
        <SelectionHandles rect={rect} onTransformStart={onTransformStart} />
      )}
    </div>
  );
};
