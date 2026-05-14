import type {
  SelectBoxCopyResult,
  SelectBoxTextItem,
  SelectBoxTextRow,
} from './types';
import { rowsToPlainText } from './textGrouping';
import { reconstructTableFromRows } from './tableReconstruction';

export function buildSelectBoxCopyResult(input: {
  pageNumber: number;
  pageIndex: number;
  viewportRect: SelectBoxCopyResult['viewportRect'];
  pdfRect: SelectBoxCopyResult['pdfRect'];
  items: SelectBoxTextItem[];
  rows: SelectBoxTextRow[];
  imageDataUrl?: string;
}): SelectBoxCopyResult {
  const plainText = rowsToPlainText(input.rows);
  const html = rowsToHtml(input.rows);
  const table = reconstructTableFromRows(input.rows);

  return {
    pageNumber: input.pageNumber,
    pageIndex: input.pageIndex,
    viewportRect: input.viewportRect,
    pdfRect: input.pdfRect,
    items: input.items,
    rows: input.rows,
    plainText,
    html,
    table,
    imageDataUrl: input.imageDataUrl,
  };
}

export function rowsToHtml(rows: SelectBoxTextRow[]): string {
  return rows
    .map((row) => {
      const spans = row.items
        .map((item) => {
          const fontSize = Math.max(6, Math.round(item.fontSize * 10) / 10);

          return `<span style="font-size:${fontSize}px">${escapeHtml(item.text)}</span>`;
        })
        .join('');

      return `<p>${spans}</p>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}