import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { getAnnotationLocalPoints } from '../../core/annotations/pointsSpace';
import { SelectionHandles } from './shared/SelectionHandles';
import { DimensionNode } from './DimensionNode';
import { PerimeterTakeoffNode } from './PerimeterTakeoffNode';

type LineCap = 'none' | 'arrow' | 'circle' | 'square';

export const LineNode: React.FC<AnnotationNodeProps<'line'>> = ({
  annotation,
  rect,
  scale,
  isSelected,
  onSelect,
  onTransformStart,
  onVertexDragStart,
  onInsertMidpointVertex,
  onDeleteVertex,
}) => {
  const localPoints = getAnnotationLocalPoints(annotation);
  if (annotation.data?.isPipeRun || localPoints.length > 4) {
    return (
      <PerimeterTakeoffNode
        annotation={annotation}
        rect={rect}
        scale={scale}
        isSelected={isSelected}
        onSelect={onSelect}
        onTransformStart={onTransformStart}
        onVertexDragStart={onVertexDragStart}
        onInsertMidpointVertex={onInsertMidpointVertex}
        onDeleteVertex={onDeleteVertex}
      />
    );
  }

  if (annotation.data?.dimensionScale !== undefined || annotation.data?.isDimension) {
    return (
      <DimensionNode
        annotation={annotation}
        rect={rect}
        scale={scale}
        isSelected={isSelected}
        onSelect={onSelect}
        onTransformStart={onTransformStart}
      />
    );
  }
  const color = annotation.data?.borderColor ?? '#111827';
  const width = (annotation.data?.borderWidth ?? 2) * scale;
  const points = (localPoints.length >= 4 ? localPoints : [0, rect.height / (2 * scale), rect.width / scale, rect.height / (2 * scale)]).map((value) => value * scale);
  const startCap = readLineCap(annotation.data?.lineStartCap, 'none');
  const endCap = readLineCap(annotation.data?.lineEndCap, 'none');
  const markerStartId = `line-start-${annotation.id}`;
  const markerEndId = `line-end-${annotation.id}`;

  return (
    <div
      data-annotation-type="line"
      data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
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
      <svg width="100%" height="100%" style={{ overflow: 'visible', opacity: annotation.data?.opacity ?? 1 }}>
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
          strokeDasharray={annotation.data?.borderStyle === 'dashed' ? `${3 * scale} ${2 * scale}` : annotation.data?.borderStyle === 'dotted' ? `${scale} ${scale}` : undefined}
          markerStart={startCap !== 'none' ? `url(#${markerStartId})` : undefined}
          markerEnd={endCap !== 'none' ? `url(#${markerEndId})` : undefined}
        />
        {isSelected && !annotation.data?.locked && onVertexDragStart && (
          <>
            <circle
              data-vertex-handle={0}
              cx={points[0]}
              cy={points[1]}
              r={5 * scale}
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth={1.75 * scale}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onVertexDragStart(e, 0);
              }}
            />
            <circle
              data-vertex-handle={1}
              cx={points[2]}
              cy={points[3]}
              r={5 * scale}
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth={1.75 * scale}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onVertexDragStart(e, 1);
              }}
            />
            {onInsertMidpointVertex && (
              <circle
                data-midpoint-handle={0}
                cx={(points[0] + points[2]) / 2}
                cy={(points[1] + points[3]) / 2}
                r={4 * scale}
                fill="#06b6d4"
                stroke="#ffffff"
                strokeWidth={1.25 * scale}
                style={{ pointerEvents: 'all', cursor: 'copy' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const midpoint = {
                    x: (rect.x + (points[0] + points[2]) / 2) / scale,
                    y: (rect.y + (points[1] + points[3]) / 2) / scale,
                  };
                  if (e.detail >= 2) {
                    onInsertMidpointVertex(0, midpoint);
                    return;
                  }
                  const startX = e.clientX;
                  const startY = e.clientY;
                  let committed = false;
                  const cleanup = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                  };
                  const onMove = (moveEvent: PointerEvent) => {
                    if (committed) return;
                    if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
                      committed = true;
                      cleanup();
                      onInsertMidpointVertex(0, midpoint);
                    }
                  };
                  const onUp = () => {
                    cleanup();
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }}
              />
            )}
          </>
        )}
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
