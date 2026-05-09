// @ts-nocheck
import type {
  PlacedElement,
  WriterContentModel,
  WriterImageModel,
  WriterRichTextBlock,
  WriterRichTextModel,
  WriterTableCell,
  WriterTableColumn,
  WriterTableModel,
  WriterTableRow,
  WriterTextRun,
} from './types';

let idCounter = 0;

export function createWriterId(prefix = 'writer'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createTextRun(text: string, patch: Partial<WriterTextRun> = {}): WriterTextRun {
  return {
    id: createWriterId('run'),
    text,
    ...patch,
  };
}

export function createRichTextBlock(
  text = '',
  patch: Partial<WriterRichTextBlock> = {},
): WriterRichTextBlock {
  return {
    id: createWriterId('block'),
    type: 'paragraph',
    runs: [createTextRun(text)],
    ...patch,
  };
}

export function createEmptyRichTextModel(text = ''): WriterRichTextModel {
  return {
    kind: 'rich-text',
    version: 1,
    blocks: [createRichTextBlock(text)],
  };
}

export function createRichTextModelFromPlainText(text: string): WriterRichTextModel {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');

  return {
    kind: 'rich-text',
    version: 1,
    blocks: lines.length > 0
      ? lines.map((line) => createRichTextBlock(line))
      : [createRichTextBlock('')],
  };
}

export function createDefaultTableModel(rows = 3, columns = 3): WriterTableModel {
  const cols: WriterTableColumn[] = Array.from({ length: columns }, (_, index) => ({
    id: createWriterId('col'),
    label: columnLabel(index),
  }));

  const tableRows: WriterTableRow[] = Array.from({ length: rows }, (_, rowIndex) => ({
    id: createWriterId('row'),
    cells: cols.map((col, colIndex) => ({
      id: createWriterId('cell'),
      text: rowIndex === 0 ? col.label : '',
      style: rowIndex === 0 ? { bold: true } : undefined,
    })),
  }));

  return {
    kind: 'table',
    version: 1,
    columns: cols,
    rows: tableRows,
    style: {
      borderColor: '#d1d5db',
      borderWidth: 1,
      headerBackgroundColor: '#f1f5f9',
      cellPadding: 6,
      fontSize: 11,
      fontFamily: 'Arial',
    },
  };
}

export function createTableModelFromMatrix(matrix: string[][]): WriterTableModel {
  const safeMatrix = matrix.length > 0 ? matrix : [['']];
  const columnCount = Math.max(...safeMatrix.map((row) => row.length), 1);

  const columns: WriterTableColumn[] = Array.from({ length: columnCount }, (_, index) => ({
    id: createWriterId('col'),
    label: columnLabel(index),
  }));

  const rows: WriterTableRow[] = safeMatrix.map((row, rowIndex) => ({
    id: createWriterId('row'),
    cells: columns.map((_, colIndex) => ({
      id: createWriterId('cell'),
      text: row[colIndex] ?? '',
      style: rowIndex === 0 ? { bold: true } : undefined,
    })),
  }));

  return {
    kind: 'table',
    version: 1,
    columns,
    rows,
    style: {
      borderColor: '#d1d5db',
      borderWidth: 1,
      headerBackgroundColor: '#f1f5f9',
      cellPadding: 6,
      fontSize: 11,
      fontFamily: 'Arial',
    },
  };
}

export function createImageModel(input: {
  src: string;
  mimeType: string;
  naturalWidth?: number;
  naturalHeight?: number;
  alt?: string;
}): WriterImageModel {
  return {
    kind: 'image',
    version: 1,
    src: input.src,
    mimeType: input.mimeType,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight,
    alt: input.alt,
    rotation: 0,
    opacity: 1,
    borderWidth: 0,
  };
}

export function normalizeWriterContentModel(model: WriterContentModel): WriterContentModel {
  if (model.kind === 'rich-text') return normalizeRichTextModel(model);
  if (model.kind === 'table') return normalizeTableModel(model);
  if (model.kind === 'image') return normalizeImageModel(model);
  return model;
}

export function normalizeRichTextModel(model: WriterRichTextModel): WriterRichTextModel {
  return {
    kind: 'rich-text',
    version: 1,
    blocks: Array.isArray(model.blocks) && model.blocks.length > 0
      ? model.blocks.map((block) => ({
          id: block.id || createWriterId('block'),
          type: block.type || 'paragraph',
          align: block.align,
          level: block.level,
          runs: Array.isArray(block.runs) && block.runs.length > 0
            ? block.runs.map((run) => ({
                id: run.id || createWriterId('run'),
                text: String(run.text ?? ''),
                bold: run.bold,
                italic: run.italic,
                underline: run.underline,
                strike: run.strike,
                color: run.color,
                backgroundColor: run.backgroundColor,
                fontSize: run.fontSize,
                fontFamily: run.fontFamily,
                superscript: run.superscript,
                subscript: run.subscript,
              }))
            : [createTextRun('')],
        }))
      : [createRichTextBlock('')],
  };
}

export function normalizeTableModel(model: WriterTableModel): WriterTableModel {
  const columns = Array.isArray(model.columns) && model.columns.length > 0
    ? model.columns.map((col, index) => ({
        id: col.id || createWriterId('col'),
        label: col.label || columnLabel(index),
        width: col.width,
      }))
    : [{ id: createWriterId('col'), label: 'A' }];

  const rows = Array.isArray(model.rows) && model.rows.length > 0
    ? model.rows.map((row) => ({
        id: row.id || createWriterId('row'),
        cells: columns.map((_, index) => normalizeTableCell(row.cells?.[index])),
      }))
    : [
        {
          id: createWriterId('row'),
          cells: columns.map(() => normalizeTableCell(undefined)),
        },
      ];

  return {
    kind: 'table',
    version: 1,
    columns,
    rows,
    style: model.style,
  };
}

export function normalizeTableCell(cell: WriterTableCell | undefined): WriterTableCell {
  return {
    id: cell?.id || createWriterId('cell'),
    text: String(cell?.text ?? ''),
    richText: cell?.richText ? normalizeRichTextModel(cell.richText) : undefined,
    colspan: cell?.colspan,
    rowspan: cell?.rowspan,
    style: cell?.style,
  };
}

export function normalizeImageModel(model: WriterImageModel): WriterImageModel {
  return {
    kind: 'image',
    version: 1,
    src: String(model.src ?? ''),
    mimeType: model.mimeType || inferMimeTypeFromDataUrl(model.src) || 'image/png',
    naturalWidth: model.naturalWidth,
    naturalHeight: model.naturalHeight,
    alt: model.alt,
    crop: model.crop,
    rotation: Number.isFinite(model.rotation) ? model.rotation : 0,
    opacity: Number.isFinite(model.opacity) ? model.opacity : 1,
    borderColor: model.borderColor,
    borderWidth: Number.isFinite(model.borderWidth) ? model.borderWidth : 0,
  };
}

export function normalizeWriterElement(element: PlacedElement): PlacedElement {
  const contentModel = element.contentModel
    ? normalizeWriterContentModel(element.contentModel)
    : undefined;

  return {
    ...element,
    id: element.id || createWriterId('element'),
    pageNumber: Math.max(1, Math.floor(element.pageNumber || 1)),
    x: finiteOr(element.x, 0),
    y: finiteOr(element.y, 0),
    width: Math.max(1, finiteOr(element.width, 160)),
    height: Math.max(1, finiteOr(element.height, 60)),
    content: String(element.content ?? ''),
    contentModel,
    zIndex: finiteOr(element.zIndex, 0),
    hidden: Boolean(element.hidden),
    locked: Boolean(element.locked),
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function inferMimeTypeFromDataUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const match = /^data:([^;,]+)[;,]/i.exec(src);
  return match?.[1];
}

function columnLabel(index: number): string {
  let n = index + 1;
  let out = '';

  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }

  return out;
}
