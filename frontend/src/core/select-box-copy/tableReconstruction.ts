import type { WriterTableData } from '@/core/writer-v2/types';
import type {
  SelectBoxTableResult,
  SelectBoxTextItem,
  SelectBoxTextRow,
} from './types';

export function reconstructTableFromRows(
  rows: SelectBoxTextRow[],
): SelectBoxTableResult | null {
  const candidateRows = rows.filter((row) => row.items.length >= 2);

  if (candidateRows.length < 2) return null;

  const columnCenters = inferColumnCenters(candidateRows.flatMap((row) => row.items));

  if (columnCenters.length < 2) return null;

  const tableRows = rows.map((row, rowIndex) => {
    const cells = columnCenters.map((_center, colIndex) => {
      const cellItems = row.items.filter((item) => nearestColumnIndex(item, columnCenters) === colIndex);
      const text = cellItems
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        id: `cell-${rowIndex + 1}-${colIndex + 1}`,
        text,
      };
    });

    return {
      id: `row-${rowIndex + 1}`,
      cells,
    };
  });

  const filledCells = tableRows.flatMap((row) => row.cells).filter((cell) => cell.text).length;
  const totalCells = tableRows.length * columnCenters.length;
  const filledRatio = totalCells === 0 ? 0 : filledCells / totalCells;
  const multiCellRows = tableRows.filter((row) => row.cells.filter((cell) => cell.text).length >= 2).length;
  const confidence = clamp(
    filledRatio * 0.55 +
      Math.min(1, multiCellRows / Math.max(1, rows.length)) * 0.35 +
      Math.min(1, columnCenters.length / 4) * 0.10,
    0,
    1,
  );

  if (confidence < 0.55) return null;

  const tableData: WriterTableData = {
    columns: columnCenters.map((_, index) => ({
      id: `col-${index + 1}`,
      label: `Column ${index + 1}`,
    })),
    rows: tableRows,
  };

  return {
    confidence,
    tableData,
    html: tableDataToHtml(tableData),
    tsv: tableDataToTsv(tableData),
  };
}

export function tableDataToHtml(tableData: WriterTableData): string {
  const rows = tableData.rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? 'th' : 'td';

    return `<tr>${row.cells
      .map((cell) => `<${tag}>${escapeHtml(cell.text)}</${tag}>`)
      .join('')}</tr>`;
  });

  return `<table>${rows.join('')}</table>`;
}

export function tableDataToTsv(tableData: WriterTableData): string {
  return tableData.rows
    .map((row) => row.cells.map((cell) => cell.text).join('\t'))
    .join('\n');
}

function inferColumnCenters(items: SelectBoxTextItem[]): number[] {
  const sorted = items
    .map((item) => item.x + item.width / 2)
    .sort((a, b) => a - b);

  const clusters: number[][] = [];
  const tolerance = 18;

  for (const center of sorted) {
    const cluster = clusters.find((candidate) => {
      const candidateCenter = average(candidate);
      return Math.abs(candidateCenter - center) <= tolerance;
    });

    if (cluster) {
      cluster.push(center);
    } else {
      clusters.push([center]);
    }
  }

  return clusters
    .filter((cluster) => cluster.length >= 2)
    .map(average)
    .sort((a, b) => a - b);
}

function nearestColumnIndex(item: SelectBoxTextItem, centers: number[]): number {
  const center = item.x + item.width / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [index, candidate] of centers.entries()) {
    const distance = Math.abs(candidate - center);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}