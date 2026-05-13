import type { WriterTableData } from '../types';

export function clipboardHtmlContainsTable(html: string): boolean {
  if (!html.trim()) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  return !!doc.querySelector('table');
}

export function extractFirstTableFromClipboardHtml(html: string): WriterTableData | null {
  if (!html.trim()) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');

  if (!table) return null;

  const rowElements = [...table.querySelectorAll('tr')];

  const rows = rowElements.map((row, rowIndex) => {
    const cellElements = [...row.querySelectorAll('th,td')];

    return {
      id: `row-${rowIndex + 1}`,
      cells: cellElements.map((cell, cellIndex) => ({
        id: `cell-${rowIndex + 1}-${cellIndex + 1}`,
        text: normalizeCellText(cell.textContent ?? ''),
        colSpan: numericAttr(cell, 'colspan'),
        rowSpan: numericAttr(cell, 'rowspan'),
      })),
    };
  }).filter((row) => row.cells.length > 0);

  const columnCount = Math.max(
    1,
    ...rows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)),
  );

  return {
    columns: Array.from({ length: columnCount }, (_, index) => ({
      id: `col-${index + 1}`,
      label: `Column ${index + 1}`,
    })),
    rows,
  };
}

function normalizeCellText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

function numericAttr(element: Element, attr: string): number | undefined {
  const raw = element.getAttribute(attr);
  if (!raw) return undefined;

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 1 ? value : undefined;
}
