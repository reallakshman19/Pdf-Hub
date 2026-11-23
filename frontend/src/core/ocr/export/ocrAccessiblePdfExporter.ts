/**
 * Accessible Tagged PDF (PDF/UA) & Multi-Format Document Exporter.
 *
 * Generates semantic accessibility structure trees (/StructTreeRoot) conforming to
 * PDF/UA & Section 508 standards, as well as multi-format exports for Markdown (.md),
 * Plain Text (.txt), and ePub-compatible XHTML.
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain types, no console.log.
 */

import type { OcrDocumentResult, OcrTableBlock } from '../types';

export type PdfUaStandardTag =
  | 'Document'
  | 'Part'
  | 'Art'
  | 'Sect'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H5'
  | 'H6'
  | 'P'
  | 'Table'
  | 'TR'
  | 'TH'
  | 'TD'
  | 'Lbl'
  | 'LBody'
  | 'Form';

export interface PdfUaStructElement {
  id: string;
  type: PdfUaStandardTag;
  pageIndex: number;
  text?: string;
  children?: PdfUaStructElement[];
  attributes?: Record<string, string | number>;
}

export interface PdfUaStructureTree {
  title: string;
  language: string;
  rootElement: PdfUaStructElement;
  totalElements: number;
}

export interface AccessibleExportOptions {
  title?: string;
  language?: string;
  includePageMarkers?: boolean;
  includeTables?: boolean;
}

/**
 * Builds a PDF/UA structure tree from recognized OCR pages and blocks.
 */
export function buildPdfUaStructureTree(
  doc: OcrDocumentResult,
  options: AccessibleExportOptions = {},
): PdfUaStructureTree {
  const title = options.title ?? 'Accessible OCR Document';
  const language = options.language ?? 'en';
  let elementCount = 0;

  const docChildren: PdfUaStructElement[] = [];

  for (const page of doc.pages) {
    const pageIdx = page.pageIndex ?? 0;
    const sectChildren: PdfUaStructElement[] = [];

    // Analyze lines and blocks
    const lines = page.lines ?? [];
    let currentParagraphLines: string[] = [];

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        elementCount++;
        sectChildren.push({
          id: `p-${pageIdx}-${sectChildren.length}`,
          type: 'P',
          pageIndex: pageIdx,
          text: currentParagraphLines.join(' '),
        });
        currentParagraphLines = [];
      }
    };

    for (const line of lines) {
      const text = line.text.trim();
      if (!text) continue;

      // Detect potential headings (e.g. short uppercase or title lines)
      const isHeading =
        text.length < 60 &&
        (text === text.toUpperCase() || text.endsWith(':') || (line.bbox && line.bbox.height > 16));

      if (isHeading) {
        flushParagraph();
        elementCount++;
        sectChildren.push({
          id: `h2-${pageIdx}-${sectChildren.length}`,
          type: 'H2',
          pageIndex: pageIdx,
          text,
        });
      } else {
        currentParagraphLines.push(text);
      }
    }

    flushParagraph();

    // Check for tables in blocks
    const tableBlocks = (page.blocks ?? []).filter((b): b is OcrTableBlock => b.type === 'table');
    for (const tbl of tableBlocks) {
      elementCount++;
      const trElements: PdfUaStructElement[] = [];

      for (let rIdx = 0; rIdx < tbl.rows.length; rIdx++) {
        elementCount++;
        const row = tbl.rows[rIdx];
        const cellElements: PdfUaStructElement[] = [];

        for (const cell of row.cells) {
          elementCount++;
          cellElements.push({
            id: `td-${pageIdx}-${cell.id}`,
            type: rIdx === 0 ? 'TH' : 'TD',
            pageIndex: pageIdx,
            text: cell.text,
          });
        }

        trElements.push({
          id: `tr-${pageIdx}-${rIdx}`,
          type: 'TR',
          pageIndex: pageIdx,
          children: cellElements,
        });
      }

      sectChildren.push({
        id: `tbl-${pageIdx}-${tbl.id}`,
        type: 'Table',
        pageIndex: pageIdx,
        children: trElements,
      });
    }

    elementCount++;
    docChildren.push({
      id: `sect-page-${pageIdx}`,
      type: 'Sect',
      pageIndex: pageIdx,
      children: sectChildren,
    });
  }

  elementCount++;
  const rootElement: PdfUaStructElement = {
    id: 'struct-root',
    type: 'Document',
    pageIndex: 0,
    children: docChildren,
  };

  return {
    title,
    language,
    rootElement,
    totalElements: elementCount,
  };
}

