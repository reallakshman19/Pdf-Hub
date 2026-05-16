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
import type { ResizeHandle } from './WriterSelectionHandles';

interface DragState {
  mode: 'move' | 'resize';
  handle?: ResizeHandle;
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
  const dragRef = React.useRef<DragState | null>(null);

  React.useEffect(() => {
    setDraftRect(null);
  }, [element.rect.x, element.rect.y, element.rect.width, element.rect.height]);

  const effectiveRect = draftRect ?? element.rect;
  const viewportRect = pdfRectToViewportRect(effectiveRect, viewport);
  const isEditing = editingId === element.id;

  const beginDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: 'move' | 'resize',
    handle?: ResizeHandle,
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
      handle,
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

    let nextViewportRect: ViewportRect;

    if (drag.mode === 'move') {
      nextViewportRect = {
        ...drag.startViewportRect,
        x: drag.startViewportRect.x + dx,
        y: drag.startViewportRect.y + dy,
      };
    } else {
      const { x, y, width, height } = drag.startViewportRect;
      const handle = drag.handle ?? 'se';

      // Compute new rect depending on which edge/corner is being dragged
      let newX = x;
      let newY = y;
      let newW = width;
      let newH = height;

      if (handle.includes('e')) { newW = Math.max(12, width + dx); }
      if (handle.includes('w')) { newX = x + dx; newW = Math.max(12, width - dx); }
      if (handle.includes('s')) { newH = Math.max(12, height + dy); }
      if (handle.includes('n')) { newY = y + dy; newH = Math.max(12, height - dy); }

      nextViewportRect = { x: newX, y: newY, width: newW, height: newH };
    }

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

    const pageBounds = {
      x: 0,
      y: 0,
      width: viewport.pdfWidth,
      height: viewport.pdfHeight,
    };

    if (drag.mode === 'move') {
      const startPdfRect = viewportRectToPdfRect(drag.startViewportRect, viewport);
      dispatchWriterCommand({
        type: 'MOVE_WRITER_ELEMENT',
        id: element.id,
        dx: finalRect.x - startPdfRect.x,
        dy: finalRect.y - startPdfRect.y,
        pageBounds,
      });
    } else {
      dispatchWriterCommand({
        type: 'RESIZE_WRITER_ELEMENT',
        id: element.id,
        rect: finalRect,
        pageBounds,
      });
    }
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
            if (payload.assets?.length) {
              useWriterV2Store.getState().addWriterAssets(payload.assets);
            }

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
