import type { OcrDocumentResult, OcrTableBlock } from '../types';
import { sortPageBlocksInReadingOrder } from '../layout/readingOrderSorter';

export interface OcrMarkdownExportOptions {
  /**
   * Whether to include page divider comments/headers (e.g. "## Page 1").
   * Defaults to true if document has more than 1 page.
   */
  includePageHeaders?: boolean;
  /**
   * Whether to render detected tables as GitHub Flavored Markdown (GFM) tables.
   * Defaults to true.
   */
  includeTables?: boolean;
  /**
   * Whether to normalize special currency and directional glyphs (e.g. ₹, ▲, ▼).
   * Defaults to true.
   */
  normalizeGlyphs?: boolean;
}

export interface OcrJsonExportOptions {
  /**
   * Whether to pretty-print JSON with 2-space indentation.
   * Defaults to true.
   */
  pretty?: boolean;
  /**
   * Whether to apply reading-order sorting to blocks before JSON serialization.
   * Defaults to true.
   */
  sortReadingOrder?: boolean;
}

export interface OcrTextExportOptions {
  /**
   * Whether to include page break banners (e.g. "=== Page 1 of N ===").
   * Defaults to true if document has more than 1 page.
   */
  includePageBanners?: boolean;
  /**
   * Whether to format tables with aligned space-padded columns.
   * Defaults to true.
   */
  alignTableColumns?: boolean;
}

/**
 * Exports an entire OCR document result into clean, formatted GitHub Flavored Markdown (GFM).
 * Headings are inferred or derived from block types, paragraphs follow natural reading order,
 * and tables are converted into markdown tables with column alignment.
 */
export function exportOcrToMarkdown(
  result: OcrDocumentResult,
  options: OcrMarkdownExportOptions = {},
): string {
  if (!result || !result.pages || result.pages.length === 0) {
    return '';
  }

  const includePageHeaders = options.includePageHeaders ?? result.pages.length > 1;
  const includeTables = options.includeTables ?? true;
  const mdParts: string[] = [];

  for (let pIdx = 0; pIdx < result.pages.length; pIdx++) {
    const rawPage = result.pages[pIdx];
    const page = sortPageBlocksInReadingOrder(rawPage);

    if (includePageHeaders) {
      mdParts.push(`## Page ${pIdx + 1}\n`);
    }

    const blocks = page.blocks ?? [];
    for (const block of blocks) {
      if (block.type === 'table') {
        if (includeTables) {
          const tableMd = formatTableBlockToMarkdown(block as OcrTableBlock);
          if (tableMd) {
            mdParts.push(tableMd);
          }
        }
      } else if (block.type === 'heading') {
        const text = block.text?.trim() ?? '';
        if (text) {
          mdParts.push(`### ${text}\n`);
        }
      } else if (block.type === 'equation') {
        const latex = block.latex ?? block.text?.trim() ?? '';
        if (latex) {
          mdParts.push(`$$\n${latex}\n$$\n`);
        }
      } else {
        const text = block.text?.trim() ?? '';
        if (text) {
          mdParts.push(`${text}\n`);
        }
      }
    }

    if (pIdx < result.pages.length - 1 && includePageHeaders) {
      mdParts.push('---\n');
    }
  }

  return mdParts.join('\n').trim();
}

/**
 * Formats a detected OCR table block into a GitHub Flavored Markdown (GFM) table.
 */
