import type {
  WriterElementV2,
  WriterTableCell,
  WriterTableColumn,
  WriterTableData,
  WriterTableRow,
} from '../types';
import type { WriterTableSelection } from './writerTableSelection';
import {
  isTableElement,
  normalizeTableSelection,
} from './writerTableSelection';

export interface WriterTableStructureActionResult {
  elements: WriterElementV2[];
  changed: boolean;
  message: string;
}

export function normalizeWriterTableElement(
  elements: WriterElementV2[],
  tableElementId: string,
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    if (!element.tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const normalized = normalizeWriterTableData(element.tableData);

    return {
      element: {
        ...element,
        tableData: normalized,
        updatedAt: nowIso(),
      },
      changed: JSON.stringify(normalized) !== JSON.stringify(element.tableData),
      message: 'Table data normalized.',
    };
  });
}

export function insertWriterTableRow(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  position: 'above' | 'below',
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const insertIndex = clamp(
      position === 'above' ? rowIndex : rowIndex + 1,
      0,
      tableData.rows.length,
    );

    const row = createEmptyRow(
      tableData.columns,
      `row-${Date.now()}`,
    );

    const rows = [
      ...tableData.rows.slice(0, insertIndex),
      row,
      ...tableData.rows.slice(insertIndex),
    ];

    return {
      element: {
        ...element,
        tableData: {
          ...tableData,
          rows,
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: position === 'above'
        ? 'Inserted table row above.'
        : 'Inserted table row below.',
    };
  });
}

export function deleteWriterTableRow(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    if (tableData.rows.length <= 1) {
      return {
        element,
        changed: false,
        message: 'Cannot delete the last table row.',
      };
    }

    if (!tableData.rows[rowIndex]) {
      return {
        element,
        changed: false,
        message: 'Selected table row was not found.',
      };
    }

    const rows = tableData.rows.filter((_, index) => index !== rowIndex);
    const adjusted = clearInvalidMergeReferences({
      ...tableData,
      rows,
    });

    return {
      element: {
        ...element,
        tableData: adjusted,
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Deleted table row.',
    };
  });
}

export function insertWriterTableColumn(
  elements: WriterElementV2[],
  tableElementId: string,
  columnIndex: number,
  position: 'left' | 'right',
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const insertIndex = clamp(
      position === 'left' ? columnIndex : columnIndex + 1,
      0,
      tableData.columns.length,
    );

    const column: WriterTableColumn = {
      id: `col-${Date.now()}`,
      label: 'New Column',
      width: estimateDefaultColumnWidth(tableData),
    };

    const columns = [
      ...tableData.columns.slice(0, insertIndex),
      column,
      ...tableData.columns.slice(insertIndex),
    ];

    const rows = tableData.rows.map((row, rowIndex) => {
      const cell = createEmptyCell(`cell-${rowIndex}-${insertIndex}-${Date.now()}`);

      return {
        ...row,
        cells: [
          ...row.cells.slice(0, insertIndex),
          cell,
          ...row.cells.slice(insertIndex),
        ],
      };
    });

    return {
      element: {
        ...element,
        tableData: clearInvalidMergeReferences({
          ...tableData,
          columns,
          rows,
        }),
        updatedAt: nowIso(),
      },
      changed: true,
      message: position === 'left'
        ? 'Inserted table column left.'
        : 'Inserted table column right.',
    };
  });
}

export function deleteWriterTableColumn(
  elements: WriterElementV2[],
  tableElementId: string,
  columnIndex: number,
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    if (tableData.columns.length <= 1) {
      return {
        element,
        changed: false,
        message: 'Cannot delete the last table column.',
      };
    }

    if (!tableData.columns[columnIndex]) {
      return {
        element,
        changed: false,
        message: 'Selected table column was not found.',
      };
    }

    const columns = tableData.columns.filter((_, index) => index !== columnIndex);
    const rows = tableData.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, index) => index !== columnIndex),
    }));

    return {
      element: {
        ...element,
        tableData: clearInvalidMergeReferences({
          ...tableData,
          columns,
          rows,
        }),
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Deleted table column.',
    };
  });
}

