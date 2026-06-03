import React from 'react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { writerDisplayHtml } from '@/core/writer-v2/editor/writerDisplayHtml';
import { WriterSelectionHandles, type ResizeHandle } from './WriterSelectionHandles';
import { WriterInlineEditor } from './WriterInlineEditor';
import type { WriterEditorSavePayload } from '@/core/writer-v2/editor/writerEditorState';

export interface WriterRichElementBoxProps {
  element: WriterElementV2;
  viewport: WriterPageViewport;
  selected: boolean;
  isEditing: boolean;
  onBeginDrag: (event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize', handle?: ResizeHandle) => void;
  onUpdateDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEndDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  viewportRect: { x: number; y: number; width: number; height: number };
  onSave?: (payload: WriterEditorSavePayload) => void;
  onCancel?: () => void;
}

export const WriterRichElementBox: React.FC<WriterRichElementBoxProps> = ({
  element,
  selected,
  isEditing,
  onBeginDrag,
  onUpdateDrag,
  onEndDrag,
  onClick,
  onDoubleClick,
  viewportRect,
  onSave,
  onCancel,
}) => {
  return (
    <div
      data-writer-v2-element-id={element.id}
      aria-label={`Writer element ${element.id}`}
      onClick={onClick}
      onMouseDown={(event) => {
        const target = event.target;
        if (
          event.detail < 2 ||
          (target instanceof HTMLElement && target.closest('[data-writer-v2-resize-handle]'))
        ) {
          return;
        }
        onDoubleClick(event);
      }}
      onDoubleClick={onDoubleClick}
      onPointerDown={isEditing ? undefined : (event) => onBeginDrag(event, 'move')}
      onPointerMove={isEditing ? undefined : onUpdateDrag}
      onPointerUp={isEditing ? undefined : onEndDrag}
      onPointerCancel={isEditing ? undefined : onEndDrag}
      style={{
        position: 'absolute',
        left: viewportRect.x,
        top: viewportRect.y,
        width: viewportRect.width,
        height: viewportRect.height,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isEditing ? 'text' : element.locked ? 'not-allowed' : 'move',
        zIndex: element.style.zIndex,
        background: element.style.backgroundColor ?? 'rgba(255,255,255,0.88)',
        border: `${element.style.borderWidth ?? 1}px solid ${element.style.borderColor ?? '#2563eb'}`,
        opacity: element.style.opacity ?? 1,
        padding: element.style.padding ?? 8,
        overflow: 'hidden',
        color: element.style.textColor ?? '#111827',
        fontSize: element.style.fontSize ?? 13,
        fontFamily: element.style.fontFamily ?? 'inherit',
        lineHeight: 1.35,
        userSelect: isEditing ? 'text' : 'none',
      }}
    >
      {isEditing && onSave && onCancel ? (
        <WriterInlineEditor
          element={element}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : element.editorStateJson ? (
        <div
          data-writer-v2-display-content="true"
          style={{ pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{
            __html: writerDisplayHtml(element.editorStateJson, element.plainText) || '<span style="color:#9ca3af">Double-click to edit</span>',
          }}
        />
      ) : (
        <div
          data-writer-v2-display-content="true"
          style={{ pointerEvents: 'none', whiteSpace: 'pre-wrap' }}
        >
          {element.plainText || 'Double-click to edit'}
        </div>
      )}

      {selected && !isEditing ? (
        <WriterSelectionHandles
          onResizePointerDown={(event, handle) => onBeginDrag(event, 'resize', handle)}
        />
      ) : null}
    </div>
  );
};