export function formatTableBlockToMarkdown(table: OcrTableBlock): string {
  if (!table.rows || table.rows.length === 0) {
    return '';
  }

  const matrix = table.rows.map((row) =>
    (row.cells ?? []).map((cell) => (cell.text ?? '').replace(/\|/g, '\\|').trim()),
  );

  if (matrix.length === 0 || matrix.every((r) => r.length === 0)) {
    return '';
  }

  const colCount = Math.max(...matrix.map((r) => r.length));
  if (colCount === 0) return '';

  const normalizedRows = matrix.map((r) => {
    const row = [...r];
    while (row.length < colCount) {
      row.push('');
    }
    return row;
  });

  const headerRow = normalizedRows[0];
  const separatorRow = Array.from({ length: colCount }, () => ':---');
  const dataRows = normalizedRows.slice(1);

  const lines: string[] = [
    `| ${headerRow.join(' | ')} |`,
    `| ${separatorRow.join(' | ')} |`,
  ];

  for (const row of dataRows) {
    lines.push(`| ${row.join(' | ')} |`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Exports an OCR document result into a structured, validated JSON AST representation.
 */
export function exportOcrToJson(
  result: OcrDocumentResult,
  options: OcrJsonExportOptions = {},
): string {
  if (!result) return '{}';

  const sortOrder = options.sortReadingOrder ?? true;
  const pretty = options.pretty ?? true;

  const exportPages = (result.pages ?? []).map((rawPage, index) => {
    const page = sortOrder ? sortPageBlocksInReadingOrder(rawPage) : rawPage;
    return {
      pageIndex: page.pageIndex ?? index,
      pageNumber: index + 1,
      width: page.width ?? 0,
      height: page.height ?? 0,
      status: page.status,
      blocks: (page.blocks ?? []).map((b, bIdx) => {
        const rect = b.rect ?? b.bbox ?? { x: 0, y: 0, width: 0, height: 0 };
        const base = {
          id: b.id ?? `block-${index}-${bIdx}`,
          readingOrderIndex: bIdx,
          type: b.type,
          text: b.text ?? '',
          confidence: b.confidence ?? 1.0,
          bbox: {
            x: rect.x ?? 0,
            y: rect.y ?? 0,
            width: rect.width ?? 0,
            height: rect.height ?? 0,
          },
        };

        if (b.type === 'table') {
          const t = b as OcrTableBlock;
          const rows = (t.rows ?? []).map((r) =>
            (r.cells ?? []).map((c) => ({
              text: c.text ?? '',
              confidence: c.confidence ?? 1.0,
              bbox: c.bbox ?? { x: 0, y: 0, width: 0, height: 0 },
            })),
          );
          return {
            ...base,
            tableData: {
              rowCount: rows.length,
              columnCount: rows.length > 0 ? Math.max(...rows.map((r) => r.length)) : 0,
              rows,
            },
          };
        }

        return base;
      }),
    };
  });

  const ast = {
    schemaVersion: 'pdfhub-ocr-ast-v1',
    documentFingerprint: result.documentFingerprint,
    pageCount: result.pages?.length ?? 0,
    confidenceSummary: (result as { confidenceSummary?: unknown }).confidenceSummary,
    exportedAt: new Date().toISOString(),
    pages: exportPages,
  };

  return JSON.stringify(ast, null, pretty ? 2 : 0);
}

/**
 * Exports an OCR document result into clean formatted plain text.
 */
export function exportOcrToPlainText(
  result: OcrDocumentResult,
  options: OcrTextExportOptions = {},
): string {
  if (!result || !result.pages || result.pages.length === 0) {
    return '';
  }

  const includeBanners = options.includePageBanners ?? result.pages.length > 1;
  const alignColumns = options.alignTableColumns ?? true;
  const parts: string[] = [];

  for (let pIdx = 0; pIdx < result.pages.length; pIdx++) {
    const rawPage = result.pages[pIdx];
    const page = sortPageBlocksInReadingOrder(rawPage);

    if (includeBanners) {
      parts.push(`=== Page ${pIdx + 1} of ${result.pages.length} ===\n`);
    }

    const blocks = page.blocks ?? [];
    for (const block of blocks) {
      if (block.type === 'table') {
        const textTable = formatTableBlockToPlainText(block as OcrTableBlock, alignColumns);
        if (textTable) {
          parts.push(textTable);
        }
      } else {
        const text = block.text?.trim() ?? '';
        if (text) {
          parts.push(`${text}\n`);
        }
      }
    }

    if (pIdx < result.pages.length - 1 && includeBanners) {
      parts.push('\n');
    }
  }

  return parts.join('\n').trim();
}

/**
 * Formats a table block into aligned plain text with space gutters.
 */
function formatTableBlockToPlainText(table: OcrTableBlock, align: boolean): string {
  if (!table.rows || table.rows.length === 0) return '';

  const matrix = table.rows.map((row) =>
    (row.cells ?? []).map((c) => (c.text ?? '').trim()),
  );

  const colCount = Math.max(...matrix.map((r) => r.length));
  if (colCount === 0) return '';

  if (!align) {
    return matrix.map((row) => row.join('\t')).join('\n') + '\n';
  }

  // Calculate maximum column widths
  const colWidths = Array.from({ length: colCount }, () => 0);
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      colWidths[c] = Math.max(colWidths[c], row[c].length);
    }
  }

  const formattedRows = matrix.map((row) =>
    row
      .map((cell, c) => cell.padEnd(colWidths[c], ' '))
      .join('   '),
  );

  return `${formattedRows.join('\n')}\n`;
}
