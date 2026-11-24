import React from 'react';
import type { AnnotationNodeProps, Point2D, Rect } from '@/core/annotations/types';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';
import { SelectionHandles } from './shared/SelectionHandles';
import { InlineTextEditor } from './shared/InlineTextEditor';

type Props = AnnotationNodeProps & {
  anchorPoint?: Point2D | null;
  kneePoint?: Point2D | null;
  onAnchorDragStart?: (event: React.PointerEvent<SVGCircleElement>) => void;
  onKneeDragStart?: (event: React.PointerEvent<SVGElement | SVGCircleElement>) => void;
};

/**
 * The PDF's original /AP is the visual layer; React only supplies a hit target,
 * selection and editing affordances. This avoids reconstructing externally
 * authored FreeText rich text, stamps, leaders, line endings and artwork.
 *
 * /Rect covers the complete AP. For /FreeTextCallout, the logical body rect
 * supplied by the importer may cover only the text box. Never fit the full AP
 * into that body: doing so shrinks/warps the leader line.
 */
export const NativeAppearanceNode: React.FC<Props> = ({
  annotation,
  rect,
  scale,
  isSelected,
  isEditing = false,
  editingValue,
  nativeAppearanceUrl,
  onSelect,
  onTransformStart,
  onDoubleClick,
  onCommitEdit,
  anchorPoint,
  kneePoint,
  onAnchorDragStart,
  onKneeDragStart,
}) => {
  const full = annotation.data.nativeAppearanceRect;
  const originalBody = annotation.data.nativeAppearanceBodyRect;
  const isLocked = annotation.data.locked === true;
  const editableText = annotation.type === 'textbox' || annotation.type === 'callout';
  const validSource = full && originalBody
    && originalBody.width > 0 && originalBody.height > 0;
  // The logical body can be moved or resized without losing the correct
  // original AP-to-body offset. Derived geometry is in screen pixels.
  // The source /AP describes the entire callout (including its leader).
  // A foreign /RD can report a text-body rectangle that PDF.js/layout
  // normalizes differently; fitting the AP into that body deforms the leader.
  // Callout visual edits invalidate the source preview, so an unedited callout
  // must always render its /AP at its actual page scale.
  const isNativeCallout = annotation.type === 'callout';
  const widthRatio = isNativeCallout ? 1
    : validSource ? rect.width / (originalBody.width * scale) : 1;
  const heightRatio = isNativeCallout ? 1
    : validSource ? rect.height / (originalBody.height * scale) : 1;
  const appearance: Rect = validSource
    ? {
        x: rect.x + (full.x - originalBody.x) * scale * widthRatio,
        y: rect.y + (full.y - originalBody.y) * scale * heightRatio,
        width: full.width * scale * widthRatio,
        height: full.height * scale * heightRatio,
      }
    : rect;
  const anchor = anchorPoint !== undefined ? anchorPoint : annotation.data.anchor;
  const knee = kneePoint !== undefined ? kneePoint : annotation.data.knee;
  const line = annotation.type === 'callout' && anchor
    ? computeCalloutPath(
        { x: anchor.x * scale, y: anchor.y * scale },
        rect,
        {
          leaderStyle: annotation.data.leaderStyle === 'straight'
            ? 'straight' : annotation.data.leaderStyle === 'elbow' || knee ? 'elbow' : 'straight',
          kneePoint: knee ? { x: knee.x * scale, y: knee.y * scale } : null,
        },
      )
    : null;

  return (
    <div
      data-native-annotation-id={annotation.id}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: annotation.data?.opacity ?? 1,
        pointerEvents: 'none',
        zIndex: isEditing ? 50 : undefined,
        overflow: isEditing ? 'visible' : undefined,
      }}
    >
      {!isEditing && nativeAppearanceUrl && (
        <img
          data-native-annotation-appearance
          src={nativeAppearanceUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: appearance.x - rect.x,
            top: appearance.y - rect.y,
            width: appearance.width,
            height: appearance.height,
            // Tailwind preflight applies img { max-width: 100% }. The wrapper
            // intentionally spans only the logical FreeText body, while /AP
            // spans the *whole* native /Rect (including callout leaders).
            // Without these overrides browsers silently shrink the entire
            // source appearance to the body width and distort the artwork.
            maxWidth: 'none',
            maxHeight: 'none',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}
      {line && !isEditing && (
        <svg
          style={{
            position: 'absolute',
            left: appearance.x - rect.x,
            top: appearance.y - rect.y,
            width: appearance.width,
            height: appearance.height,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
          width={appearance.width}
          height={appearance.height}
        >
          <polyline
            points={line.points.map((point) => `${point.x - appearance.x},${point.y - appearance.y}`).join(' ')}
            stroke="transparent"
            strokeWidth={Math.max(14, 9 * scale)}
            fill="none"
            style={{ pointerEvents: 'stroke', cursor: isSelected ? 'move' : 'pointer', touchAction: 'none' }}
            onPointerDown={(event) => {
              if (isLocked) return;
              onSelect(event as unknown as React.PointerEvent<HTMLDivElement>);
              onTransformStart(event as unknown as React.PointerEvent<HTMLDivElement>, 'move-all');
            }}
          />
          {isSelected && anchorPoint && onAnchorDragStart && (
            <circle
              cx={line.anchorPoint.x - appearance.x}
              cy={line.anchorPoint.y - appearance.y}
              r={Math.max(5, 3 * scale)}
              fill="#2563eb"
              style={{ pointerEvents: 'all', cursor: 'crosshair', touchAction: 'none' }}
              onPointerDown={onAnchorDragStart}
            />
          )}
          {isSelected && line.kneePoint && onKneeDragStart && (
            <circle
              cx={line.kneePoint.x - appearance.x}
              cy={line.kneePoint.y - appearance.y}
              r={Math.max(5, 3 * scale)}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={Math.max(1.5 * scale, 1)}
              data-testid="native-callout-knee-handle"
              style={{ pointerEvents: 'all', cursor: 'move', touchAction: 'none' }}
              onPointerDown={onKneeDragStart}
            />
          )}
        </svg>
      )}
      <div
        data-annotation-type={annotation.type}
        data-native-annotation-hit-target
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: isEditing ? 'auto' : '100%',
          minHeight: isEditing ? '100%' : undefined,
          boxSizing: 'border-box',
          background: isEditing
            ? (annotation.data?.backgroundColor === 'transparent'
                ? 'transparent'
                : (annotation.data?.backgroundColor ?? 'rgba(255, 255, 255, 0.95)'))
            : 'transparent',
          border: (isSelected && !isEditing) ? '1px solid rgba(37, 99, 235, 0.65)' : 'none',
          cursor: isLocked ? 'pointer' : isEditing ? 'text' : isSelected ? 'move' : 'pointer',
          pointerEvents: 'all',
          touchAction: 'none',
          overflow: isEditing ? 'visible' : 'hidden',
          zIndex: isEditing ? 50 : undefined,
        }}
        onPointerDown={(event) => {
          onSelect(event);
          if (!isLocked && !isEditing) onTransformStart(event, 'move');
        }}
        onDoubleClick={editableText && !isLocked ? onDoubleClick : undefined}
      >
        {editableText && !isEditing && (
          // Keep the source's plain text in the DOM for accessible selection
          // and existing FreeText editor entry points. Its glyphs must not
          // visually compete with the original PDF /AP artwork.
          <span
            data-native-annotation-text
            style={{
              position: 'absolute',
              display: 'block',
              inset: 0,
              opacity: 0,
              pointerEvents: 'all',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              userSelect: 'none',
            }}
          >
            {annotation.data.text ?? ''}
          </span>
        )}
        {editableText && isEditing && (
          <InlineTextEditor
            defaultValue={editingValue ?? ''}
            style={{
              fontSize: annotation.data?.fontSize ?? 12,
              fontFamily: annotation.data?.fontFamily ?? 'Helvetica, Arial, sans-serif',
              fontWeight: annotation.data?.fontWeight ?? 'normal',
              fontStyle: annotation.data?.fontStyle ?? 'normal',
              textAlign: annotation.data?.textAlign ?? 'left',
              color: annotation.data?.textColor ?? '#111827',
              backgroundColor: annotation.data?.backgroundColor,
            }}
            bounds={{ width: rect.width, height: rect.height, y: rect.y }}
            scale={scale}
            rotation={annotation.data?.rotation ?? 0}
            onCommit={(val, stylePatch) => (stylePatch !== undefined ? onCommitEdit?.(val, stylePatch) : onCommitEdit?.(val))}
            onCancel={() => onCommitEdit?.(editingValue ?? '')}
          />
        )}
        {isSelected && !isLocked && !isEditing && (
          <SelectionHandles rect={rect} onTransformStart={onTransformStart} />
        )}
      </div>
    </div>
  );
};
