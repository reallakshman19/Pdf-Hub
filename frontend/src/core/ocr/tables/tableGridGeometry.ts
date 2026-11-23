import type { OcrTableBlock, OcrTableCell } from '@/core/ocr/types';

export interface ColumnDivider {
  index: number;
  x: number;
  minX: number;
  maxX: number;
}

export interface RowDivider {
  index: number;
  y: number;
  minY: number;
  maxY: number;
}

/**
 * Extracts inner column divider positions from an OcrTableBlock.
 * For N columns, there are N - 1 inner dividers.
 */
export function extractColumnDividers(table: OcrTableBlock): ColumnDivider[] {
  const rows = table.rows ?? [];
  if (rows.length === 0) return [];

  const firstRow = rows[0].cells ?? [];
  const colCount = firstRow.length;
  if (colCount <= 1) return [];

  const dividers: ColumnDivider[] = [];
  const tableX = table.rect?.x ?? table.bbox?.x ?? 0;
  const tableWidth = table.rect?.width ?? table.bbox?.width ?? 100;
  const minColWidth = 15;

  for (let c = 0; c < colCount - 1; c++) {
    const currentCell = firstRow[c];
    const nextCell = firstRow[c + 1];

    const currentX = currentCell.bbox?.x ?? (tableX + (c * tableWidth) / colCount);
    const currentW = currentCell.bbox?.width ?? (tableWidth / colCount);
    const divX = currentX + currentW;

    const prevDivX = c === 0 ? tableX : dividers[c - 1].x;
    const nextDivX = c === colCount - 2
      ? tableX + tableWidth
      : (nextCell.bbox?.x ?? (tableX + ((c + 2) * tableWidth) / colCount)) +
        (nextCell.bbox?.width ?? (tableWidth / colCount));

    dividers.push({
      index: c,
      x: divX,
      minX: prevDivX + minColWidth,
      maxX: nextDivX - minColWidth,
    });
  }

  return dividers;
}

/**
 * Extracts inner row divider positions from an OcrTableBlock.
 * For M rows, there are M - 1 inner dividers.
 */
export function extractRowDividers(table: OcrTableBlock): RowDivider[] {
  const rows = table.rows ?? [];
  const rowCount = rows.length;
  if (rowCount <= 1) return [];

  const dividers: RowDivider[] = [];
  const tableY = table.rect?.y ?? table.bbox?.y ?? 0;
  const tableHeight = table.rect?.height ?? table.bbox?.height ?? 100;
  const minRowHeight = 10;

  for (let r = 0; r < rowCount - 1; r++) {
    const currentRow = rows[r];
    const nextRow = rows[r + 1];

    const currentCell = currentRow.cells?.[0];
    const nextCell = nextRow.cells?.[0];

    const currentY = currentCell?.bbox?.y ?? (tableY + (r * tableHeight) / rowCount);
    const currentH = currentCell?.bbox?.height ?? (tableHeight / rowCount);
    const divY = currentY + currentH;

    const prevDivY = r === 0 ? tableY : dividers[r - 1].y;
    const nextDivY = r === rowCount - 2
      ? tableY + tableHeight
      : (nextCell?.bbox?.y ?? (tableY + ((r + 2) * tableHeight) / rowCount)) +
        (nextCell?.bbox?.height ?? (tableHeight / rowCount));

    dividers.push({
      index: r,
      y: divY,
      minY: prevDivY + minRowHeight,
      maxY: nextDivY - minRowHeight,
    });
  }

  return dividers;
}

/**
 * Adjusts a column divider position, clamping it within safety bounds
 * and updating the affected cells in all table rows.
 */
export function adjustColumnDivider(
  table: OcrTableBlock,
  dividerIndex: number,
  newX: number,
): OcrTableBlock {
  const dividers = extractColumnDividers(table);
  const targetDivider = dividers.find((d) => d.index === dividerIndex);
  if (!targetDivider) return table;

  const clampedX = Math.max(targetDivider.minX, Math.min(targetDivider.maxX, newX));
  const shift = clampedX - targetDivider.x;
  if (Math.abs(shift) < 0.5) return table;

  const updatedRows = (table.rows ?? []).map((row) => {
    const updatedCells: OcrTableCell[] = (row.cells ?? []).map((cell, cIdx) => {
      if (cIdx === dividerIndex) {
        // Left cell expands or contracts
        const oldW = cell.bbox?.width ?? 20;
        return {
          ...cell,
          bbox: {
            ...cell.bbox,
            width: Math.max(10, oldW + shift),
          },
        };
      } else if (cIdx === dividerIndex + 1) {
        // Right cell shifts x and changes width inversely
        const oldW = cell.bbox?.width ?? 20;
        return {
          ...cell,
          bbox: {
            ...cell.bbox,
            x: clampedX,
            width: Math.max(10, oldW - shift),
          },
        };
      }
      return cell;
    });

    return {
      ...row,
      cells: updatedCells,
    };
  });

  return {
    ...table,
    rows: updatedRows,
  };
}

/**
 * Adjusts a row divider position, clamping it within safety bounds
 * and updating the affected row heights.
 */
export function adjustRowDivider(
  table: OcrTableBlock,
  dividerIndex: number,
  newY: number,
): OcrTableBlock {
  const dividers = extractRowDividers(table);
  const targetDivider = dividers.find((d) => d.index === dividerIndex);
  if (!targetDivider) return table;

  const clampedY = Math.max(targetDivider.minY, Math.min(targetDivider.maxY, newY));
  const shift = clampedY - targetDivider.y;
  if (Math.abs(shift) < 0.5) return table;

  const updatedRows = (table.rows ?? []).map((row, rIdx) => {
    if (rIdx === dividerIndex) {
      // Upper row expands or contracts height
      const updatedCells = (row.cells ?? []).map((cell) => ({
        ...cell,
        bbox: {
          ...cell.bbox,
          height: Math.max(8, (cell.bbox?.height ?? 15) + shift),
        },
      }));
      return { ...row, cells: updatedCells };
    } else if (rIdx === dividerIndex + 1) {
      // Lower row moves y and changes height inversely
      const updatedCells = (row.cells ?? []).map((cell) => ({
        ...cell,
        bbox: {
          ...cell.bbox,
          y: clampedY,
          height: Math.max(8, (cell.bbox?.height ?? 15) - shift),
        },
      }));
      return { ...row, cells: updatedCells };
    }
    return row;
  });

  return {
    ...table,
    rows: updatedRows,
  };
}
