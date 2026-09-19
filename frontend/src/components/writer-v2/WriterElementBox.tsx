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
import { applyWriterRectSnap } from '@/core/writer-v2/writerSnapGuides';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  dispatchDurableWriterUiCommand,
} from '@/core/writer-v2/durableWriterUiDispatch';
import { WriterCalloutElement } from './WriterCalloutElement';
import { WriterRichElementBox } from './WriterRichElementBox';
import type { ResizeHandle } from './WriterSelectionHandles';

interface DragState {
  mode: 'move' | 'resize';
  handle?: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startViewportRect: ViewportRect;
  pointerId: number;
  /**
   * Pointer capture is deferred until the pointer actually moves past a small
   * threshold. Capturing on pointerdown suppresses the browser's dblclick
   * synthesis in Chromium, which breaks double-click-to-edit.
   */
  captured: boolean;
}

// Minimum movement (in client pixels) before a pointerdown is treated as a drag.
const DRAG_THRESHOLD_PX = 3;
const DOUBLE_CLICK_WINDOW_MS = 400;

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
  const documentMeta = useWriterV2Store((state) => state.documentMeta);
  const beginEditingWriterElement = useWriterV2Store((state) => state.beginEditingWriterElement);
  const endEditingWriterElement = useWriterV2Store((state) => state.endEditingWriterElement);

  const [draftRectState, setDraftRectState] = React.useState<{ rectKey: string; rect: PdfRect } | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  // Timestamp of the last non-drag pointerup, used to detect double-clicks
  // manually. The native `dblclick` event is unreliable on an element that also
  // handles pointer-drag interactions, so we open the editor from the pointer
  // events (which always fire) rather than depending on `dblclick`.
  const lastClickAtRef = React.useRef(0);
  const lastPointerDownAtRef = React.useRef(0);
  const rectKey = `${element.rect.x},${element.rect.y},${element.rect.width},${element.rect.height}`;
  const draftRect = draftRectState?.rectKey === rectKey ? draftRectState.rect : null;
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

    if (mode === 'move') {
      const now = event.timeStamp || Date.now();
      if (
        lastPointerDownAtRef.current > 0
        && now - lastPointerDownAtRef.current <= DOUBLE_CLICK_WINDOW_MS
      ) {
        lastPointerDownAtRef.current = 0;
        lastClickAtRef.current = 0;
        dragRef.current = null;
        event.preventDefault();
        beginEditingWriterElement(element.id);
        return;
      }
      lastPointerDownAtRef.current = now;
    }

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
      pointerId: event.pointerId,
      // For resize, capture immediately: handles are positioned *outside* the
      // box div (negative offsets), so the pointer leaves the box before the
      // threshold in updateDrag is ever reached, breaking resize.
      // For move, capture is deferred so a plain click/double-click (which never
      // moves past the threshold) still triggers the manual dblclick detection
      // in endDrag without capturing and consuming the pointer events.
      captured: mode === 'resize',
    };

    if (mode === 'resize') {
      // Capture immediately so pointer events route to the box even when the
      // mouse leaves the box boundary mid-resize.
      const target = event.currentTarget;
      const box = target.closest('[data-writer-v2-element-id]') as HTMLDivElement | null;
      (box ?? target).setPointerCapture?.(event.pointerId);
    }
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    // Ignore tiny pointer jitter so plain clicks/double-clicks are preserved.
    if (!drag.captured) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
        return;
      }
      lastPointerDownAtRef.current = 0;
      lastClickAtRef.current = 0;
      drag.captured = true;
      const container = event.currentTarget.closest('[data-writer-v2-element-id]') as HTMLDivElement | null;
      if (container) {
        container.setPointerCapture?.(drag.pointerId);
      } else {
        event.currentTarget.setPointerCapture?.(drag.pointerId);
      }
    }

    event.stopPropagation();
    event.preventDefault();

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

    const nextPdfRect = viewportRectToPdfRect(nextViewportRect, viewport);
    const snappedRect = drag.mode === 'move'
      ? applyWriterRectSnap(nextPdfRect, {
          pageWidth: viewport.pdfWidth,
          pageHeight: viewport.pdfHeight,
          margins: documentMeta?.mode === 'blankDocument'
            ? {
                top: documentMeta.pageSetup.marginTop,
                right: documentMeta.pageSetup.marginRight,
                bottom: documentMeta.pageSetup.marginBottom,
                left: documentMeta.pageSetup.marginLeft,
              }
            : undefined,
        }).rect
      : nextPdfRect;

    setDraftRectState({
      rectKey,
      rect: snappedRect,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.captured) {
      const container = event.currentTarget.closest('[data-writer-v2-element-id]') as HTMLDivElement | null;
      if (container) {
        container.releasePointerCapture?.(event.pointerId);
      } else {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    }

    const finalRect = draftRect ?? element.rect;
    dragRef.current = null;
    setDraftRectState(null);

    // A pointerdown that never moved is a click/double-click, not a drag —
    // don't emit a no-op move/resize command. Detect the double-click here
    // (rather than relying on the native `dblclick`, which is unreliable on a
    // drag-handling element) and open the inline editor.
    if (!drag.captured) {
      if (!element.locked && !element.hidden && !isEditing) {
        const now = event.timeStamp || Date.now();
        if (now - lastClickAtRef.current <= DOUBLE_CLICK_WINDOW_MS) {
          lastClickAtRef.current = 0;
          lastPointerDownAtRef.current = 0;
          beginEditingWriterElement(element.id);
        } else {
          lastClickAtRef.current = now;
        }
      }
      return;
    }

    const pageBounds = {
      x: 0,
      y: 0,
      width: viewport.pdfWidth,
      height: viewport.pdfHeight,
    };

    if (drag.mode === 'move') {
      const startPdfRect = viewportRectToPdfRect(drag.startViewportRect, viewport);
      void dispatchDurableWriterUiCommand(
        {
          type: 'MOVE_WRITER_ELEMENT',
          id: element.id,
          dx:
            finalRect.x - startPdfRect.x,
          dy:
            finalRect.y - startPdfRect.y,
          pageBounds,
        },
        'WriterElementBox drag move',
      ).catch(() => undefined);
    } else {
      void dispatchDurableWriterUiCommand(
        {
          type: 'RESIZE_WRITER_ELEMENT',
          id: element.id,
          rect: finalRect,
          pageBounds,
        },
        'WriterElementBox drag resize',
      ).catch(() => undefined);
    }
  };

  const openEditor = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();

    dragRef.current = null;
    setDraftRectState(null);
    lastClickAtRef.current = 0;
    lastPointerDownAtRef.current = 0;
    beginEditingWriterElement(element.id);
  };

  const handleSave = React.useCallback(async (
    payload: import('@/core/writer-v2/editor/writerEditorState').WriterEditorSavePayload,
  ) => {
    const store = useWriterV2Store.getState();
    const previousDirty = store.dirty;
    const addedAssetIds =
      payload.assets?.map((asset) => asset.id)
      ?? [];

    if (payload.assets?.length) {
      store.addWriterAssets(payload.assets);
    }

    try {
      const result =
        await dispatchDurableWriterUiCommand(
          {
            type: 'UPDATE_WRITER_ELEMENT',
            id: element.id,
            now: new Date().toISOString(),
            patch: {
              editorStateJson:
                payload.editorStateJson,
              plainText: payload.plainText,
              assetIds:
                payload.assets?.length
                  ? [
                      ...(element.assetIds ?? []),
                      ...addedAssetIds,
                    ]
                  : element.assetIds,
            },
          },
          'WriterElementBox editor save',
        );

      if (!result.changed && addedAssetIds.length > 0) {
        for (const assetId of addedAssetIds) {
          useWriterV2Store
            .getState()
            .removeWriterAsset(assetId);
        }
        useWriterV2Store.setState({
          dirty: previousDirty,
        });
      }

      endEditingWriterElement();
    } catch {
      for (const assetId of addedAssetIds) {
        useWriterV2Store
          .getState()
          .removeWriterAsset(assetId);
      }
      useWriterV2Store.setState({
        dirty: previousDirty,
      });
    }
  }, [
    element.id,
    element.assetIds,
    endEditingWriterElement,
  ]);

  const commonProps = {
    element,
    viewport,
    selected,
    isEditing,
    onBeginDrag: beginDrag,
    onUpdateDrag: updateDrag,
    onEndDrag: endDrag,
    onClick: undefined,
    onDoubleClick: openEditor,
    viewportRect,
    onSave: handleSave,
    onCancel: endEditingWriterElement,
  };

  return element.type === 'textCallout' ? (
    <WriterCalloutElement {...commonProps} />
  ) : (
    <WriterRichElementBox {...commonProps} />
  );
};