export function mergeWriterTableCells(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
): WriterTableStructureActionResult {
  const normalized = normalizeTableSelection(selection);

  if (normalized.cells.length < 2) {
    return unchanged(elements, 'Select at least two cells to merge.');
  }

  return updateTableElement(elements, normalized.elementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const range = selectionToRange(normalized);

    if (!range) {
      return {
        element,
        changed: false,
        message: 'Invalid table cell selection.',
      };
    }

    if (!rangeExists(tableData, range)) {
      return {
        element,
        changed: false,
        message: 'Selected merge range is outside the table.',
      };
    }

    const mergedTextParts: string[] = [];

    for (let rowIndex = range.rowStart; rowIndex <= range.rowEnd; rowIndex += 1) {
      for (let columnIndex = range.columnStart; columnIndex <= range.columnEnd; columnIndex += 1) {
        const cell = tableData.rows[rowIndex].cells[columnIndex];

        if (cell?.text) {
          mergedTextParts.push(cell.text);
        }
      }
    }

    const rows = tableData.rows.map((row, rowIndex) => ({
      ...row,
      cells: row.cells.map((cell, columnIndex) => {
        const insideRange = rowIndex >= range.rowStart
          && rowIndex <= range.rowEnd
          && columnIndex >= range.columnStart
          && columnIndex <= range.columnEnd;

        if (!insideRange) {
          return cell;
        }

        if (rowIndex === range.rowStart && columnIndex === range.columnStart) {
          return {
            ...cell,
            text: mergedTextParts.join('\n'),
            colSpan: range.columnEnd - range.columnStart + 1,
            rowSpan: range.rowEnd - range.rowStart + 1,
            mergedInto: undefined,
          };
        }

        return {
          ...cell,
          text: '',
          colSpan: undefined,
          rowSpan: undefined,
          mergedInto: {
            rowIndex: range.rowStart,
            columnIndex: range.columnStart,
          },
        };
      }),
    }));

    return {
      element: {
        ...element,
        tableData: {
          ...tableData,
          rows,
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Merged table cells.',
    };
  });
}

export function splitWriterTableCell(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  columnIndex: number,
): WriterTableStructureActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = normalizeWriterTableData(element.tableData);

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const cell = tableData.rows[rowIndex]?.cells[columnIndex];

    if (!cell) {
      return {
        element,
        changed: false,
        message: 'Selected table cell was not found.',
      };
    }

    const masterAddress = cell.mergedInto ?? {
      rowIndex,
      columnIndex,
    };

    const master = tableData.rows[masterAddress.rowIndex]?.cells[masterAddress.columnIndex];

    if (!master || (!master.colSpan && !master.rowSpan)) {
      return {
        element,
        changed: false,
        message: 'Selected table cell is not merged.',
      };
    }

    const colSpan = master.colSpan ?? 1;
    const rowSpan = master.rowSpan ?? 1;

    const rows = tableData.rows.map((row, currentRowIndex) => ({
      ...row,
      cells: row.cells.map((currentCell, currentColumnIndex) => {
        const insideMerge = currentRowIndex >= masterAddress.rowIndex
          && currentRowIndex < masterAddress.rowIndex + rowSpan
          && currentColumnIndex >= masterAddress.columnIndex
          && currentColumnIndex < masterAddress.columnIndex + colSpan;

        if (!insideMerge) {
          return currentCell;
        }

        if (
          currentRowIndex === masterAddress.rowIndex
          && currentColumnIndex === masterAddress.columnIndex
        ) {
          return {
            ...currentCell,
            colSpan: undefined,
            rowSpan: undefined,
            mergedInto: undefined,
          };
        }

        return {
          ...currentCell,
          text: '',
          colSpan: undefined,
          rowSpan: undefined,
          mergedInto: undefined,
        };
      }),
    }));

    return {
      element: {
        ...element,
        tableData: {
          ...tableData,
          rows,
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Split merged table cell.',
    };
  });
}

export function normalizeWriterTableData(
  tableData: WriterTableData | undefined,
): WriterTableData | undefined {
  if (!tableData || !Array.isArray(tableData.columns) || tableData.columns.length === 0) {
    return undefined;
  }

  const columns = tableData.columns.map((column, index) => ({
    id: column.id || `col-${index + 1}`,
    label: column.label,
    width: column.width,
    style: column.style,
  }));

  const rows = Array.isArray(tableData.rows) && tableData.rows.length > 0
    ? tableData.rows
    : [createEmptyRow(columns, 'row-1')];

  const normalizedRows = rows.map((row, rowIndex) => {
    const cells: WriterTableCell[] = [];

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const existing = row.cells?.[columnIndex];

      cells.push(
        existing
          ? {
              ...existing,
              id: existing.id || `cell-${rowIndex + 1}-${columnIndex + 1}`,
              text: existing.text ?? '',
            }
          : createEmptyCell(`cell-${rowIndex + 1}-${columnIndex + 1}`),
      );
    }

    return {
      ...row,
      id: row.id || `row-${rowIndex + 1}`,
      cells,
    };
  });

  return clearInvalidMergeReferences({
    ...tableData,
    columns,
    rows: normalizedRows,
  });
}

