import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { getAnnotationLocalPoints } from '../../core/annotations/pointsSpace';
import { SelectionHandles } from './shared/SelectionHandles';
import { AreaTakeoffNode } from './AreaTakeoffNode';

export const ShapePolygonNode: React.FC<AnnotationNodeProps<'shape-polygon'>> = (props) => {
  if (props.annotation.data?.isAreaTakeoff) {
    return <AreaTakeoffNode {...props} />;
  }
  const {
    annotation,
    rect,
    scale,
    isSelected,
    onSelect,
    onTransformStart,
    onVertexDragStart,
    onInsertMidpointVertex,
    onDeleteVertex,
  } = props;
  const bg = annotation.data?.backgroundColor ?? 'transparent';
  const border = annotation.data?.borderColor ?? '#3b82f6';
  const width = (annotation.data?.borderWidth ?? 2) * scale;
  const style = annotation.data?.borderStyle ?? 'solid';
  const opacity = annotation.data?.opacity ?? 1;
  const dash = style === 'dashed' ? `${3 * scale} ${2 * scale}` : style === 'dotted' ? `${scale} ${scale}` : undefined;
  const points = getAnnotationLocalPoints(annotation).map((p) => p * scale);
  const canEditVertices = isSelected && !annotation.data?.locked && Boolean(onVertexDragStart);
  const vertexCount = Math.floor(points.length / 2);

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <polygon points={points.reduce((acc, curr, idx) => acc + (idx % 2 === 0 ? `${curr},` : `${curr} `), '').trim()}
          fill={bg} fillOpacity={opacity} stroke={style === 'none' ? 'none' : border} strokeOpacity={opacity}
          strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" />
        {canEditVertices && Array.from({ length: vertexCount }, (_, idx) => {
          const vx = points[idx * 2];
          const vy = points[idx * 2 + 1];
          const nextIdx = (idx + 1) % vertexCount;
          const midX = (vx + points[nextIdx * 2]) / 2;
          const midY = (vy + points[nextIdx * 2 + 1]) / 2;
          return (
            <g key={`poly-grip-${idx}`}>
              {onInsertMidpointVertex && (
                <circle
                  data-midpoint-handle={idx}
                  cx={midX}
                  cy={midY}
                  r={4 * scale}
                  fill="#06b6d4"
                  stroke="#ffffff"
                  strokeWidth={1.25 * scale}
                  style={{ pointerEvents: 'all', cursor: 'copy' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onInsertMidpointVertex(idx, {
                      x: (rect.x + midX) / scale,
                      y: (rect.y + midY) / scale,
                    });
                  }}
                />
              )}
              <circle
                data-vertex-handle={idx}
                cx={vx}
                cy={vy}
                r={5.5 * scale}
                fill="#ffffff"
                stroke={border}
                strokeWidth={1.75 * scale}
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (e.altKey && onDeleteVertex) {
                    onDeleteVertex(idx);
                    return;
                  }
                  onVertexDragStart?.(e, idx);
                }}
              />
            </g>
          );
        })}
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
