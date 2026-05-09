import type {
  WriterTableCell,
  WriterTableColumn,
  WriterTableModel,
  WriterTableRow,
} from './types';

let idCounter = 0;

function id(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function updateTableCellText(
  table: WriterTableModel,
  rowIndex: number,
  colIndex: number,
  text: string,
): WriterTableModel {
  return {
    ...table,
    rows: table.rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((cell, c) =>
        r === rowIndex && c === colIndex
          ? { ...cell, text }
          : cell,
      ),
    })),
  };
}

export function insertTableRow(
  table: WriterTableModel,
  atIndex: number,
): WriterTableModel {
  const safeIndex = Math.max(0, Math.min(atIndex, table.rows.length));
  const row = createEmptyRow(table.columns.length);

  return {
    ...table,
    rows: [
      ...table.rows.slice(0, safeIndex),
      row,
      ...table.rows.slice(safeIndex),
    ],
  };
}

export function deleteTableRow(
  table: WriterTableModel,
  rowIndex: number,
): WriterTableModel {
  if (table.rows.length <= 1) return table;

  return {
    ...table,
    rows: table.rows.filter((_, index) => index !== rowIndex),
  };
}

export function insertTableColumn(
  table: WriterTableModel,
  atIndex: number,
): WriterTableModel {
  const safeIndex = Math.max(0, Math.min(atIndex, table.columns.length));
  const column: WriterTableColumn = {
    id: id('col'),
    label: nextColumnLabel(table.columns.length),
  };

  return {
    ...table,
    columns: [
      ...table.columns.slice(0, safeIndex),
      column,
      ...table.columns.slice(safeIndex),
    ],
    rows: table.rows.map((row) => ({
      ...row,
      cells: [
        ...row.cells.slice(0, safeIndex),
        createEmptyCell(),
        ...row.cells.slice(safeIndex),
      ],
    })),
  };
}

export function deleteTableColumn(
  table: WriterTableModel,
  colIndex: number,
): WriterTableModel {
  if (table.columns.length <= 1) return table;

  return {
    ...table,
    columns: table.columns.filter((_, index) => index !== colIndex),
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, index) => index !== colIndex),
    })),
  };
}

export function pasteMatrixIntoTable(
  table: WriterTableModel,
  startRow: number,
  startCol: number,
  matrix: string[][],
): WriterTableModel {
  let next = table;

  const requiredRows = startRow + matrix.length;
  while (next.rows.length < requiredRows) {
    next = insertTableRow(next, next.rows.length);
  }

  const requiredCols = startCol + Math.max(0, ...matrix.map((row) => row.length));
  while (next.columns.length < requiredCols) {
    next = insertTableColumn(next, next.columns.length);
  }

  const rows = next.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({ ...cell })),
  }));

  matrix.forEach((matrixRow, r) => {
    matrixRow.forEach((value, c) => {
      rows[startRow + r].cells[startCol + c].text = value;
    });
  });

  return {
    ...next,
    rows,
  };
}

export function tableToMatrix(table: WriterTableModel): string[][] {
  return table.rows.map((row) => row.cells.map((cell) => cell.text));
}

export function matrixToTsv(matrix: string[][]): string {
  return matrix.map((row) => row.join('\t')).join('\n');
}

function createEmptyRow(columnCount: number): WriterTableRow {
  return {
    id: id('row'),
    cells: Array.from({ length: columnCount }, () => createEmptyCell()),
  };
}

function createEmptyCell(): WriterTableCell {
  return {
    id: id('cell'),
    text: '',
  };
}

function nextColumnLabel(index: number): string {
  let n = index + 1;
  let out = '';

  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }

  return out;
}
