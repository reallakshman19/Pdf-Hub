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
import { WriterPopupEditor } from './WriterPopupEditor';
import { WriterCalloutElement } from './WriterCalloutElement';
import { WriterRichElementBox } from './WriterRichElementBox';

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

  const commonProps = {
    element,
    viewport,
    selected,
    isEditing,
    onBeginDrag: beginDrag,
    onUpdateDrag: updateDrag,
    onEndDrag: endDrag,
    onDoubleClick: openEditor,
    viewportRect,
  };

  return (
    <>
      {element.type === 'textCallout' ? (
        <WriterCalloutElement {...commonProps} />
      ) : (
        <WriterRichElementBox {...commonProps} />
      )}

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
                assetIds: payload.assets?.length
                  ? [
                      ...(element.assetIds ?? []),
                      ...payload.assets.map((asset) => asset.id),
                    ]
                  : element.assetIds,
              },
            });

            endEditingWriterElement();
          }}
        />
      ) : null}
    </>
  );
};
