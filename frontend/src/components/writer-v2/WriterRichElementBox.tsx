import React from 'react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { WriterSelectionHandles } from './WriterSelectionHandles';

export interface WriterRichElementBoxProps {
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

export const WriterRichElementBox: React.FC<WriterRichElementBoxProps> = ({
  element,
  selected,
  isEditing,
  onBeginDrag,
  onUpdateDrag,
  onEndDrag,
  onDoubleClick,
  viewportRect,
}) => {
  return (
    <div
      data-writer-v2-element-id={element.id}
      aria-label={`Writer element ${element.id}`}
      onDoubleClick={onDoubleClick}
      onPointerDown={(event) => onBeginDrag(event, 'move')}
      onPointerMove={onUpdateDrag}
      onPointerUp={onEndDrag}
      onPointerCancel={onEndDrag}
      style={{
        position: 'absolute',
        left: viewportRect.x,
        top: viewportRect.y,
        width: viewportRect.width,
        height: viewportRect.height,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: element.locked ? 'not-allowed' : 'move',
        zIndex: element.style.zIndex,
        background: element.style.backgroundColor ?? 'rgba(255,255,255,0.88)',
        border: `${element.style.borderWidth ?? 1}px solid ${element.style.borderColor ?? '#2563eb'}`,
        opacity: element.style.opacity ?? 1,
        padding: element.style.padding ?? 8,
        overflow: 'hidden',
        color: '#111827',
        fontSize: 13,
        lineHeight: 1.35,
        userSelect: 'none',
      }}
    >
      <div
        data-writer-v2-display-content="true"
        style={{
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
        }}
      >
        {element.plainText || 'Double-click to edit'}
      </div>

      {selected && !isEditing ? (
        <WriterSelectionHandles
          onResizePointerDown={(event) => onBeginDrag(event, 'resize')}
        />
      ) : null}
    </div>
  );
};
