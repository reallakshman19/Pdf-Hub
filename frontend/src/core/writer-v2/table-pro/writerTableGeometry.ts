import type {
  PdfRect,
  WriterElementV2,
  WriterTableData,
} from '../types';
import type {
  WriterTableCellAddress,
  WriterTableSelection,
} from './writerTableSelection';
import {
  createRectangularTableSelection,
  createSingleCellSelection,
} from './writerTableSelection';

export interface WriterTableGridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WriterTableGridCell {
  rowIndex: number;
  columnIndex: number;
  colSpan: number;
  rowSpan: number;
  rect: WriterTableGridRect;
}

export interface WriterTableColumnHandle {
  columnIndex: number;
  x: number;
  y: number;
  height: number;
}

export interface WriterTableRowHandle {
  rowIndex: number;
  x: number;
  y: number;
  width: number;
}

export interface WriterTableGridLayout {
  tableRect: WriterTableGridRect;
  bodyRect: WriterTableGridRect;
  hasHeaderRow: boolean;
  headerHeight: number;

  /**
   * Backward-compatible first body row height.
   */
  rowHeight: number;

  rowHeights: number[];
  columnWidths: number[];
  cells: WriterTableGridCell[];
  columnHandles: WriterTableColumnHandle[];
  rowHandles: WriterTableRowHandle[];
}

export interface WriterTableResizeHit {
  type: 'column' | 'row';
  index: number;
}

export function computeWriterTableGridLayout(input: {
  element: WriterElementV2;
  rect?: PdfRect | WriterTableGridRect;
  minColumnWidth?: number;
  minRowHeight?: number;
  headerHeight?: number;
}): WriterTableGridLayout | null {
  const tableData = input.element.tableData;

  if (!isValidTableData(tableData)) {
    return null;
  }

  const rect = input.rect ?? input.element.rect;
  const minColumnWidth = input.minColumnWidth ?? 16;
  const minRowHeight = input.minRowHeight ?? 16;
  const hasHeaderRow = tableData.hasHeaderRow !== false;
  const headerHeight = hasHeaderRow
    ? Math.max(minRowHeight, input.headerHeight ?? 24)
    : 0;

  const bodyHeight = Math.max(minRowHeight, rect.height - headerHeight);

  const columnWidths = normalizeColumnWidths({
    tableData,
    fallbackTotalWidth: rect.width,
    minColumnWidth,
  });

  const rowHeights = normalizeRowHeights({
    tableData,
    fallbackTotalHeight: bodyHeight,
    minRowHeight,
  });

  const columnX = buildColumnPositions(rect.x, columnWidths);
  const rowY = buildRowBottomPositions({
    bodyTopY: rect.y + bodyHeight,
    rowHeights,
  });

  const cells: WriterTableGridCell[] = [];

  for (let rowIndex = 0; rowIndex < tableData.rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < tableData.columns.length; columnIndex += 1) {
      const cell = tableData.rows[rowIndex]?.cells[columnIndex];

      if (cell?.mergedInto) {
        continue;
      }

      const colSpan = clampSpan(
        cell?.colSpan,
        columnIndex,
        tableData.columns.length,
      );

      const rowSpan = clampSpan(
        cell?.rowSpan,
        rowIndex,
        tableData.rows.length,
      );

      cells.push({
        rowIndex,
        columnIndex,
        colSpan,
        rowSpan,
        rect: {
          x: columnX[columnIndex] ?? rect.x,
          y: rowY[rowIndex + rowSpan - 1] ?? rect.y,
          width: sumSpan(columnWidths, columnIndex, colSpan),
          height: sumSpan(rowHeights, rowIndex, rowSpan),
        },
      });
    }
  }

  const columnHandles: WriterTableColumnHandle[] = [];

  for (let columnIndex = 0; columnIndex < columnWidths.length - 1; columnIndex += 1) {
    columnHandles.push({
      columnIndex,
      x: columnX[columnIndex + 1] ?? rect.x,
      y: rect.y,
      height: rect.height,
    });
  }

  const rowHandles: WriterTableRowHandle[] = [];

  for (let rowIndex = 0; rowIndex < rowHeights.length - 1; rowIndex += 1) {
    rowHandles.push({
      rowIndex,
      x: rect.x,
      y: rowY[rowIndex] ?? rect.y,
      width: rect.width,
    });
  }

  return {
    tableRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    bodyRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: bodyHeight,
    },
    hasHeaderRow,
    headerHeight,
    rowHeight: rowHeights[0] ?? minRowHeight,
    rowHeights,
    columnWidths,
    cells,
    columnHandles,
    rowHandles,
  };
}

export function hitTestWriterTableCell(
  layout: WriterTableGridLayout,
  point: { x: number; y: number },
): WriterTableCellAddress | null {
  for (const cell of layout.cells) {
    if (pointInRect(point, cell.rect)) {
      return {
        elementId: '',
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
      };
    }
  }

  return null;
}

