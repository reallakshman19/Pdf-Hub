import React from 'react';
import type { AnnotationNodeProps, CalloutLeaderBranch, Point2D } from '../../core/annotations/types';
import { computeMultiCalloutPaths } from '../../core/annotations/callout-geometry';
import { SelectionHandles } from './shared/SelectionHandles';
import { FreeTextPreview } from './shared/FreeTextPreview';
import { InlineTextEditor } from './shared/InlineTextEditor';

interface CalloutExtras {
  anchorPoint?: Point2D | null;
  kneePoint?: Point2D | null;
  onAnchorDragStart?: (e: React.PointerEvent<SVGElement>) => void;
  onKneeDragStart?: (e: React.PointerEvent<SVGElement>) => void;
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
  onKneeDragStart,
  pageRotation = 0,
}) => {
  const rawBorderColor = annotation.data?.borderColor;
  const borderColor =
    rawBorderColor && rawBorderColor.toLowerCase() !== '#ffffff'
      ? rawBorderColor
      : (annotation.data?.textColor ?? '#475569');
  const isTransparentBg = annotation.data?.backgroundColor === 'transparent';
  const fillColor = isTransparentBg ? 'transparent' : (annotation.data?.backgroundColor ?? '#ffffff');
  const borderWidth = typeof annotation.data?.borderWidth === 'number' ? annotation.data.borderWidth : 1.5;
  const effectiveAnchor = anchorPoint !== undefined ? anchorPoint : (annotation.data?.anchor as Point2D | undefined);
  const effectiveKnee = kneePoint !== undefined ? kneePoint : (annotation.data?.knee as Point2D | undefined);
  const leaderStyle = annotation.data?.leaderStyle
    ? (annotation.data.leaderStyle === 'straight' ? 'straight' : 'elbow')
    : 'elbow';
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

  const rawLeaders: CalloutLeaderBranch[] = (annotation.data?.leaders && annotation.data.leaders.length > 0)
    ? annotation.data.leaders
    : effectiveAnchor
      ? [{
          id: 'primary',
          anchor: effectiveAnchor,
          knee: effectiveKnee,
          leaderStyle,
          arrowHead: (arrowHead as CalloutLeaderBranch['arrowHead']),
        }]
      : [];

  const scaledLeaders = rawLeaders.map((branch) => ({
    ...branch,
    anchor: { x: branch.anchor.x * scale, y: branch.anchor.y * scale },
    knee: branch.knee ? { x: branch.knee.x * scale, y: branch.knee.y * scale } : null,
  }));

  const paths = computeMultiCalloutPaths(scaledLeaders, visualBox);
  const strokeWidth = Math.max(borderWidth * scale, 1);

  return (
    <div
      data-annotation-container="callout"
      data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: annotation.data?.opacity ?? 1 }}
    >
      {paths.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          {paths.map((p) => {
            return (
              <React.Fragment key={p.id}>
                {/* Wide transparent hit target for leader line click & drag */}
                <polyline
                  points={p.points.map((point) => `${point.x},${point.y}`).join(' ')}
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
                  points={p.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'none' }}
                />
                {p.arrowHead !== 'none' && p.points.length >= 2 && (
                  <LeaderArrowHead
                    from={p.points[p.points.length - 2]}
                    to={p.anchorPoint}
                    color={borderColor}
                    strokeWidth={strokeWidth}
                    styleType={p.arrowHead}
                    scale={scale}
                    cursor={onAnchorDragStart ? 'crosshair' : (isSelected ? 'move' : 'pointer')}
                    onPointerDown={(e) => {
                      if (onAnchorDragStart) {
                        onAnchorDragStart(e);
                      } else {
                        onSelect(e as unknown as React.PointerEvent<HTMLDivElement>);
                        onTransformStart(e as unknown as React.PointerEvent<HTMLDivElement>, 'move-all');
                      }
                    }}
                  />
                )}
                {onAnchorDragStart && (
                  <circle
                    cx={p.anchorPoint.x}
                    cy={p.anchorPoint.y}
                    r={Math.max(5 * scale, 3)}
                    fill={borderColor}
                    cursor="crosshair"
                    data-testid="callout-anchor-handle"
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    onPointerDown={onAnchorDragStart}
                  />
                )}
                {onKneeDragStart && p.kneePoint && (
                  <circle
                    cx={p.kneePoint.x}
                    cy={p.kneePoint.y}
                    r={Math.max(5 * scale, 3)}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth={Math.max(1.5 * scale, 1)}
                    cursor="move"
                    data-testid="callout-knee-handle"
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    onPointerDown={onKneeDragStart}
                  />
                )}
              </React.Fragment>
            );
          })}
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: visualBox.x,
          top: visualBox.y,
          width: visualBox.width,
          height: isEditing ? 'auto' : visualBox.height,
          minHeight: isEditing ? visualBox.height : undefined,
          background: isEditing
            ? (isTransparentBg ? 'transparent' : (annotation.data?.backgroundColor ?? '#ffffff'))
            : fillColor,
          border: isEditing ? 'none' : `${borderWidth}px solid ${borderColor}`,
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
          outline: (isSelected && !isEditing) ? `2px solid ${borderColor}` : 'none',
          overflow: isEditing ? 'visible' : 'hidden',
          zIndex: isEditing ? 50 : undefined,
          boxSizing: 'border-box',
          touchAction: 'none',
          userSelect: 'none',
          transform: `rotate(${contentRotation + (annotation.data.rotation ?? 0)}deg)`,
        }}
        data-annotation-type="callout"
        data-native-annotation-hit-target={annotation.data.nativeSourceRef ? '' : undefined}
        onPointerDown={(e) => {
          onSelect(e);
          onTransformStart(e, 'move');
        }}
        onDoubleClick={onDoubleClick}
      >
        {isEditing ? (
          <InlineTextEditor
            defaultValue={editingValue ?? ''}
            style={{
              fontSize: annotation.data?.fontSize ?? 10,
              fontFamily: annotation.data?.fontFamily ?? 'Helvetica, Arial, sans-serif',
              fontWeight: annotation.data?.fontWeight ?? 'normal',
              fontStyle: annotation.data?.fontStyle ?? 'normal',
              textAlign: annotation.data?.textAlign ?? 'left',
              color: annotation.data?.textColor ?? '#111827',
              backgroundColor: isTransparentBg ? 'transparent' : (annotation.data?.backgroundColor ?? '#ffffff'),
            }}
            bounds={{ width: visualBox.width, height: visualBox.height, y: visualBox.y }}
            scale={scale}
            onCommit={(val, stylePatch) => (stylePatch !== undefined ? onCommitEdit?.(val, stylePatch) : onCommitEdit?.(val))}
            onCancel={() => onCommitEdit?.(editingValue ?? '')}
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
  styleType: 'open' | 'filled' | 'circle' | 'square' | 'slash' | 'diamond';
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

  if (styleType === 'circle') {
    const r = Math.max(4 * scale, strokeWidth * 2);
    return (
      <circle
        cx={to.x}
        cy={to.y}
        r={r}
        fill={color}
        style={style}
        onPointerDown={onPointerDown}
      />
    );
  }

  if (styleType === 'square') {
    const s = Math.max(4 * scale, strokeWidth * 2);
    return (
      <rect
        x={to.x - s}
        y={to.y - s}
        width={2 * s}
        height={2 * s}
        fill={color}
        style={style}
        onPointerDown={onPointerDown}
      />
    );
  }

  if (styleType === 'slash') {
    const s = Math.max(6 * scale, strokeWidth * 2.5);
    return (
      <line
        x1={to.x - s}
        y1={to.y - s}
        x2={to.x + s}
        y2={to.y + s}
        stroke={color}
        strokeWidth={strokeWidth * 1.5}
        strokeLinecap="round"
        style={style}
        onPointerDown={onPointerDown}
      />
    );
  }

  if (styleType === 'diamond') {
    const s = Math.max(5 * scale, strokeWidth * 2);
    return (
      <polygon
        points={`${to.x},${to.y - s} ${to.x + s},${to.y} ${to.x},${to.y + s} ${to.x - s},${to.y}`}
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
