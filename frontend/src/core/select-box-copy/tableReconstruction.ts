import { rowItemSeparator } from './textGrouping';
import type { WriterTableData } from '@/core/writer-v2/types';
import type {
  SelectBoxTableResult,
  SelectBoxTextItem,
  SelectBoxTextRow,
} from './types';

export function reconstructTableFromRows(
  rows: SelectBoxTextRow[],
): SelectBoxTableResult | null {
  // Ordinary word spacing must not turn prose into a table. Coalesce nearby
  // text fragments first, then require column starts supported by distinct rows.
  const groups = rows.map(row => groupCellRuns(row.items));
  if (groups.filter(row => row.length >= 2).length < 2) return null;
  const starts = inferColumnStarts(groups);
  if (starts.length < 2 || starts.length > 50) return null;
  const tolerance = 12;
  const tableRows = [];
  for (const [rowIndex, runs] of groups.entries()) {
    const cells = starts.map((_, colIndex) => ({ id: `cell-${rowIndex + 1}-${colIndex + 1}`, text: '' }));
    for (const run of runs) {
      const colIndex = starts.findIndex(start => Math.abs(run.x - start) <= tolerance);
      if (colIndex < 0 || cells[colIndex].text) return null; // no guessing a cell for an unmatched/ambiguous run
      cells[colIndex].text = run.text;
    }
    tableRows.push({ id: `row-${rowIndex + 1}`, cells });
  }
  const filledCells = tableRows.flatMap((row) => row.cells).filter((cell) => cell.text).length;
  const totalCells = tableRows.length * starts.length;
  const filledRatio = totalCells === 0 ? 0 : filledCells / totalCells;
  const multiCellRows = tableRows.filter((row) => row.cells.filter((cell) => cell.text).length >= 2).length;
  const confidence = clamp(
    filledRatio * 0.55 +
      Math.min(1, multiCellRows / Math.max(1, rows.length)) * 0.35 +
      Math.min(1, starts.length / 4) * 0.10,
    0,
    1,
  );

  if (confidence < 0.55) return null;

  const tableData: WriterTableData = {
    columns: starts.map((_, index) => ({
      id: `col-${index + 1}`,
      label: `Column ${index + 1}`,
    })),
    rows: tableRows,
    hasHeaderRow: false,
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
    const tag = tableData.hasHeaderRow && rowIndex === 0 ? 'th' : 'td';

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

function groupCellRuns(items: SelectBoxTextItem[]): Array<{ x: number; text: string }> {
  const sorted = items.slice().sort((a, b) => a.x - b.x);
  const runs: Array<{ x: number; text: string }> = [];
  for (const [index, item] of sorted.entries()) {
    const previous = sorted[index - 1];
    const last = runs.at(-1);
    // A column gap must exceed normal space by a material margin.
    if (previous && last && item.x - (previous.x + previous.width) <= Math.max(12, Math.max(item.fontSize, previous.fontSize) * 1.5)) {
      last.text += rowItemSeparator(sorted, index) + item.text;
    } else runs.push({ x: item.x, text: item.text });
  }
  return runs;
}
function inferColumnStarts(rows: Array<Array<{ x: number; text: string }>>): number[] {
  const clusters: Array<Array<{ x: number; row: number }>> = [];
  const starts = rows.flatMap((runs, row) => runs.map(run => ({ x: run.x, row }))).sort((a, b) => a.x - b.x);
  for (const start of starts) {
    const cluster = clusters.find(candidate => Math.abs(average(candidate.map(item => item.x)) - start.x) <= 12);
    if (cluster) cluster.push(start); else clusters.push([start]);
  }
  return clusters.filter(cluster => new Set(cluster.map(item => item.row)).size >= 2)
    .map(cluster => average(cluster.map(item => item.x))).sort((a, b) => a - b);
}
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }

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