export function hitTestWriterTableResizeHandle(
  layout: WriterTableGridLayout,
  point: { x: number; y: number },
  tolerance = 5,
): WriterTableResizeHit | null {
  for (const handle of layout.columnHandles) {
    if (
      Math.abs(point.x - handle.x) <= tolerance
      && point.y >= handle.y
      && point.y <= handle.y + handle.height
    ) {
      return {
        type: 'column',
        index: handle.columnIndex,
      };
    }
  }

  for (const handle of layout.rowHandles) {
    if (
      Math.abs(point.y - handle.y) <= tolerance
      && point.x >= handle.x
      && point.x <= handle.x + handle.width
    ) {
      return {
        type: 'row',
        index: handle.rowIndex,
      };
    }
  }

  return null;
}

export function createTableSelectionFromDrag(input: {
  elementId: string;
  anchor: WriterTableCellAddress;
  current: WriterTableCellAddress;
}): WriterTableSelection {
  return createRectangularTableSelection({
    elementId: input.elementId,
    startRowIndex: input.anchor.rowIndex,
    startColumnIndex: input.anchor.columnIndex,
    endRowIndex: input.current.rowIndex,
    endColumnIndex: input.current.columnIndex,
  });
}

export function createTableSelectionFromHit(input: {
  elementId: string;
  address: WriterTableCellAddress;
}): WriterTableSelection {
  return createSingleCellSelection(
    input.elementId,
    input.address.rowIndex,
    input.address.columnIndex,
  );
}

export function computeResizedColumnWidths(input: {
  currentWidths: number[];
  columnIndex: number;
  delta: number;
  minColumnWidth?: number;
}): number[] {
  const minColumnWidth = input.minColumnWidth ?? 16;
  const widths = [...input.currentWidths];

  const left = widths[input.columnIndex];
  const right = widths[input.columnIndex + 1];

  if (left === undefined || right === undefined) {
    return widths;
  }

  const nextLeft = Math.max(minColumnWidth, left + input.delta);
  const consumed = nextLeft - left;
  const nextRight = Math.max(minColumnWidth, right - consumed);

  if (nextRight === minColumnWidth && right - consumed < minColumnWidth) {
    const maxDelta = right - minColumnWidth;
    widths[input.columnIndex] = left + maxDelta;
    widths[input.columnIndex + 1] = minColumnWidth;
    return widths;
  }

  widths[input.columnIndex] = nextLeft;
  widths[input.columnIndex + 1] = nextRight;

  return widths;
}

function normalizeColumnWidths(input: {
  tableData: WriterTableData;
  fallbackTotalWidth: number;
  minColumnWidth: number;
}): number[] {
  const columnCount = input.tableData.columns.length;
  const fallbackWidth = Math.max(
    input.minColumnWidth,
    input.fallbackTotalWidth / Math.max(1, columnCount),
  );

  const rawWidths = input.tableData.columns.map((column) =>
    Math.max(input.minColumnWidth, column.width ?? fallbackWidth),
  );

  const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0);

  if (rawTotal <= 0) {
    return input.tableData.columns.map(() => fallbackWidth);
  }

  const scale = input.fallbackTotalWidth / rawTotal;

  return rawWidths.map((width) =>
    Math.max(input.minColumnWidth, width * scale),
  );
}

function normalizeRowHeights(input: {
  tableData: WriterTableData;
  fallbackTotalHeight: number;
  minRowHeight: number;
}): number[] {
  const rowCount = Math.max(1, input.tableData.rows.length);
  const fallbackHeight = Math.max(
    input.minRowHeight,
    input.fallbackTotalHeight / rowCount,
  );

  const rawHeights = input.tableData.rows.map((row) =>
    Math.max(input.minRowHeight, row.height ?? fallbackHeight),
  );

  const rawTotal = rawHeights.reduce((sum, height) => sum + height, 0);

  if (rawTotal <= 0) {
    return input.tableData.rows.map(() => fallbackHeight);
  }

  const scale = input.fallbackTotalHeight / rawTotal;

  return rawHeights.map((height) =>
    Math.max(input.minRowHeight, height * scale),
  );
}

function buildColumnPositions(
  startX: number,
  columnWidths: number[],
): number[] {
  const positions: number[] = [];
  let x = startX;

  for (const width of columnWidths) {
    positions.push(x);
    x += width;
  }

  return positions;
}

function buildRowBottomPositions(input: {
  bodyTopY: number;
  rowHeights: number[];
}): number[] {
  const positions: number[] = [];
  let topY = input.bodyTopY;

  for (const height of input.rowHeights) {
    const bottomY = topY - height;
    positions.push(bottomY);
    topY = bottomY;
  }

  return positions;
}

function clampSpan(
  span: number | undefined,
  startIndex: number,
  count: number,
): number {
  const raw = span && span > 1 ? Math.trunc(span) : 1;
  return Math.max(1, Math.min(raw, count - startIndex));
}

function sumSpan(
  values: number[],
  startIndex: number,
  span: number,
): number {
  let total = 0;

  for (let index = startIndex; index < startIndex + span; index += 1) {
    total += values[index] ?? 0;
  }

  return total;
}

function isValidTableData(
  tableData: WriterTableData | undefined,
): tableData is WriterTableData {
  return !!tableData
    && Array.isArray(tableData.columns)
    && tableData.columns.length > 0
    && Array.isArray(tableData.rows);
}

function pointInRect(
  point: { x: number; y: number },
  rect: WriterTableGridRect,
): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}
