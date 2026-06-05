import type {
  WriterElementV2,
  WriterTableBorder,
  WriterTableCellStyle,
} from '../types';
import type { WriterTableSelection } from './writerTableSelection';
import {
  isTableElement,
  normalizeTableSelection,
} from './writerTableSelection';

export interface WriterTableActionResult {
  elements: WriterElementV2[];
  changed: boolean;
  message: string;
}

export function applyWriterTableCellStyle(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  patch: WriterTableCellStyle,
): WriterTableActionResult {
  const normalized = normalizeTableSelection(selection);

  if (normalized.cells.length === 0) {
    return unchanged(elements, 'No table cells selected.');
  }

  return updateTableElement(elements, normalized.elementId, (element) => {
    const tableData = element.tableData;

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    let changed = false;

    const rows = tableData.rows.map((row, rowIndex) => {
      const cells = row.cells.map((cell, columnIndex) => {
        const selected = normalized.cells.some(
          (address) =>
            address.rowIndex === rowIndex
            && address.columnIndex === columnIndex,
        );

        if (!selected) return cell;

        changed = true;

        return {
          ...cell,
          style: mergeCellStyle(cell.style, patch),
        };
      });

      return {
        ...row,
        cells,
      };
    });

    return {
      element: {
        ...element,
        tableData: {
          ...tableData,
          rows,
        },
        updatedAt: nowIso(),
      },
      changed,
      message: changed
        ? `Updated ${normalized.cells.length} table cell(s).`
        : 'No matching table cells were found.',
    };
  });
}

export function setWriterTableCellHorizontalAlignment(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  alignment: NonNullable<WriterTableCellStyle['alignment']>,
): WriterTableActionResult {
  return applyWriterTableCellStyle(elements, selection, {
    alignment,
  });
}

export function setWriterTableCellVerticalAlignment(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  verticalAlign: NonNullable<WriterTableCellStyle['verticalAlign']>,
): WriterTableActionResult {
  return applyWriterTableCellStyle(elements, selection, {
    verticalAlign,
  });
}

export function setWriterTableCellFill(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  backgroundColor: string | undefined,
): WriterTableActionResult {
  return applyWriterTableCellStyle(elements, selection, {
    backgroundColor,
  });
}

export function setWriterTableCellPadding(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  padding: number,
): WriterTableActionResult {
  return applyWriterTableCellStyle(elements, selection, {
    padding: Math.max(0, padding),
  });
}

export function setWriterTableCellBorder(
  elements: WriterElementV2[],
  selection: WriterTableSelection,
  side: 'top' | 'right' | 'bottom' | 'left' | 'all',
  border: WriterTableBorder,
): WriterTableActionResult {
  const normalizedBorder = normalizeBorder(border);

  if (side === 'all') {
    return applyWriterTableCellStyle(elements, selection, {
      borders: {
        top: normalizedBorder,
        right: normalizedBorder,
        bottom: normalizedBorder,
        left: normalizedBorder,
      },
    });
  }

  return applyWriterTableCellStyle(elements, selection, {
    borders: {
      [side]: normalizedBorder,
    },
  });
}

export function setWriterTableHeaderRow(
  elements: WriterElementV2[],
  tableElementId: string,
  hasHeaderRow: boolean,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    if (!element.tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    if (element.tableData.hasHeaderRow === hasHeaderRow) {
      return {
        element,
        changed: false,
        message: hasHeaderRow
          ? 'Header row is already enabled.'
          : 'Header row is already disabled.',
      };
    }

    return {
      element: {
        ...element,
        tableData: {
          ...element.tableData,
          hasHeaderRow,
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: hasHeaderRow
        ? 'Table header row enabled.'
        : 'Table header row disabled.',
    };
  });
}

export function resizeWriterTableColumn(
  elements: WriterElementV2[],
  tableElementId: string,
  columnId: string,
  width: number,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = element.tableData;

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    const safeWidth = Math.max(8, width);
    let changed = false;

    const columns = tableData.columns.map((column) => {
      if (column.id !== columnId) return column;

      if (column.width === safeWidth) return column;

      changed = true;

      return {
        ...column,
        width: safeWidth,
      };
    });

    return {
      element: {
        ...element,
        tableData: {
          ...tableData,
          columns,
        },
        updatedAt: changed ? nowIso() : element.updatedAt,
      },
      changed,
      message: changed
        ? 'Table column resized.'
        : 'No matching table column was found.',
    };
  });
}

