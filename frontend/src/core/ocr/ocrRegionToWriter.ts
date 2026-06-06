import type {
  WriterElementV2,
  WriterTableCell,
  WriterTableData,
  WriterTableRow,
  WriterReviewMetadata,
} from '../writer-v2/types';
import type {
  OcrAnyBlock,
  OcrTableBlock,
  OcrTableCell,
} from './types';
import type {
  OcrRegionResult,
} from './ocrRegionModel';

export type OcrRegionWriterOutputMode =
  | 'richTextBox'
  | 'richNote'
  | 'reviewLabel'
  | 'tableBox';

export interface OcrRegionToWriterOptions {
  outputMode: OcrRegionWriterOutputMode;
  now?: string;

  /**
   * For table OCR: use first OCR table row as column labels.
   */
  useFirstRowAsHeader?: boolean;

  /**
   * For text OCR: minimum block confidence to include.
   */
  minConfidence?: number;
}

export interface OcrRegionToWriterResult {
  element: WriterElementV2 | null;
  diagnostics: Array<{
    level: 'info' | 'warning' | 'error';
    code:
      | 'NO_OCR_TEXT'
      | 'NO_OCR_TABLE'
      | 'UNSUPPORTED_OUTPUT_MODE'
      | 'OCR_REGION_CONVERTED';
    message: string;
  }>;
}

export function ocrRegionResultToWriterElement(
  regionResult: OcrRegionResult,
  options: OcrRegionToWriterOptions,
): OcrRegionToWriterResult {
  if (options.outputMode === 'tableBox') {
    return ocrRegionResultToTableBox(regionResult, options);
  }

  return ocrRegionResultToTextElement(regionResult, options);
}

export function ocrTableBlockToWriterTableData(
  tableBlock: OcrTableBlock,
  options: {
    useFirstRowAsHeader?: boolean;
  } = {},
): WriterTableData {
  const useHeader = options.useFirstRowAsHeader ?? true;
  const maxColumnCount = Math.max(
    1,
    ...tableBlock.rows.map((row) => row.cells.length),
  );

  const headerRow = useHeader ? tableBlock.rows[0] : undefined;
  const bodyRows = useHeader
    ? tableBlock.rows.slice(1)
    : tableBlock.rows;

  const columns = Array.from({ length: maxColumnCount }, (_, columnIndex) => {
    const headerCell = headerRow?.cells[columnIndex];

    return {
      id: `ocr-col-${columnIndex + 1}`,
      label: headerCell?.text || `Column ${columnIndex + 1}`,
      width: estimateColumnWidth(tableBlock, columnIndex),
      style: {
        alignment: 'left' as const,
      },
    };
  });

  const rows: WriterTableRow[] = bodyRows.map((row, rowIndex) => ({
    id: `ocr-row-${rowIndex + 1}`,
    cells: columns.map((_, columnIndex) =>
      ocrTableCellToWriterCell(
        row.cells[columnIndex],
        rowIndex,
        columnIndex,
      ),
    ),
  }));

  return {
    hasHeaderRow: true,
    columns,
    rows: rows.length > 0
      ? rows
      : [
          {
            id: 'ocr-row-empty',
            cells: columns.map((_, columnIndex) => ({
              id: `ocr-empty-cell-${columnIndex + 1}`,
              text: '',
            })),
          },
        ],
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
    headerCellStyle: {
      bold: true,
      alignment: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#E2E8F0',
    },
  };
}

function ocrRegionResultToTextElement(
  regionResult: OcrRegionResult,
  options: OcrRegionToWriterOptions,
): OcrRegionToWriterResult {
  const minConfidence = options.minConfidence ?? 0;
  const blocks = regionResult.blocks.filter((block) =>
    block.type !== 'table' && (block.confidence ?? 0) >= minConfidence,
  );

  const text = blocks.length > 0
    ? blocks.map((block) => block.text).filter(Boolean).join('\n').trim()
    : regionResult.text.trim();

  if (!text) {
    return {
      element: null,
      diagnostics: [
        {
          level: 'warning',
          code: 'NO_OCR_TEXT',
          message: 'OCR region did not contain text suitable for Writer conversion.',
        },
      ],
    };
  }

  const now = options.now ?? new Date().toISOString();
  const type = options.outputMode;

  if (
    type !== 'richTextBox'
    && type !== 'richNote'
    && type !== 'reviewLabel'
  ) {
    return {
      element: null,
      diagnostics: [
        {
          level: 'error',
          code: 'UNSUPPORTED_OUTPUT_MODE',
          message: `Unsupported OCR text output mode: ${type}`,
        },
      ],
    };
  }

  const element: WriterElementV2 = {
    id: `ocr-${type}-${regionResult.region.id}`,
    documentFingerprint: regionResult.region.documentFingerprint,
    pageIndex: regionResult.region.pageIndex,
    type,
    rect: regionResult.region.bbox,
    plainText: text,
    style: createDefaultWriterStyle(type),
    review: type === 'reviewLabel'
      ? ({
          status: 'open',
          priority: 'medium',
          category: 'ocr',
          comment: text,
          commentId: `ocr-comment-${regionResult.region.id}`,
          createdAt: now,
          updatedAt: now,
        } as unknown as WriterReviewMetadata)
      : undefined,
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };

  return {
    element,
    diagnostics: [
      {
        level: 'info',
        code: 'OCR_REGION_CONVERTED',
        message: `OCR region converted to ${type}.`,
      },
    ],
  };
}

