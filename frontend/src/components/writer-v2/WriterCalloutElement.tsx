import React from 'react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import {
  pdfToViewportPoint,
} from '@/core/writer-v2/coordinateTransform';
import { WriterRichElementBox } from './WriterRichElementBox';

export interface WriterCalloutElementProps {
  element: WriterElementV2;
  viewport: WriterPageViewport;
  selected: boolean;
  isEditing: boolean;
  onBeginDrag: (event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => void;
  onUpdateDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEndDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  viewportRect: { x: number; y: number; width: number; height: number };
}

export const WriterCalloutElement: React.FC<WriterCalloutElementProps> = ({
  element,
  viewport,
  selected,
  isEditing,
  onBeginDrag,
  onUpdateDrag,
  onEndDrag,
  onDoubleClick,
  viewportRect,
}) => {
  const callout = element.callout;

  if (!callout) {
    return null;
  }

  const anchorPoint = callout.anchorPoint
    ? pdfToViewportPoint(callout.anchorPoint, viewport)
    : null;

  let leaderSvg = null;

  if (anchorPoint && callout.leaderStyle !== 'none') {
    // Find the center of the box to draw the line to
    const boxCenterX = viewportRect.x + viewportRect.width / 2;
    const boxCenterY = viewportRect.y + viewportRect.height / 2;

    const dx = boxCenterX - anchorPoint.x;
    const dy = boxCenterY - anchorPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Compute precise edge intersection using AABB raycasting
    let edgeX = boxCenterX;
    let edgeY = boxCenterY;

    if (distance > 0) {
      const hw = viewportRect.width / 2;
      const hh = viewportRect.height / 2;

      // Calculate intersection t-values for X and Y planes
      const tx = hw / Math.abs(dx);
      const ty = hh / Math.abs(dy);

      // The box edge is hit at the smaller of the two t-values
      const t = Math.min(tx, ty);

      edgeX = boxCenterX - dx * t;
      edgeY = boxCenterY - dy * t;
    }

    leaderSvg = (
      <svg
        className="callout-leader-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
          zIndex: element.style.zIndex - 1, // Draw behind the box
        }}
      >
        {callout.leaderStyle === 'arrow' && (
          <defs>
            <marker
              id={`arrowhead-${element.id}`}
              markerWidth="10"
              markerHeight="7"
              refX="0"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={callout.leaderColor} />
            </marker>
          </defs>
        )}
        <line
          x1={anchorPoint.x}
          y1={anchorPoint.y}
          x2={edgeX}
          y2={edgeY}
          stroke={callout.leaderColor}
          strokeWidth={callout.leaderWidth}
          markerStart={callout.leaderStyle === 'arrow' ? `url(#arrowhead-${element.id})` : undefined}
        />
      </svg>
    );
  }

  return (
    <div data-writer-v2-callout-wrapper="true">
      {leaderSvg}
      <WriterRichElementBox
        element={element}
        viewport={viewport}
        selected={selected}
        isEditing={isEditing}
        onBeginDrag={onBeginDrag}
        onUpdateDrag={onUpdateDrag}
        onEndDrag={onEndDrag}
        onDoubleClick={onDoubleClick}
        viewportRect={viewportRect}
      />
    </div>
  );
};
