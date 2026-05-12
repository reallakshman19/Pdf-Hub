import React from 'react';
import type {
  PdfRect,
  ViewportRect,
  WriterElementV2,
  WriterPageViewport,
} from '@/core/writer-v2/types';
import {
  pdfRectToViewportRect,
  viewportRectToPdfRect,
} from '@/core/writer-v2/coordinateTransform';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterSelectionHandles } from './WriterSelectionHandles';
import { WriterPopupEditor } from './WriterPopupEditor';

interface DragState {
  mode: 'move' | 'resize';
  startClientX: number;
  startClientY: number;
  startViewportRect: ViewportRect;
}

export interface WriterElementBoxProps {
  element: WriterElementV2;
  viewport: WriterPageViewport;
  selected: boolean;
}

export const WriterElementBox: React.FC<WriterElementBoxProps> = ({
  element,
  viewport,
  selected,
}) => {
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const editingId = useWriterV2Store((state) => state.editingId);
  const beginEditingWriterElement = useWriterV2Store((state) => state.beginEditingWriterElement);
  const endEditingWriterElement = useWriterV2Store((state) => state.endEditingWriterElement);

  const [draftRect, setDraftRect] = React.useState<PdfRect | null>(null);
  const [lastSourceRect, setLastSourceRect] = React.useState<PdfRect>(element.rect);
  const dragRef = React.useRef<DragState | null>(null);

  if (
    lastSourceRect.x !== element.rect.x ||
    lastSourceRect.y !== element.rect.y ||
    lastSourceRect.width !== element.rect.width ||
    lastSourceRect.height !== element.rect.height
  ) {
    setLastSourceRect(element.rect);
    setDraftRect(null);
  }

  const effectiveRect = draftRect ?? element.rect;
  const viewportRect = pdfRectToViewportRect(effectiveRect, viewport);
  const isEditing = editingId === element.id;

  const beginDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: 'move' | 'resize',
  ) => {
    if (element.locked || element.hidden || isEditing) return;

    event.stopPropagation();
    event.preventDefault();

    dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: element.id,
    });

    dragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewportRect: pdfRectToViewportRect(element.rect, viewport),
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    event.stopPropagation();
    event.preventDefault();

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    const nextViewportRect: ViewportRect = drag.mode === 'move'
      ? {
          ...drag.startViewportRect,
          x: drag.startViewportRect.x + dx,
          y: drag.startViewportRect.y + dy,
        }
      : {
          ...drag.startViewportRect,
          width: Math.max(12, drag.startViewportRect.width + dx),
          height: Math.max(12, drag.startViewportRect.height + dy),
        };

    setDraftRect(viewportRectToPdfRect(nextViewportRect, viewport));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    event.stopPropagation();
    event.preventDefault();

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const finalRect = draftRect ?? element.rect;
    dragRef.current = null;
    setDraftRect(null);

    dispatchWriterCommand({
      type: 'RESIZE_WRITER_ELEMENT',
      id: element.id,
      rect: finalRect,
      pageBounds: {
        x: 0,
        y: 0,
        width: viewport.pdfWidth,
        height: viewport.pdfHeight,
      },
    });
  };

  const openEditor = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();

    beginEditingWriterElement(element.id);
  };

  return (
    <>
      <div
        data-writer-v2-element-id={element.id}
        aria-label={`Writer element ${element.id}`}
        onDoubleClick={openEditor}
        onPointerDown={(event) => beginDrag(event, 'move')}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
            onResizePointerDown={(event) => beginDrag(event, 'resize')}
          />
        ) : null}
      </div>

      {isEditing ? (
        <WriterPopupEditor
          element={element}
          onCancel={endEditingWriterElement}
          onSave={(payload) => {
            dispatchWriterCommand({
              type: 'UPDATE_WRITER_ELEMENT',
              id: element.id,
              now: new Date().toISOString(),
              patch: {
                editorStateJson: payload.editorStateJson,
                plainText: payload.plainText,
              },
            });

            endEditingWriterElement();
          }}
        />
      ) : null}
    </>
  );
};
