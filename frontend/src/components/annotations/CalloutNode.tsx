import React from 'react';
import type { AnnotationNodeProps, Point2D } from '../../core/annotations/types';
import { computeCalloutPath } from '../../core/annotations/callout-geometry';
import { SelectionHandles } from './shared/SelectionHandles';
import { FreeTextPreview } from './shared/FreeTextPreview';

interface CalloutExtras {
  anchorPoint?: Point2D | null;
  kneePoint?: Point2D | null;
  onAnchorDragStart?: (e: React.PointerEvent<SVGElement>) => void;
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
  pageRotation = 0,
}) => {
  const rawBorderColor = annotation.data?.borderColor;
  const borderColor =
    rawBorderColor && rawBorderColor.toLowerCase() !== '#ffffff'
      ? rawBorderColor
      : (annotation.data?.textColor ?? '#475569');
  const fillColor = annotation.data?.backgroundColor ?? '#ffffff';
  const borderWidth = typeof annotation.data?.borderWidth === 'number' ? annotation.data.borderWidth : 1.5;
  const effectiveAnchor = anchorPoint !== undefined ? anchorPoint : (annotation.data?.anchor as Point2D | undefined);
  const effectiveKnee = kneePoint !== undefined ? kneePoint : (annotation.data?.knee as Point2D | undefined);
  const leaderStyle = annotation.data?.leaderStyle
    ? (annotation.data.leaderStyle === 'straight' ? 'straight' : 'elbow')
    : (effectiveKnee ? 'elbow' : 'straight');
  const arrowHead = annotation.data?.arrowHead === 'filled'
    ? 'filled'
    : annotation.data?.arrowHead === 'none'
      ? 'none'
      : 'open';
  const sourcePageRotation = annotation.data.nativeCopySource
    ? (annotation.data.nativeAppearancePageRotation ?? pageRotation) : pageRotation;
  const contentRotation = sourcePageRotation + (annotation.data.nativeOrientationAdjustment ?? 0);
  const sideways = ((contentRotation % 180) + 180) % 180 === 90;
  const bodyWidth = sideways ? rect.height : rect.width;
  const bodyHeight = sideways ? rect.width : rect.height;

  const visualBox = {
    x: rect.x + (rect.width - bodyWidth) / 2,
    y: rect.y + (rect.height - bodyHeight) / 2,
    width: bodyWidth,
    height: bodyHeight,
  };

  const geometry = effectiveAnchor
    ? computeCalloutPath(
        { x: effectiveAnchor.x * scale, y: effectiveAnchor.y * scale },
        visualBox,
        {
          leaderStyle,
          kneePoint: effectiveKnee ? { x: effectiveKnee.x * scale, y: effectiveKnee.y * scale } : null,
        },
      )
    : null;

  const strokeWidth = Math.max(borderWidth * scale, 1);

  return (
    <div
      data-annotation-type="callout"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {geometry && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          {/* Wide transparent hit target for leader line click & drag */}
          <polyline
            points={geometry.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(strokeWidth, 14)}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'stroke', cursor: isSelected ? 'move' : 'pointer', touchAction: 'none' }}
            onPointerDown={(e) => {
              onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
              onTransformStart(e as unknown as React.PointerEvent<HTMLDivElement>, 'move-all');
            }}
          />
          {/* Visible leader line */}
          <polyline
            points={geometry.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={borderColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
          />
          {arrowHead !== 'none' && geometry.points.length >= 2 && (
            <LeaderArrowHead
              from={geometry.points[geometry.points.length - 2]}
              to={geometry.anchorPoint}
              color={borderColor}
              strokeWidth={strokeWidth}
              styleType={arrowHead}
              scale={scale}
              cursor={effectiveAnchor && onAnchorDragStart ? 'crosshair' : (isSelected ? 'move' : 'pointer')}
              onPointerDown={(e) => {
                if (effectiveAnchor && onAnchorDragStart) {
                  onAnchorDragStart(e);
                } else {
                  onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
                  onTransformStart(e as unknown as React.PointerEvent<HTMLDivElement>, 'move-all');
                }
              }}
            />
          )}
          {effectiveAnchor && onAnchorDragStart && (
            <circle
              cx={geometry.anchorPoint.x}
              cy={geometry.anchorPoint.y}
              r={Math.max(5 * scale, 3)}
              fill={borderColor}
              cursor="crosshair"
              style={{ pointerEvents: 'all', touchAction: 'none' }}
              onPointerDown={onAnchorDragStart}
            />
          )}
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: visualBox.x,
          top: visualBox.y,
          width: visualBox.width,
          height: visualBox.height,
          background: fillColor,
          border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: 4,
          padding: '1px 3px',
          color: annotation.data?.textColor ?? '#111827',
          fontFamily: annotation.data?.fontFamily ?? 'Helvetica, Arial, sans-serif',
          fontSize: (annotation.data?.fontSize ?? 10) * scale,
          fontWeight: annotation.data?.fontWeight ?? 'normal',
          fontStyle: annotation.data?.fontStyle ?? 'normal',
          textAlign: annotation.data?.textAlign ?? 'left',
          cursor: isEditing ? 'text' : (isSelected ? 'move' : 'pointer'),
          pointerEvents: 'all',
          outline: isSelected ? `2px solid ${borderColor}` : 'none',
          overflow: 'hidden',
          boxSizing: 'border-box',
          touchAction: 'none',
          userSelect: 'none',
          transform: `rotate(${contentRotation + (annotation.data.rotation ?? 0)}deg)`,
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
          <FreeTextPreview
            className="select-none"
            text={annotation.data?.text ?? ''}
            styleKey={`${bodyWidth}/${bodyHeight}/${scale}/${annotation.data?.fontSize}/${annotation.data?.fontWeight}/${annotation.data?.fontStyle}`}
          />
        )}
        {isSelected && !isEditing && (
          <SelectionHandles rect={visualBox} onTransformStart={onTransformStart} />
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
  scale?: number;
  cursor?: string;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
}

const LeaderArrowHead: React.FC<LeaderArrowHeadProps> = ({
  from,
  to,
  color,
  strokeWidth,
  styleType,
  scale = 1,
  cursor = 'pointer',
  onPointerDown,
}) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.max(10 * scale, strokeWidth * 4);
  const left = {
    x: to.x - length * Math.cos(angle - Math.PI / 7),
    y: to.y - length * Math.sin(angle - Math.PI / 7),
  };
  const right = {
    x: to.x - length * Math.cos(angle + Math.PI / 7),
    y: to.y - length * Math.sin(angle + Math.PI / 7),
  };

  const style: React.CSSProperties = {
    pointerEvents: onPointerDown ? 'all' : 'none',
    cursor,
    touchAction: 'none',
  };

  if (styleType === 'filled') {
    return (
      <polygon
        points={`${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={color}
        style={style}
        onPointerDown={onPointerDown}
      />
    );
  }

  return (
    <g style={style} onPointerDown={onPointerDown}>
      <line x1={to.x} y1={to.y} x2={left.x} y2={left.y} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1={to.x} y1={to.y} x2={right.x} y2={right.y} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </g>
  );
};
