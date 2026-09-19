import type {
  WriterElementV2,
} from '../types';
import type {
  WriterTableCommandBridgeResult,
} from './writerTableCommandBridge';
import {
  buildResizeTableColumnCommand,
  buildResizeTableRowCommand,
} from './writerTableCommandBridge';
import {
  computeResizedColumnWidths,
} from './writerTableGeometry';

export type WriterTableResizeDrag =
  | {
      type: 'resize-column';
      columnIndex: number;
      startX: number;
      initialWidths: number[];
    }
  | {
      type: 'resize-row';
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

  if (!element?.tableData) {
    return {
      command: null,
      changed: false,
      message:
        'Writer table resize target is unavailable.',
    };
  }

  if (input.drag.type === 'resize-column') {
    const delta =
      input.point.x - input.drag.startX;
    const nextWidths =
      computeResizedColumnWidths({
        currentWidths:
          input.drag.initialWidths,
        columnIndex:
          input.drag.columnIndex,
        delta,
      });
    const column =
      element.tableData.columns[
        input.drag.columnIndex
      ];

    if (!column) {
      return {
        command: null,
        changed: false,
        message:
          'Writer table column is unavailable.',
      };
    }

    return buildResizeTableColumnCommand(
      input.elements,
      input.elementId,
      column.id,
      nextWidths[input.drag.columnIndex],
    );
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
