import React from 'react';
import type { AnnotationNodeProps, Point2D } from '../../core/annotations/types';
import { computeCalloutPath } from '../../core/annotations/callout-geometry';

interface CalloutExtras {
  anchorPoint?: Point2D;
  kneePoint?: Point2D;
  onAnchorDragStart?: (e: React.PointerEvent<SVGCircleElement>) => void;
}

export const CalloutNode: React.FC<AnnotationNodeProps<'callout'> & CalloutExtras> = ({
  annotation,
  rect,
  scale,
  isSelected,
  isEditing,
  editingValue,
  onSelect,
  onTransformStart,
  onDoubleClick,
  onCommitEdit,
  anchorPoint,
  kneePoint,
  onAnchorDragStart,
}) => {
  const borderColor = annotation.data?.borderColor ?? '#475569';
  const fillColor = annotation.data?.backgroundColor ?? '#ffffff';
  const borderWidth = typeof annotation.data?.borderWidth === 'number' ? annotation.data.borderWidth : 1.5;
  const leaderStyle = annotation.data?.leaderStyle === 'straight' ? 'straight' : 'elbow';
  const arrowHead = annotation.data?.arrowHead === 'filled'
    ? 'filled'
    : annotation.data?.arrowHead === 'none'
      ? 'none'
      : 'open';

  const geometry = anchorPoint
    ? computeCalloutPath(
        { x: anchorPoint.x * scale, y: anchorPoint.y * scale },
        rect,
        {
          leaderStyle,
          kneePoint: kneePoint ? { x: kneePoint.x * scale, y: kneePoint.y * scale } : null,
        },
      )
    : null;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {geometry && (
        <svg
          style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={0}
          height={0}
        >
          <polyline
            points={geometry.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={borderColor}
            strokeWidth={borderWidth}
          />
          {arrowHead !== 'none' && geometry.points.length >= 2 && (
            <LeaderArrowHead
              from={geometry.points[geometry.points.length - 2]}
              to={geometry.anchorPoint}
              color={borderColor}
              strokeWidth={borderWidth}
              styleType={arrowHead}
            />
          )}
          {anchorPoint && onAnchorDragStart && (
            <circle
              cx={geometry.anchorPoint.x}
              cy={geometry.anchorPoint.y}
              r={5}
              fill={borderColor}
              cursor="crosshair"
              style={{ pointerEvents: 'all' }}
              onPointerDown={onAnchorDragStart}
            />
          )}
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          background: fillColor,
          border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: 4,
          padding: 4,
          color: annotation.data?.textColor ?? '#111827',
          fontSize: (annotation.data?.fontSize ?? 12) * scale,
          cursor: 'pointer',
          pointerEvents: 'all',
          outline: isSelected ? `2px solid ${borderColor}` : 'none',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onPointerDown={(e) => {
          onSelect(e);
          onTransformStart(e, 'move');
        }}
        onDoubleClick={onDoubleClick}
      >
        {isEditing ? (
          <textarea
            autoFocus
            defaultValue={editingValue}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              fontSize: 'inherit',
            }}
            onBlur={(e) => onCommitEdit?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                onCommitEdit?.(e.currentTarget.value);
              }
            }}
          />
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{annotation.data?.text ?? ''}</span>
        )}
      </div>
    </div>
  );
};

interface LeaderArrowHeadProps {
  from: Point2D;
  to: Point2D;
  color: string;
  strokeWidth: number;
  styleType: 'open' | 'filled';
}

const LeaderArrowHead: React.FC<LeaderArrowHeadProps> = ({
  from,
  to,
  color,
  strokeWidth,
  styleType,
}) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.max(8, strokeWidth * 4);
  const left = {
    x: to.x - length * Math.cos(angle - Math.PI / 7),
    y: to.y - length * Math.sin(angle - Math.PI / 7),
  };
  const right = {
    x: to.x - length * Math.cos(angle + Math.PI / 7),
    y: to.y - length * Math.sin(angle + Math.PI / 7),
  };

  if (styleType === 'filled') {
    return <polygon points={`${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={color} />;
  }

  return (
    <>
      <line x1={to.x} y1={to.y} x2={left.x} y2={left.y} stroke={color} strokeWidth={strokeWidth} />
      <line x1={to.x} y1={to.y} x2={right.x} y2={right.y} stroke={color} strokeWidth={strokeWidth} />
    </>
  );
};