function clearInvalidMergeReferences(tableData: WriterTableData): WriterTableData {
  const rowCount = tableData.rows.length;
  const columnCount = tableData.columns.length;

  const rows = tableData.rows.map((row, rowIndex) => ({
    ...row,
    cells: row.cells.map((cell, columnIndex) => {
      const mergedInto = cell.mergedInto;

      if (!mergedInto) {
        return {
          ...cell,
          colSpan: normalizeSpan(cell.colSpan),
          rowSpan: normalizeSpan(cell.rowSpan),
        };
      }

      const valid = mergedInto.rowIndex >= 0
        && mergedInto.rowIndex < rowCount
        && mergedInto.columnIndex >= 0
        && mergedInto.columnIndex < columnCount
        && !(mergedInto.rowIndex === rowIndex && mergedInto.columnIndex === columnIndex);

      return valid
        ? {
            ...cell,
            colSpan: undefined,
            rowSpan: undefined,
          }
        : {
            ...cell,
            mergedInto: undefined,
            colSpan: undefined,
            rowSpan: undefined,
          };
    }),
  }));

  return {
    ...tableData,
    rows,
  };
}

function updateTableElement(
  elements: WriterElementV2[],
  tableElementId: string,
  updater: (
    element: WriterElementV2 & { type: 'tableBox' },
  ) => {
    element: WriterElementV2;
    changed: boolean;
    message: string;
  },
): WriterTableStructureActionResult {
  let found = false;
  let changed = false;
  let message = 'Table was not found.';

  const nextElements = elements.map((element) => {
    if (element.id !== tableElementId) return element;

    found = true;

    if (!isTableElement(element)) {
      message = 'Selected Writer element is not a table.';
      return element;
    }

    const result = updater(element);
    changed = result.changed;
    message = result.message;

    return result.element;
  });

  if (!found) {
    return unchanged(elements, message);
  }

  return {
    elements: changed ? nextElements : elements,
    changed,
    message,
  };
}

function createEmptyRow(
  columns: WriterTableColumn[],
  id: string,
): WriterTableRow {
  return {
    id,
    cells: columns.map((_, index) =>
      createEmptyCell(`${id}-cell-${index + 1}`),
    ),
  };
}

function createEmptyCell(id: string): WriterTableCell {
  return {
    id,
    text: '',
  };
}

function estimateDefaultColumnWidth(tableData: WriterTableData): number {
  const existing = tableData.columns
    .map((column) => column.width)
    .filter((width): width is number => typeof width === 'number' && width > 0);

  if (existing.length === 0) {
    return 120;
  }

  return Math.round(
    existing.reduce((sum, width) => sum + width, 0) / existing.length,
  );
}

function selectionToRange(selection: WriterTableSelection): {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
} | null {
  if (selection.cells.length === 0) return null;

  return {
    rowStart: Math.min(...selection.cells.map((cell) => cell.rowIndex)),
    rowEnd: Math.max(...selection.cells.map((cell) => cell.rowIndex)),
    columnStart: Math.min(...selection.cells.map((cell) => cell.columnIndex)),
    columnEnd: Math.max(...selection.cells.map((cell) => cell.columnIndex)),
  };
}

function rangeExists(
  tableData: WriterTableData,
  range: {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
  },
): boolean {
  return range.rowStart >= 0
    && range.columnStart >= 0
    && range.rowEnd < tableData.rows.length
    && range.columnEnd < tableData.columns.length;
}

function normalizeSpan(value: number | undefined): number | undefined {
  if (!value || value <= 1) return undefined;
  return Math.max(2, Math.trunc(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function unchanged(
  elements: WriterElementV2[],
  message: string,
): WriterTableStructureActionResult {
  return {
    elements,
    changed: false,
    message,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}