export function resizeWriterTableRow(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  height: number,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = element.tableData;

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    if (!tableData.rows[rowIndex]) {
      return {
        element,
        changed: false,
        message: 'No matching table row was found.',
      };
    }

    const safeHeight = Math.max(8, height);

    if (tableData.rows[rowIndex].height === safeHeight) {
      return {
        element,
        changed: false,
        message: 'Table row already has the requested height.',
      };
    }

    const rows = tableData.rows.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) return row;

      return {
        ...row,
        height: safeHeight,
      };
    });

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
      message: 'Table row resized.',
    };
  });
}

export function updateWriterTableCellText(
  elements: WriterElementV2[],
  tableElementId: string,
  rowIndex: number,
  columnIndex: number,
  text: string,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    const tableData = element.tableData;

    if (!tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    if (!tableData.rows[rowIndex]?.cells[columnIndex]) {
      return {
        element,
        changed: false,
        message: 'Selected table cell was not found.',
      };
    }

    const rows = tableData.rows.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) return row;

      return {
        ...row,
        cells: row.cells.map((cell, currentColumnIndex) => {
          if (currentColumnIndex !== columnIndex) return cell;

          return {
            ...cell,
            text,
          };
        }),
      };
    });

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
      message: 'Table cell text updated.',
    };
  });
}

export function setWriterTableDefaultCellStyle(
  elements: WriterElementV2[],
  tableElementId: string,
  patch: WriterTableCellStyle,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    if (!element.tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    return {
      element: {
        ...element,
        tableData: {
          ...element.tableData,
          defaultCellStyle: mergeCellStyle(
            element.tableData.defaultCellStyle,
            patch,
          ),
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Table default cell style updated.',
    };
  });
}

export function setWriterTableHeaderCellStyle(
  elements: WriterElementV2[],
  tableElementId: string,
  patch: WriterTableCellStyle,
): WriterTableActionResult {
  return updateTableElement(elements, tableElementId, (element) => {
    if (!element.tableData) {
      return {
        element,
        changed: false,
        message: 'Selected table has no table data.',
      };
    }

    return {
      element: {
        ...element,
        tableData: {
          ...element.tableData,
          headerCellStyle: mergeCellStyle(
            element.tableData.headerCellStyle,
            patch,
          ),
        },
        updatedAt: nowIso(),
      },
      changed: true,
      message: 'Table header cell style updated.',
    };
  });
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
): WriterTableActionResult {
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

function mergeCellStyle(
  base: WriterTableCellStyle | undefined,
  patch: WriterTableCellStyle,
): WriterTableCellStyle {
  return {
    ...base,
    ...patch,
    borders: mergeBorders(base?.borders, patch.borders),
  };
}

function mergeBorders(
  base: WriterTableCellStyle['borders'],
  patch: WriterTableCellStyle['borders'],
): WriterTableCellStyle['borders'] {
  if (!base && !patch) return undefined;

  return {
    top: patch?.top ?? base?.top,
    right: patch?.right ?? base?.right,
    bottom: patch?.bottom ?? base?.bottom,
    left: patch?.left ?? base?.left,
  };
}

function normalizeBorder(border: WriterTableBorder): WriterTableBorder {
  return {
    style: border.style ?? 'single',
    color: border.color ?? '#CBD5E1',
    width: Math.max(0, border.width ?? 0.5),
  };
}

function unchanged(
  elements: WriterElementV2[],
  message: string,
): WriterTableActionResult {
  return {
    elements,
    changed: false,
    message,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}
