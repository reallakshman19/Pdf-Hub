import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type {
  WriterTableCellAddress,
  WriterTableSelection,
} from '@/core/writer-v2/table-pro/writerTableSelection';
import {
  computeResizedColumnWidths,
  computeWriterTableGridLayout,
  createTableSelectionFromDrag,
  createTableSelectionFromHit,
  hitTestWriterTableCell,
  hitTestWriterTableResizeHandle,
} from '@/core/writer-v2/table-pro/writerTableGeometry';
import {
  buildResizeTableColumnCommand,
  buildResizeTableRowCommand,
} from '@/core/writer-v2/table-pro/writerTableCommandBridge';

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
    }
  | {
      type: 'resize-row';
      pointerId: number;
      rowIndex: number;
      startY: number;
      initialHeight: number;
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
  const elements = useWriterV2Store((state) => state.elements);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const [dragState, setDragState] = React.useState<DragState | null>(null);

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
      const delta = point.x - dragState.startX;
      const nextWidths = computeResizedColumnWidths({
        currentWidths: dragState.initialWidths,
        columnIndex: dragState.columnIndex,
        delta,
      });

      const column = element.tableData?.columns[dragState.columnIndex];

      if (!column) return;

      const result = buildResizeTableColumnCommand(
        elements,
        element.id,
        column.id,
        nextWidths[dragState.columnIndex],
      );

      if (result.command) {
        dispatchWriterCommand(result.command);
      }

      return;
    }

    if (dragState.type === 'resize-row') {
      const delta = dragState.startY - point.y;
      const nextHeight = Math.max(8, dragState.initialHeight + delta);

      const result = buildResizeTableRowCommand(
        elements,
        element.id,
        dragState.rowIndex,
        nextHeight,
      );

      if (result.command) {
        dispatchWriterCommand(result.command);
      }
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="absolute inset-0"
      data-writer-table-interaction-overlay="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
