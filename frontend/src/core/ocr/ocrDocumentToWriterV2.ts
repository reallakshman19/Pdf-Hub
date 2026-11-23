import type {
  WriterElementV2,
  WriterTableData,
  WriterTableColumn,
  WriterTableRow,
  WriterTableCell,
} from '../writer-v2/types';
import type { OcrDocumentResult, OcrTableBlock } from './types';
import { sortPageBlocksInReadingOrder } from './layout/readingOrderSorter';

export interface OcrWriterConversionOptions {
  /**
   * Document fingerprint to associate with created Writer elements.
   * Defaults to result.documentFingerprint.
   */
  documentFingerprint?: string;
  /**
   * Minimum confidence score (0 to 1) required to convert a block.
   * Blocks below this threshold are skipped. Defaults to 0.0.
   */
  minConfidence?: number;
  /**
   * Whether to include detected tables as 'tableBox' Writer elements.
   * Defaults to true.
   */
  includeTables?: boolean;
  /**
   * Whether to include text paragraphs and headings as 'richTextBox' Writer elements.
   * Defaults to true.
   */
  includeText?: boolean;
  /**
   * Optional custom timestamp ISO string.
   */
  now?: string;
}

export interface OcrDocumentToWriterConversionResult {
  elements: WriterElementV2[];
  pageCount: number;
  convertedBlockCount: number;
  tableCount: number;
  textCount: number;
}

/**
 * Converts a complete multi-page OCR document result into native Writer V2 elements.
 * 
 * Accurately translates:
 * - Table blocks -> 'tableBox' elements with structured columns, rows, and cells.
 * - Text and headings -> 'richTextBox' elements with preserved spatial positioning.
 * - Applies reading-order sorting per page to preserve natural layout sequence.
 */
export function convertOcrDocumentToWriterElements(
  result: OcrDocumentResult,
  options: OcrWriterConversionOptions = {},
): OcrDocumentToWriterConversionResult {
  if (!result || !result.pages || result.pages.length === 0) {
    return {
      elements: [],
      pageCount: 0,
      convertedBlockCount: 0,
      tableCount: 0,
      textCount: 0,
    };
  }

  const fingerprint = options.documentFingerprint || result.documentFingerprint || 'doc-default';
  const minConfidence = options.minConfidence ?? 0.0;
  const includeTables = options.includeTables ?? true;
  const includeText = options.includeText ?? true;
  const timestamp = options.now ?? new Date().toISOString();

  const elements: WriterElementV2[] = [];
  let tableCount = 0;
  let textCount = 0;

  result.pages.forEach((rawPage, pIdx) => {
    const page = sortPageBlocksInReadingOrder(rawPage);
    const pageIndex = page.pageIndex ?? pIdx;
    const blocks = page.blocks ?? [];

    blocks.forEach((block, bIdx) => {
      const confidence = block.confidence ?? 1.0;
      if (confidence < minConfidence) {
        return;
      }

      const rect = block.rect ?? block.bbox ?? { x: 50, y: 50, width: 200, height: 30 };
      const baseId = `ocr-elem-p${pageIndex}-b${bIdx}-${Date.now().toString(36)}`;

      if (block.type === 'table') {
        if (!includeTables) return;

        const tableBlock = block as OcrTableBlock;
        const tableData = convertOcrTableToWriterTableData(tableBlock);

        elements.push({
          id: baseId,
          documentFingerprint: fingerprint,
          pageIndex,
          type: 'tableBox',
          rect: {
            x: rect.x ?? 0,
            y: rect.y ?? 0,
            width: Math.max(20, rect.width ?? 100),
            height: Math.max(20, rect.height ?? 50),
          },
          plainText: tableBlock.rows?.flatMap((r) => r.cells.map((c) => c.text)).join(' ') ?? '',
          tableData,
          review: {
            status: 'open',
            priority: 'medium',
            category: 'general',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          style: {
            zIndex: 10,
            fontFamily: 'Aptos',
            fontSize: 10,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          locked: false,
          hidden: false,
        });
        tableCount++;
      } else {
        if (!includeText) return;

        const plainText = block.type === 'equation'
          ? (block.latex ?? block.text ?? '')
          : (block.text ?? '');

        if (!plainText.trim()) return;

        elements.push({
          id: baseId,
          documentFingerprint: fingerprint,
          pageIndex,
          type: 'richTextBox',
          rect: {
            x: rect.x ?? 0,
            y: rect.y ?? 0,
            width: Math.max(20, rect.width ?? 100),
            height: Math.max(10, rect.height ?? 20),
          },
          plainText,
          review: {
            status: 'open',
            priority: 'medium',
            category: 'general',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          style: {
            zIndex: 10,
            fontFamily: 'Aptos',
            fontSize: 11,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          locked: false,
          hidden: false,
        });
        textCount++;
      }
    });
  });

  return {
    elements,
    pageCount: result.pages.length,
    convertedBlockCount: elements.length,
    tableCount,
    textCount,
  };
}

/**
 * Converts an OcrTableBlock into a compliant WriterTableData structure.
 */
function convertOcrTableToWriterTableData(tableBlock: OcrTableBlock): WriterTableData {
  const ocrRows = tableBlock.rows ?? [];
  const colCount = Math.max(1, ...ocrRows.map((r) => r.cells?.length ?? 0));

  const columns: WriterTableColumn[] = Array.from({ length: colCount }, (_, idx) => ({
    id: `col-${idx}`,
    label: idx === 0 ? 'Column 1' : `Column ${idx + 1}`,
  }));

  const rows: WriterTableRow[] = ocrRows.map((row, rIdx) => {
    const cells: WriterTableCell[] = Array.from({ length: colCount }, (_, cIdx) => {
      const ocrCell = row.cells?.[cIdx];
      return {
        id: ocrCell?.id ?? `cell-${rIdx}-${cIdx}`,
        text: ocrCell?.text ?? '',
        colSpan: ocrCell?.colSpan,
        rowSpan: ocrCell?.rowSpan,
      };
    });

    return {
      id: row.id ?? `row-${rIdx}`,
      cells,
    };
  });

  return {
    columns,
    rows,
    hasHeaderRow: true,
  };
}