function ocrRegionResultToTableBox(
  regionResult: OcrRegionResult,
  options: OcrRegionToWriterOptions,
): OcrRegionToWriterResult {
  const tableBlock = findBestTableBlock(regionResult.blocks);

  if (!tableBlock) {
    return {
      element: null,
      diagnostics: [
        {
          level: 'warning',
          code: 'NO_OCR_TABLE',
          message: 'OCR region did not contain a table block.',
        },
      ],
    };
  }

  const now = options.now ?? new Date().toISOString();

  const element: WriterElementV2 = {
    id: `ocr-tableBox-${regionResult.region.id}`,
    documentFingerprint: regionResult.region.documentFingerprint,
    pageIndex: regionResult.region.pageIndex,
    type: 'tableBox',
    rect: regionResult.region.bbox,
    plainText: tableBlock.text,
    tableData: ocrTableBlockToWriterTableData(tableBlock, {
      useFirstRowAsHeader: options.useFirstRowAsHeader,
    }),
    style: createDefaultWriterStyle('tableBox'),
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };

  return {
    element,
    diagnostics: [
      {
        level: 'info',
        code: 'OCR_REGION_CONVERTED',
        message: 'OCR region converted to tableBox.',
      },
    ],
  };
}

function findBestTableBlock(
  blocks: OcrAnyBlock[],
): OcrTableBlock | null {
  const tables = blocks.filter((block): block is OcrTableBlock =>
    block.type === 'table',
  );

  if (tables.length === 0) {
    return null;
  }

  return [...tables].sort((a, b) => {
    const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    return b.rows.length - a.rows.length;
  })[0];
}

function ocrTableCellToWriterCell(
  cell: OcrTableCell | undefined,
  rowIndex: number,
  columnIndex: number,
): WriterTableCell {
  return {
    id: `ocr-cell-${rowIndex + 1}-${columnIndex + 1}`,
    text: cell?.text ?? '',
    colSpan: cell?.colSpan,
    rowSpan: cell?.rowSpan,
    style: cell && cell.confidence < 0.7
      ? {
          backgroundColor: '#FEF3C7',
        }
      : undefined,
  };
}

function estimateColumnWidth(
  tableBlock: OcrTableBlock,
  columnIndex: number,
): number {
  const widths = tableBlock.rows
    .map((row) => row.cells[columnIndex]?.bbox.width)
    .filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value > 0,
    );

  if (widths.length === 0) {
    return 120;
  }

  return Math.max(
    48,
    Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length),
  );
}

function createDefaultWriterStyle(
  type: WriterElementV2['type'],
): WriterElementV2['style'] {
  if (type === 'reviewLabel') {
    return {
      zIndex: 20,
      fontFamily: 'Aptos',
      fontSize: 10,
      textColor: '#92400E',
      backgroundColor: '#FEF3C7',
      borderColor: '#F59E0B',
      borderWidth: 1,
      padding: 6,
      opacity: 1,
    };
  }

  if (type === 'richNote') {
    return {
      zIndex: 20,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#1E293B',
      backgroundColor: '#F8FAFC',
      borderColor: '#CBD5E1',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    };
  }

  if (type === 'tableBox') {
    return {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 10,
      textColor: '#111827',
      backgroundColor: '#FFFFFF',
      borderColor: '#CBD5E1',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    };
  }

  return {
    zIndex: 10,
    fontFamily: 'Aptos',
    fontSize: 11,
    textColor: '#111827',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    padding: 4,
    opacity: 1,
  };
}
