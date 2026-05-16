import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

type LineCap = 'none' | 'arrow' | 'circle' | 'square';

export const LineNode: React.FC<AnnotationNodeProps<'line'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
}) => {
  const color = annotation.data?.borderColor ?? '#111827';
  const width = annotation.data?.borderWidth ?? 2;
  const points = (annotation.data?.points ?? [0, rect.height / 2, rect.width, rect.height / 2]).map((value) => value * scale);
  const startCap = readLineCap(annotation.data?.lineStartCap, 'none');
  const endCap = readLineCap(annotation.data?.lineEndCap, 'none');
  const markerStartId = `line-start-${annotation.id}`;
  const markerEndId = `line-end-${annotation.id}`;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        cursor: 'pointer',
        pointerEvents: 'all',
      }}
      onPointerDown={(e) => {
        onSelect(e);
        onTransformStart(e, 'move');
      }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          {startCap !== 'none' && (
            <LineCapMarker id={markerStartId} cap={startCap} color={color} />
          )}
          {endCap !== 'none' && (
            <LineCapMarker id={markerEndId} cap={endCap} color={color} />
          )}
        </defs>
        <line
          x1={points[0]}
          y1={points[1]}
          x2={points[2]}
          y2={points[3]}
          stroke={color}
          strokeWidth={width}
          markerStart={startCap !== 'none' ? `url(#${markerStartId})` : undefined}
          markerEnd={endCap !== 'none' ? `url(#${markerEndId})` : undefined}
        />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};

interface LineCapMarkerProps {
  id: string;
  cap: Exclude<LineCap, 'none'>;
  color: string;
}

const LineCapMarker: React.FC<LineCapMarkerProps> = ({ id, cap, color }) => {
  if (cap === 'arrow') {
    return (
      <marker
        id={id}
        markerWidth="8"
        markerHeight="8"
        refX="7"
        refY="4"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
      </marker>
    );
  }

  if (cap === 'circle') {
    return (
      <marker
        id={id}
        markerWidth="8"
        markerHeight="8"
        refX="4"
        refY="4"
        orient="auto-start-reverse"
      >
        <circle cx="4" cy="4" r="3" fill={color} />
      </marker>
    );
  }

  return (
    <marker
      id={id}
      markerWidth="8"
      markerHeight="8"
      refX="4"
      refY="4"
      orient="auto-start-reverse"
    >
      <rect x="1.5" y="1.5" width="5" height="5" fill={color} />
    </marker>
  );
};

function readLineCap(value: unknown, fallback: LineCap): LineCap {
  if (value === 'none' || value === 'arrow' || value === 'circle' || value === 'square') {
    return value;
  }
  return fallback;
}
