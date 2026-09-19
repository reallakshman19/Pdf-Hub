import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type {
  WriterTableCellAddress,
  WriterTableSelection,
} from '@/core/writer-v2/table-pro/writerTableSelection';
import {
  computeWriterTableGridLayout,
  createTableSelectionFromDrag,
  createTableSelectionFromHit,
  hitTestWriterTableCell,
  hitTestWriterTableResizeHandle,
} from '@/core/writer-v2/table-pro/writerTableGeometry';
import {
  buildWriterTableDragResizeCommand,
} from '@/core/writer-v2/table-pro/writerTableDragResize';
import {
  dispatchDurableWriterUiCommand,
} from '@/core/writer-v2/durableWriterUiDispatch';

export interface WriterTableInteractionOverlayProps {
  element: WriterElementV2;
  /**
   * Local rendered table rectangle in the same coordinate system as pointer events.
   * Usually this is the rendered overlay box rect, not raw PDF rect.
   */
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Convert pointer event to the local coordinate system used by rect.
   */
  getLocalPoint: (event: React.PointerEvent<HTMLElement>) => {
    x: number;
    y: number;
  };
  selection: WriterTableSelection | null;
  onSelectionChange: (selection: WriterTableSelection | null) => void;
}

type DragState =
  | {
      type: 'select';
      pointerId: number;
      anchor: WriterTableCellAddress;
    }
  | {
      type: 'resize-column';
      pointerId: number;
      columnIndex: number;
      startX: number;
      initialWidths: number[];
      previewX: number;
    }
  | {
      type: 'resize-row';
      pointerId: number;
      rowIndex: number;
      startY: number;
      initialHeight: number;
      previewY: number;
    };

export const WriterTableInteractionOverlay: React.FC<
  WriterTableInteractionOverlayProps