/**
 * Serializes OCR document into formatted Markdown with frontmatter.
 */
export function exportToMarkdown(
  doc: OcrDocumentResult,
  options: AccessibleExportOptions = {},
): string {
  const title = options.title ?? 'OCR Document';
  const includeMarkers = options.includePageMarkers ?? true;
  const parts: string[] = [];

  // YAML Frontmatter
  parts.push('---');
  parts.push(`title: "${title}"`);
  parts.push(`pageCount: ${doc.pages.length}`);
  parts.push(`createdAt: "${doc.createdAt}"`);
  parts.push('generator: "DocCraft Accessible OCR Engine"');
  parts.push('---\n');

  parts.push(`# ${title}\n`);

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageNum = page.pageNumber ?? i + 1;

    if (includeMarkers) {
      parts.push(`\n<!-- Page ${pageNum} -->\n`);
    }

    const lines = page.lines ?? [];
    for (const l of lines) {
      const text = l.text.trim();
      if (!text) continue;

      if (text.startsWith('#')) {
        parts.push(text);
      } else if (text.endsWith(':') && text.length < 50) {
        parts.push(`\n### ${text}\n`);
      } else {
        parts.push(text);
      }
    }

    // Include tables if any
    const tableBlocks = (page.blocks ?? []).filter((b): b is OcrTableBlock => b.type === 'table');
    for (const tbl of tableBlocks) {
      parts.push('\n');
      for (let r = 0; r < tbl.rows.length; r++) {
        const row = tbl.rows[r];
        const cells = row.cells.map((c) => c.text.replace(/\|/g, '\\|').trim());
        parts.push(`| ${cells.join(' | ')} |`);
        if (r === 0) {
          parts.push(`| ${cells.map(() => '---').join(' | ')} |`);
        }
      }
      parts.push('\n');
    }
  }

  return parts.join('\n');
}

/**
 * Serializes OCR document into clean plain text.
 */
export function exportToPlainText(doc: OcrDocumentResult): string {
  const pages: string[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageNum = page.pageNumber ?? i + 1;
    const pageHeader = `=== Page ${pageNum} ===\n`;
    const lines = (page.lines ?? []).map((l) => l.text).join('\n');
    pages.push(pageHeader + lines);
  }

  return pages.join('\n\n');
}

/**
 * Serializes OCR document into W3C valid ePub XHTML.
 */
export function exportToEpubXhtml(
  doc: OcrDocumentResult,
  options: AccessibleExportOptions = {},
): string {
  const title = options.title ?? 'Accessible Document';
  const lang = options.language ?? 'en';

  const bodyParts: string[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageNum = page.pageNumber ?? i + 1;

    bodyParts.push(`  <section id="page-${pageNum}" role="doc-pagebreak" aria-label="Page ${pageNum}">`);
    bodyParts.push(`    <h2 class="page-header">Page ${pageNum}</h2>`);

    const lines = page.lines ?? [];
    for (const line of lines) {
      const text = line.text.trim();
      if (!text) continue;

      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      bodyParts.push(`    <p>${escaped}</p>`);
    }

    bodyParts.push('  </section>');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; margin: 2rem; color: #1f2937; }
    .page-header { font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
    p { margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
${bodyParts.join('\n')}
</body>
</html>`;
}
