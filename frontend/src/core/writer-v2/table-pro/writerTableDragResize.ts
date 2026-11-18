import type {
  WriterElementV2,
} from '../types';
import type {
  WriterTableCommandBridgeResult,
} from './writerTableCommandBridge';
import {
  buildResizeTableRowCommand,
} from './writerTableCommandBridge';
import {
  computeResizedColumnWidths,
} from './writerTableGeometry';

export type WriterTableResizeDrag =
  | {
      type: 'resize-column';
      /** Captured at gesture start; prevents stale paste-like table targeting. */
      documentFingerprint?: string;
      columnIds?: string[];
      columnIndex: number;
      startX: number;
      initialWidths: number[];
    }
  | {
      type: 'resize-row';
      documentFingerprint?: string;
      rowId?: string;
      rowIndex: number;
      startY: number;
      initialHeight: number;
    };

export function buildWriterTableDragResizeCommand(
  input: {
    drag: WriterTableResizeDrag;
    point: { x: number; y: number };
    elements: WriterElementV2[];
    elementId: string;
  },
): WriterTableCommandBridgeResult {
  const element = input.elements.find(
    (item) => item.id === input.elementId,
  );

  if (
    !element?.tableData
    || element.locked
    || element.hidden
    || (
      input.drag.documentFingerprint
      && input.drag.documentFingerprint !== element.documentFingerprint
    )
  ) {
    return {
      command: null,
      changed: false,
      message:
        'Writer table resize target is unavailable or belongs to a different document.',
    };
  }

  if (input.drag.type === 'resize-column') {
    const columns = element.tableData.columns;
    const index = input.drag.columnIndex;
    // A drag moves the common boundary between two columns. Never admit
    // only the left-hand update: it changes the entire table width and
    // invalidates the pointer's observed geometry.
    if (
      index < 0
      || index + 1 >= columns.length
      || input.drag.initialWidths.length !== columns.length
      || (
        input.drag.columnIds
        && columns.some((column, i) => input.drag.type === 'resize-column'
          && column.id !== input.drag.columnIds?.[i])
      )
    ) {
      return {
        command: null,
        changed: false,
        message: 'Writer table column structure changed during resize.',
      };
    }

    const delta = input.point.x - input.drag.startX;
    const nextWidths = computeResizedColumnWidths({
      currentWidths: input.drag.initialWidths,
      columnIndex: index,
      delta,
    });
    if (
      nextWidths.some((width) => !Number.isFinite(width) || width <= 0)
      || nextWidths.every((width, i) => width === input.drag.initialWidths[i])
    ) {
      return {
        command: null,
        changed: false,
        message: 'Writer table column resize did not change valid widths.',
      };
    }

    // Persist the complete visual width vector in ONE canonical command.
    // This is critical when column source weights were normalized to the
    // current viewport; a one-column patch causes re-normalization drift.
    return {
      command: {
        type: 'UPDATE_WRITER_ELEMENT',
        id: element.id,
        patch: {
          tableData: {
            ...element.tableData,
            columns: columns.map((column, i) => ({
              ...column,
              width: nextWidths[i],
            })),
          },
        },
      },
      changed: true,
      message: 'Table adjacent columns resized together.',
    };
  }

  if (
    input.drag.rowId
    && element.tableData.rows[input.drag.rowIndex]?.id !== input.drag.rowId
  ) {
    return {
      command: null,
      changed: false,
      message: 'Writer table row structure changed during resize.',
    };
  }

  const delta =
    input.drag.startY - input.point.y;
  const nextHeight = Math.max(
    8,
    input.drag.initialHeight + delta,
  );

  return buildResizeTableRowCommand(
    input.elements,
    input.elementId,
    input.drag.rowIndex,
    nextHeight,
  );
}