> = ({
  element,
  rect,
  getLocalPoint,
  selection,
  onSelectionChange,
}) => {
  const [dragState, setDragState] =
    React.useState<DragState | null>(null);

  const layout = React.useMemo(() => {
    return computeWriterTableGridLayout({
      element,
      rect,
    });
  }, [element, rect]);

  if (!layout || !element.tableData) {
    return null;
  }

  const selectedKeys = new Set(
    selection?.elementId === element.id
      ? selection.cells.map((cell) => `${cell.rowIndex}:${cell.columnIndex}`)
      : [],
  );

  const mergedMasterSelectedKeys = new Set<string>();

  if (selection?.elementId === element.id && element.tableData) {
    for (const selected of selection.cells) {
      const selectedCell = element.tableData.rows[selected.rowIndex]?.cells[selected.columnIndex];

      if (selectedCell?.mergedInto) {
        mergedMasterSelectedKeys.add(
          `${selectedCell.mergedInto.rowIndex}:${selectedCell.mergedInto.columnIndex}`,
        );
      }
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: element.id,
    });

    const point = getLocalPoint(event);
    const resizeHit = hitTestWriterTableResizeHandle(layout, point);

    event.currentTarget.setPointerCapture(event.pointerId);

    if (resizeHit?.type === 'column') {
      setDragState({
        type: 'resize-column',
        pointerId: event.pointerId,
        columnIndex: resizeHit.index,
        startX: point.x,
        initialWidths: [...layout.columnWidths],
        previewX: point.x,
      });
      return;
    }

    if (resizeHit?.type === 'row') {
      const row = element.tableData?.rows[resizeHit.index];

      setDragState({
        type: 'resize-row',
        pointerId: event.pointerId,
        rowIndex: resizeHit.index,
        startY: point.y,
        initialHeight: row?.height ?? layout.rowHeight,
        previewY: point.y,
      });
      return;
    }

    const hit = hitTestWriterTableCell(layout, point);

    if (!hit) {
      onSelectionChange(null);
      return;
    }

    const address = {
      ...hit,
      elementId: element.id,
    };

    onSelectionChange(
      createTableSelectionFromHit({
        elementId: element.id,
        address,
      }),
    );

    setDragState({
      type: 'select',
      pointerId: event.pointerId,
      anchor: address,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    const point = getLocalPoint(event);

    if (dragState.type === 'select') {
      const hit = hitTestWriterTableCell(layout, point);

      if (!hit) return;

      onSelectionChange(
        createTableSelectionFromDrag({
          elementId: element.id,
          anchor: dragState.anchor,
          current: {
            ...hit,
            elementId: element.id,
          },
        }),
      );

      return;
    }

    if (dragState.type === 'resize-column') {
      setDragState((current) =>
        current?.type === 'resize-column'
        && current.pointerId === event.pointerId
          ? {
              ...current,
              previewX: point.x,
            }
          : current,
      );
      return;
    }

    if (dragState.type === 'resize-row') {
      setDragState((current) =>
        current?.type === 'resize-row'
        && current.pointerId === event.pointerId
          ? {
              ...current,
              previewY: point.y,
            }
          : current,
      );
    }
  };

  const releasePointer = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  };

  const onPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragState;

    if (!drag || drag.pointerId !== event.pointerId) {
      releasePointer(event);
      return;
    }

    setDragState(null);

    if (
      drag.type === 'resize-column'
      || drag.type === 'resize-row'
    ) {
      const point = getLocalPoint(event);
      const result =
        buildWriterTableDragResizeCommand({
          drag,
          point,
          elements:
            useWriterV2Store.getState().elements,
          elementId: element.id,
        });

      if (result.command) {
        void dispatchDurableWriterUiCommand(
          result.command,
          drag.type === 'resize-column'
            ? 'WriterTableInteractionOverlay column resize'
            : 'WriterTableInteractionOverlay row resize',
        ).catch(() => undefined);
      }
    }

    releasePointer(event);
  };

  const onPointerCancel = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
    releasePointer(event);
  };

  return (
    <div
      className="absolute inset-0"
      data-writer-table-interaction-overlay="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        touchAction: 'none',
      }}
    >
      {layout.cells.map((cell) => {
        const key = `${cell.rowIndex}:${cell.columnIndex}`;
        const selected = selectedKeys.has(key) || mergedMasterSelectedKeys.has(key);

        return (
          <div
            key={key}
            data-writer-table-cell-highlight={selected ? 'true' : 'false'}
            className={[
              'absolute pointer-events-none border',
              selected
                ? 'border-blue-500 bg-blue-500/15'
                : 'border-transparent',
            ].join(' ')}
            style={{
              left: cell.rect.x - rect.x,
              top: rect.height - (cell.rect.y - rect.y) - cell.rect.height,
              width: cell.rect.width,
              height: cell.rect.height,
            }}
          />
        );
      })}

      {dragState?.type === 'resize-column' ? (
        <div
          data-writer-table-resize-preview="column"
          className="absolute top-0 w-px bg-blue-500/70 pointer-events-none"
          style={{
            left:
              dragState.previewX - rect.x,
            height: rect.height,
          }}
        />
      ) : null}

      {dragState?.type === 'resize-row' ? (
        <div
          data-writer-table-resize-preview="row"
          className="absolute left-0 h-px bg-blue-500/70 pointer-events-none"
          style={{
            top:
              rect.height
              - (dragState.previewY - rect.y),
            width: rect.width,
          }}
        />
      ) : null}

      {layout.columnHandles.map((handle) => (
        <div
          key={`col-${handle.columnIndex}`}
          data-writer-table-column-resize-handle="true"
          className="absolute top-0 w-2 -translate-x-1 cursor-col-resize bg-transparent hover:bg-blue-500/25"
          style={{
            left: handle.x - rect.x,
            height: rect.height,
          }}
        />
      ))}

      {layout.rowHandles.map((handle) => (
        <div
          key={`row-${handle.rowIndex}`}
          data-writer-table-row-resize-handle="true"
          className="absolute left-0 h-2 -translate-y-1 cursor-row-resize bg-transparent hover:bg-blue-500/25"
          style={{
            top: rect.height - (handle.y - rect.y),
            width: rect.width,
          }}
        />
      ))}
    </div>
  );
};
