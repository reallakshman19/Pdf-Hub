import type { PdfRect } from '../writer-v2/types';
import type {
  WriterTableCell,
  WriterTableData,
  WriterTableRow,
} from '../writer-v2/types';
import type {
  OcrTableBlock,
  OcrTableCell,
  OcrTableRow,
} from './types';

export interface OcrTableReviewColumn {
  id: string;
  label: string;
  width: number;
  sourceCellId?: string;
}

export interface OcrTableReviewCell {
  id: string;
  sourceCellId?: string;
  rowIndex: number;
  columnIndex: number;
  originalText: string;
  text: string;
  confidence: number;
  bbox?: PdfRect;
  rowSpan?: number;
  colSpan?: number;
  edited: boolean;
}

export interface OcrTableReviewRow {
  id: string;
  sourceRowId?: string;
  rowIndex: number;
  cells: OcrTableReviewCell[];
}

export interface OcrTableReviewModel {
  id: string;
  pageIndex: number;
  bbox: PdfRect;
  confidence: number;
  hasHeaderRow: boolean;
  columns: OcrTableReviewColumn[];
  rows: OcrTableReviewRow[];
  sourceBlockId: string;
  sourceText: string;
}

export interface CreateOcrTableReviewModelOptions {
  useFirstRowAsHeader?: boolean;
  fallbackColumnWidth?: number;
}

export function createOcrTableReviewModel(
  tableBlock: OcrTableBlock,
  options: CreateOcrTableReviewModelOptions = {},
): OcrTableReviewModel {
  const useFirstRowAsHeader = options.useFirstRowAsHeader ?? true;
  const fallbackColumnWidth = options.fallbackColumnWidth ?? 120;
  const maxColumnCount = getMaxColumnCount(tableBlock.rows);
  const headerRow = useFirstRowAsHeader ? tableBlock.rows[0] : undefined;
  const bodyRows = useFirstRowAsHeader
    ? tableBlock.rows.slice(1)
    : tableBlock.rows;

  const columns: OcrTableReviewColumn[] = Array.from(
    { length: Math.max(1, maxColumnCount) },
    (_, columnIndex) => {
      const headerCell = headerRow?.cells[columnIndex];

      return {
        id: `ocr-review-col-${columnIndex + 1}`,
        label: headerCell?.text || `Column ${columnIndex + 1}`,
        width: estimateReviewColumnWidth(
          tableBlock,
          columnIndex,
          fallbackColumnWidth,
        ),
        sourceCellId: headerCell?.id,
      };
    },
  );

  const rows: OcrTableReviewRow[] = bodyRows.map((row, rowIndex) =>
    createReviewRow({
      row,
      rowIndex,
      columnCount: columns.length,
    }),
  );

  return {
    id: `ocr-table-review-${tableBlock.id}`,
    pageIndex: tableBlock.pageIndex ?? 0,
    bbox: tableBlock.bbox ?? tableBlock.rect,
    confidence: tableBlock.confidence ?? 0,
    hasHeaderRow: useFirstRowAsHeader,
    columns,
    rows: rows.length > 0
      ? rows
      : [
          {
            id: 'ocr-review-row-empty',
            rowIndex: 0,
            cells: columns.map((_, columnIndex) =>
              createEmptyReviewCell(0, columnIndex),
            ),
          },
        ],
    sourceBlockId: tableBlock.id,
    sourceText: tableBlock.text ?? '',
  };
}

export function updateOcrTableReviewCellText(
  model: OcrTableReviewModel,
  input: {
    rowIndex: number;
    columnIndex: number;
    text: string;
  },
): OcrTableReviewModel {
  return {
    ...model,
    rows: model.rows.map((row) => {
      if (row.rowIndex !== input.rowIndex) {
        return row;
      }

      return {
        ...row,
        cells: row.cells.map((cell) => {
          if (cell.columnIndex !== input.columnIndex) {
            return cell;
          }

          return {
            ...cell,
            text: input.text,
            edited: input.text !== cell.originalText,
          };
        }),
      };
    }),
  };
}

export function renameOcrTableReviewColumn(
  model: OcrTableReviewModel,
  input: {
    columnIndex: number;
    label: string;
  },
): OcrTableReviewModel {
  return {
    ...model,
    columns: model.columns.map((column, columnIndex) =>
      columnIndex === input.columnIndex
        ? {
            ...column,
            label: input.label,
          }
        : column,
    ),
  };
}

export function setOcrTableReviewHeaderMode(
  model: OcrTableReviewModel,
  hasHeaderRow: boolean,
): OcrTableReviewModel {
  return {
    ...model,
    hasHeaderRow,
  };
}

