import type { WriterElementV2, WriterTableCellStyle, WriterTableBorder } from '../types';
import type { WriterCommand } from '../writerCommands';
import type { WriterTableSelection } from './writerTableSelection';
import {
  applyWriterTableCellStyle,
  resizeWriterTableColumn,
  resizeWriterTableRow,
  setWriterTableCellBorder,
  setWriterTableCellFill,
  setWriterTableCellHorizontalAlignment,
  setWriterTableCellPadding,
  setWriterTableCellVerticalAlignment,
  setWriterTableHeaderRow,
  updateWriterTableCellText,
} from './writerTableStyleActions';
import {
  deleteWriterTableColumn,
  deleteWriterTableRow,
  insertWriterTableColumn,
  insertWriterTableRow,
  mergeWriterTableCells,
  normalizeWriterTableElement,
  splitWriterTableCell,
} from './writerTableStructureActions';

export interface WriterTableCommandBridgeResult {
  command: WriterCommand | null;
  changed: boolean;
  message: string;
}

export function buildApplyTableCellStyleCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  patch: WriterTableCellStyle,
): WriterTableCommandBridgeResult {
  const result = applyWriterTableCellStyle(elements, selection, patch);

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableCellHorizontalAlignmentCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  alignment: NonNullable<WriterTableCellStyle['alignment']>,
): WriterTableCommandBridgeResult {
  const result = setWriterTableCellHorizontalAlignment(
    elements,
    selection,
    alignment,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableCellVerticalAlignmentCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  verticalAlign: NonNullable<WriterTableCellStyle['verticalAlign']>,
): WriterTableCommandBridgeResult {
  const result = setWriterTableCellVerticalAlignment(
    elements,
    selection,
    verticalAlign,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableCellFillCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  backgroundColor: string | undefined,
): WriterTableCommandBridgeResult {
  const result = setWriterTableCellFill(
    elements,
    selection,
    backgroundColor,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableCellPaddingCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  padding: number,
): WriterTableCommandBridgeResult {
  const result = setWriterTableCellPadding(
    elements,
    selection,
    padding,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableCellBorderCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  side: 'top' | 'right' | 'bottom' | 'left' | 'all',
  border: WriterTableBorder,
): WriterTableCommandBridgeResult {
  const result = setWriterTableCellBorder(
    elements,
    selection,
    side,
    border,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSetTableHeaderRowCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  hasHeaderRow: boolean,
): WriterTableCommandBridgeResult {
  const result = setWriterTableHeaderRow(
    elements,
    tableElementId,
    hasHeaderRow,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildResizeTableColumnCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  columnId: string,
  width: number,
): WriterTableCommandBridgeResult {
  const result = resizeWriterTableColumn(
    elements,
    tableElementId,
    columnId,
    width,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildResizeTableRowCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  height: number,
): WriterTableCommandBridgeResult {
  const result = resizeWriterTableRow(
    elements,
    tableElementId,
    rowIndex,
    height,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildUpdateTableCellTextCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  columnIndex: number,
  text: string,
): WriterTableCommandBridgeResult {
  const result = updateWriterTableCellText(
    elements,
    tableElementId,
    rowIndex,
    columnIndex,
    text,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildNormalizeTableCommand(
  elements: WriterElementV2[],
  tableElementId: string,
): WriterTableCommandBridgeResult {
  const result = normalizeWriterTableElement(elements, tableElementId);

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildInsertTableRowCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  position: 'above' | 'below',
): WriterTableCommandBridgeResult {
  const result = insertWriterTableRow(
    elements,
    tableElementId,
    rowIndex,
    position,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildDeleteTableRowCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
): WriterTableCommandBridgeResult {
  const result = deleteWriterTableRow(
    elements,
    tableElementId,
    rowIndex,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildInsertTableColumnCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  columnIndex: number,
  position: 'left' | 'right',
): WriterTableCommandBridgeResult {
  const result = insertWriterTableColumn(
    elements,
    tableElementId,
    columnIndex,
    position,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildDeleteTableColumnCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  columnIndex: number,
): WriterTableCommandBridgeResult {
  const result = deleteWriterTableColumn(
    elements,
    tableElementId,
    columnIndex,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

export function buildMergeTableCellsCommand(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
): WriterTableCommandBridgeResult {
  const result = mergeWriterTableCells(elements, selection);

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    selection.elementId,
    result.changed,
    result.message,
  );
}

export function buildSplitTableCellCommand(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  columnIndex: number,
): WriterTableCommandBridgeResult {
  const result = splitWriterTableCell(
    elements,
    tableElementId,
    rowIndex,
    columnIndex,
  );

  return toSingleElementUpdateCommand(
    elements,
    result.elements,
    tableElementId,
    result.changed,
    result.message,
  );
}

function toSingleElementUpdateCommand(
  previousElements: WriterElementV2[],
  nextElements: WriterElementV2[],
  elementId: string,
  changed: boolean,
  message: string,
): WriterTableCommandBridgeResult {
  if (!changed) {
    return {
      command: null,
      changed: false,
      message,
    };
  }

  const previous = previousElements.find((element) => element.id === elementId);
  const next = nextElements.find((element) => element.id === elementId);

  if (!previous || !next || previous === next) {
    return {
      command: null,
      changed: false,
      message: 'No table update command was generated.',
    };
  }

  return {
    changed: true,
    message,
    command: {
      type: 'UPDATE_WRITER_ELEMENT',
      id: elementId,
      patch: {
        tableData: next.tableData,
        updatedAt: next.updatedAt,
      },
      now: next.updatedAt,
    },
  };
}
