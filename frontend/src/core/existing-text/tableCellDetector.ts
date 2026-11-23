import type { ExistingTextSpan } from './types';
import type {
  TableCellBounds,
  DetectedTableCell,
  DetectedTableGrid,
} from './tableCellTypes';
import type { ExistingTextAlign } from './alignmentTypes';

const NUMERIC_CURRENCY_PATTERN = /^[$€£¥₹]?\s*[-+]?[\d,]+(\.\d+)?%?$/;
const PARENTHESES_ACCOUNTING_PATTERN = /^\([\d,]+(\.\d+)?\)$/;
const DATE_OR_CODE_PATTERN = /^(\d{2,4}[-/.]\d{1,2}[-/.]\d{1,4}|[A-Z0-9_-]{2,8})$/;

export function suggestAlignmentForText(text: string): ExistingTextAlign {
  const trimmed = text.trim();
  if (!trimmed) return 'left';
  if (NUMERIC_CURRENCY_PATTERN.test(trimmed) || PARENTHESES_ACCOUNTING_PATTERN.test(trimmed)) {
    return 'right';
  }
  if (DATE_OR_CODE_PATTERN.test(trimmed) && trimmed.length <= 12) {
    return 'center';
  }
  return 'left';
}

export function detectTableGridsForPage(
  spans: readonly ExistingTextSpan[],
): DetectedTableGrid[] {
  if (spans.length === 0) return [];

  const eligibleSpans = spans.filter(
    (s) => s.editability !== 'unsupported' && s.text.trim().length > 0,
  );
  if (eligibleSpans.length < 4) return [];

  const pageIndex = eligibleSpans[0].pageIndex;

  // 1. Group spans into horizontal rows by baseline Y (within 3pt)
  const rows: ExistingTextSpan[][] = [];
  const sortedByYDesc = [...eligibleSpans].sort((a, b) => b.originPt.y - a.originPt.y);

  for (const span of sortedByYDesc) {
    let placed = false;
    for (const row of rows) {
      const avgY = row.reduce((sum, s) => sum + s.originPt.y, 0) / row.length;
      if (Math.abs(span.originPt.y - avgY) <= 3.0) {
        row.push(span);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([span]);
    }
  }

  // Sort spans inside each row from left to right
  for (const row of rows) {
    row.sort((a, b) => a.originPt.x - b.originPt.x);
  }

  // Filter out rows that have fewer than 2 column spans (minimum 2 columns for a table)
  const multiColRows = rows.filter((r) => r.length >= 2);
  if (multiColRows.length < 2) return [];

  // Group vertically adjacent multi-column rows that share similar column counts and horizontal positions
  const tableRowGroups: ExistingTextSpan[][][] = [];
  let currentGroup: ExistingTextSpan[][] = [multiColRows[0]];

  for (let i = 1; i < multiColRows.length; i++) {
    const prevRow = currentGroup[currentGroup.length - 1];
    const currRow = multiColRows[i];

    const prevY = prevRow[0].originPt.y;
    const currY = currRow[0].originPt.y;
    const deltaY = prevY - currY;
    const avgFontSize = (prevRow[0].fontSizePt + currRow[0].fontSizePt) / 2;

    // Check if vertically contiguous (deltaY between 0.7x and 3.0x font size)
    const isVerticallyAdjacent = deltaY >= avgFontSize * 0.7 && deltaY <= avgFontSize * 3.5;

    // Check if column counts and alignments reasonably match
    const colCountDiff = Math.abs(prevRow.length - currRow.length);
    const columnsMatch = colCountDiff <= 1;

    if (isVerticallyAdjacent && columnsMatch) {
      currentGroup.push(currRow);
    } else {
      if (currentGroup.length >= 2) {
        tableRowGroups.push(currentGroup);
      }
      currentGroup = [currRow];
    }
  }

  if (currentGroup.length >= 2) {
    tableRowGroups.push(currentGroup);
  }

  // Build DetectedTableGrid for each group
  return tableRowGroups.map((group, groupIndex) => {
    const tableId = `table_${pageIndex}_${groupIndex + 1}`;
    const rowCount = group.length;

    // Determine canonical column count (maximum across rows)
    const colCount = Math.max(...group.map((r) => r.length));

    // Compute column bounding boundaries (minX, maxX per column)
    const colLefts: number[] = new Array(colCount).fill(Infinity);
    const colRights: number[] = new Array(colCount).fill(-Infinity);

    for (const row of group) {
      for (let c = 0; c < row.length; c++) {
        const s = row[c];
        colLefts[c] = Math.min(colLefts[c], s.originPt.x);
        colRights[c] = Math.max(colRights[c], s.originPt.x + s.advanceWidthPt);
      }
    }

    // Compute column dividers (midpoints between adjacent columns)
    const columnDividers: number[] = [];
    const minPadding = 4;
    for (let c = 0; c < colCount - 1; c++) {
      const rightCurrent = isFinite(colRights[c]) ? colRights[c] : colLefts[c] + 30;
      const leftNext = isFinite(colLefts[c + 1]) ? colLefts[c + 1] : rightCurrent + 20;
      columnDividers.push((rightCurrent + leftNext) / 2);
    }

    // Determine overall table X bounds
    const tableMinX = Math.max(0, colLefts[0] - minPadding);
    const tableMaxX = colRights[colCount - 1] + minPadding;

    // Determine row dividers (midpoints between row baselines)
    const rowDividers: number[] = [];
    const firstRowAvgFontSize = group[0][0].fontSizePt;
    const topY = group[0][0].originPt.y + firstRowAvgFontSize * 1.2;

    for (let r = 0; r < rowCount - 1; r++) {
      const currentY = group[r][0].originPt.y;
      const nextY = group[r + 1][0].originPt.y;
      rowDividers.push((currentY + nextY) / 2);
    }

    const lastRowAvgFontSize = group[rowCount - 1][0].fontSizePt;
    const bottomY = Math.max(0, group[rowCount - 1][0].originPt.y - lastRowAvgFontSize * 0.4);

    const tableBounds: TableCellBounds = {
      x: tableMinX,
      y: bottomY,
      width: Math.max(10, tableMaxX - tableMinX),
      height: Math.max(10, topY - bottomY),
    };

    // Construct cells
    const cells: DetectedTableCell[] = [];

    for (let r = 0; r < rowCount; r++) {
      const row = group[r];
      const cellTop = r === 0 ? topY : rowDividers[r - 1];
      const cellBottom = r === rowCount - 1 ? bottomY : rowDividers[r];
      const cellHeight = Math.max(8, cellTop - cellBottom);

      for (let c = 0; c < colCount; c++) {
        const cellLeft = c === 0 ? tableMinX : columnDividers[c - 1];
        const cellRight = c === colCount - 1 ? tableMaxX : columnDividers[c];
        const cellWidth = Math.max(10, cellRight - cellLeft);

        const spanInCell = row[c] ?? null;
        const cellBounds: TableCellBounds = {
          x: cellLeft,
          y: cellBottom,
          width: cellWidth,
          height: cellHeight,
        };

        const cellText = spanInCell ? spanInCell.text : '';
        const suggestedAlignment = suggestAlignmentForText(cellText);

        // Header detection heuristic: row 0 is header if it has text or font styling
        const isHeader = r === 0 && rowCount > 1;

        cells.push({
          tableId,
          rowIndex: r,
          columnIndex: c,
          bounds: cellBounds,
          spanIds: spanInCell ? [spanInCell.id] : [],
          text: cellText,
          isHeader,
          suggestedAlignment,
        });
      }
    }

    return {
      tableId,
      pageIndex,
      bounds: tableBounds,
      rowCount,
      colCount,
      cells,
      columnDividers,
      rowDividers,
    };
  });
}

export function findTableCellForSpan(
  span: ExistingTextSpan,
  tableGrids: readonly DetectedTableGrid[],
): DetectedTableCell | null {
  for (const table of tableGrids) {
    if (table.pageIndex !== span.pageIndex) continue;
    for (const cell of table.cells) {
      if (cell.spanIds.includes(span.id)) {
        return cell;
      }
      // Also check bounding containment
      const sX = span.originPt.x;
      const sY = span.originPt.y;
      if (
        sX >= cell.bounds.x &&
        sX <= cell.bounds.x + cell.bounds.width &&
        sY >= cell.bounds.y &&
        sY <= cell.bounds.y + cell.bounds.height
      ) {
        return cell;
      }
    }
  }
  return null;
}

export function isSpanInsideTable(
  span: ExistingTextSpan,
  tableGrids: readonly DetectedTableGrid[],
): boolean {
  return findTableCellForSpan(span, tableGrids) !== null;
}
