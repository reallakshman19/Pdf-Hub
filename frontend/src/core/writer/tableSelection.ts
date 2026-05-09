export interface WriterTableSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface WriterTableCellRef {
  row: number;
  col: number;
}

export function normalizeTableSelection(selection: WriterTableSelection): WriterTableSelection {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

export function isCellInSelection(
  cell: WriterTableCellRef,
  selection: WriterTableSelection | null,
): boolean {
  if (!selection) return false;

  const normalized = normalizeTableSelection(selection);

  return (
    cell.row >= normalized.startRow &&
    cell.row <= normalized.endRow &&
    cell.col >= normalized.startCol &&
    cell.col <= normalized.endCol
  );
}

export function createSingleCellSelection(row: number, col: number): WriterTableSelection {
  return {
    startRow: row,
    endRow: row,
    startCol: col,
    endCol: col,
  };
}

export function expandSelectionToCell(
  selection: WriterTableSelection,
  row: number,
  col: number,
): WriterTableSelection {
  return {
    ...selection,
    endRow: row,
    endCol: col,
  };
}

export function selectionToRefs(selection: WriterTableSelection): WriterTableCellRef[] {
  const normalized = normalizeTableSelection(selection);
  const refs: WriterTableCellRef[] = [];

  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      refs.push({ row, col });
    }
  }

  return refs;
}
