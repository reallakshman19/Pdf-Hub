import type { WriterElementV2 } from '../types';

export interface WriterTableCellAddress {
  elementId: string;
  rowIndex: number;
  columnIndex: number;
}

export interface WriterTableSelection {
  elementId: string;
  cells: WriterTableCellAddress[];
}

export function createSingleCellSelection(
  elementId: string,
  rowIndex: number,
  columnIndex: number,
): WriterTableSelection {
  return {
    elementId,
    cells: [
      {
        elementId,
        rowIndex,
        columnIndex,
      },
    ],
  };
}

export function createRectangularTableSelection(input: {
  elementId: string;
  startRowIndex: number;
  startColumnIndex: number;
  endRowIndex: number;
  endColumnIndex: number;
}): WriterTableSelection {
  const rowStart = Math.min(input.startRowIndex, input.endRowIndex);
  const rowEnd = Math.max(input.startRowIndex, input.endRowIndex);
  const colStart = Math.min(input.startColumnIndex, input.endColumnIndex);
  const colEnd = Math.max(input.startColumnIndex, input.endColumnIndex);

  const cells: WriterTableCellAddress[] = [];

  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let columnIndex = colStart; columnIndex <= colEnd; columnIndex += 1) {
      cells.push({
        elementId: input.elementId,
        rowIndex,
        columnIndex,
      });
    }
  }

  return {
    elementId: input.elementId,
    cells,
  };
}

export function normalizeTableSelection(
  selection: WriterTableSelection,
): WriterTableSelection {
  const seen = new Set<string>();
  const cells: WriterTableCellAddress[] = [];

  for (const cell of selection.cells) {
    if (cell.elementId !== selection.elementId) continue;
    if (cell.rowIndex < 0 || cell.columnIndex < 0) continue;

    const key = `${cell.rowIndex}:${cell.columnIndex}`;

    if (seen.has(key)) continue;

    seen.add(key);
    cells.push({ ...cell });
  }

  cells.sort((a, b) => {
    const rowDelta = a.rowIndex - b.rowIndex;
    if (rowDelta !== 0) return rowDelta;

    return a.columnIndex - b.columnIndex;
  });

  return {
    elementId: selection.elementId,
    cells,
  };
}

export function isTableElement(
  element: WriterElementV2 | undefined,
): element is WriterElementV2 & { type: 'tableBox' } {
  return !!element && element.type === 'tableBox';
}