export function getLowConfidenceOcrTableCells(
  model: OcrTableReviewModel,
  threshold = 0.7,
): OcrTableReviewCell[] {
  return model.rows.flatMap((row) =>
    row.cells.filter((cell) => cell.confidence < threshold),
  );
}

export function ocrTableReviewModelToWriterTableData(
  model: OcrTableReviewModel,
): WriterTableData {
  const columns = model.columns.map((column) => ({
    id: column.id,
    label: column.label || 'Column',
    width: column.width,
    style: {
      alignment: 'left' as const,
    },
  }));

  const rows: WriterTableRow[] = model.rows.map((row) => ({
    id: row.id,
    cells: columns.map((_, columnIndex) => {
      const reviewCell = row.cells[columnIndex];

      return reviewCellToWriterCell(
        reviewCell ?? createEmptyReviewCell(row.rowIndex, columnIndex),
      );
    }),
  }));

  return {
    hasHeaderRow: model.hasHeaderRow,
    columns,
    rows,
    defaultCellStyle: {
      fontFamily: 'Aptos',
      fontSize: 10,
      textColor: '#111827',
      padding: 6,
      alignment: 'left',
      verticalAlign: 'top',
      borders: {
        top: { style: 'single', color: '#CBD5E1', width: 0.5 },
        right: { style: 'single', color: '#CBD5E1', width: 0.5 },
        bottom: { style: 'single', color: '#CBD5E1', width: 0.5 },
        left: { style: 'single', color: '#CBD5E1', width: 0.5 },
      },
    },
    headerCellStyle: model.hasHeaderRow
      ? {
          bold: true,
          alignment: 'center',
          verticalAlign: 'middle',
          backgroundColor: '#E2E8F0',
        }
      : undefined,
  };
}

export function ocrTableReviewModelToPlainText(
  model: OcrTableReviewModel,
): string {
  const header = model.hasHeaderRow
    ? `${model.columns.map((column) => column.label).join('\t')}\n`
    : '';

  const body = model.rows
    .map((row) => row.cells.map((cell) => cell.text).join('\t'))
    .join('\n');

  return `${header}${body}`.trim();
}

function createReviewRow(input: {
  row: OcrTableRow;
  rowIndex: number;
  columnCount: number;
}): OcrTableReviewRow {
  return {
    id: `ocr-review-row-${input.rowIndex + 1}`,
    sourceRowId: input.row.id,
    rowIndex: input.rowIndex,
    cells: Array.from({ length: input.columnCount }, (_, columnIndex) =>
      ocrCellToReviewCell(
        input.row.cells[columnIndex],
        input.rowIndex,
        columnIndex,
      ),
    ),
  };
}

function ocrCellToReviewCell(
  cell: OcrTableCell | undefined,
  rowIndex: number,
  columnIndex: number,
): OcrTableReviewCell {
  if (!cell) {
    return createEmptyReviewCell(rowIndex, columnIndex);
  }

  return {
    id: `ocr-review-cell-${rowIndex + 1}-${columnIndex + 1}`,
    sourceCellId: cell.id,
    rowIndex,
    columnIndex,
    originalText: cell.text,
    text: cell.text,
    confidence: cell.confidence,
    bbox: cell.bbox,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
    edited: false,
  };
}

function createEmptyReviewCell(
  rowIndex: number,
  columnIndex: number,
): OcrTableReviewCell {
  return {
    id: `ocr-review-cell-${rowIndex + 1}-${columnIndex + 1}`,
    rowIndex,
    columnIndex,
    originalText: '',
    text: '',
    confidence: 0,
    edited: false,
  };
}

function reviewCellToWriterCell(
  cell: OcrTableReviewCell,
): WriterTableCell {
  return {
    id: cell.id,
    text: cell.text,
    colSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    style: {
      backgroundColor: cell.confidence < 0.7
        ? '#FEF3C7'
        : undefined,
    },
  };
}

function getMaxColumnCount(rows: OcrTableRow[]): number {
  return Math.max(
    1,
    ...rows.map((row) => row.cells.length),
  );
}

function estimateReviewColumnWidth(
  tableBlock: OcrTableBlock,
  columnIndex: number,
  fallbackColumnWidth: number,
): number {
  const widths = tableBlock.rows
    .map((row) => row.cells[columnIndex]?.bbox.width)
    .filter((width): width is number =>
      typeof width === 'number'
      && Number.isFinite(width)
      && width > 0,
    );

  if (widths.length === 0) {
    return fallbackColumnWidth;
  }

  return Math.max(
    48,
    Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length),
  );
}
