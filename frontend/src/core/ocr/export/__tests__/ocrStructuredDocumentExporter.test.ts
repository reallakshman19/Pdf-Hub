import { describe, it, expect } from 'vitest';
import {
  exportOcrToMarkdown,
  exportOcrToJson,
  exportOcrToPlainText,
  formatTableBlockToMarkdown,
} from '../ocrStructuredDocumentExporter';
import type { OcrDocumentResult, OcrTableBlock } from '../../types';

describe('ocrStructuredDocumentExporter', () => {
  const sampleTable: OcrTableBlock = {
    id: 'table-1',
    type: 'table',
    rect: { x: 50, y: 150, width: 400, height: 100 },
    rows: [
      {
        id: 'row-0',
        cells: [
          { id: 'c0_0', text: 'Index', confidence: 0.99, bbox: { x: 50, y: 150, width: 100, height: 25 } },
          { id: 'c0_1', text: 'Value', confidence: 0.99, bbox: { x: 150, y: 150, width: 100, height: 25 } },
          { id: 'c0_2', text: 'Change', confidence: 0.99, bbox: { x: 250, y: 150, width: 100, height: 25 } },
        ],
      },
      {
        id: 'row-1',
        cells: [
          { id: 'c1_0', text: 'NIFTY 50', confidence: 0.95, bbox: { x: 50, y: 175, width: 100, height: 25 } },
          { id: 'c1_1', text: '24,148.20', confidence: 0.98, bbox: { x: 150, y: 175, width: 100, height: 25 } },
          { id: 'c1_2', text: '▲ 0.56%', confidence: 0.95, bbox: { x: 250, y: 175, width: 100, height: 25 } },
        ],
      },
      {
        id: 'row-2',
        cells: [
          { id: 'c2_0', text: 'SENSEX', confidence: 0.96, bbox: { x: 50, y: 200, width: 100, height: 25 } },
          { id: 'c2_1', text: '79,402.29', confidence: 0.97, bbox: { x: 150, y: 200, width: 100, height: 25 } },
          { id: 'c2_2', text: '▲ 0.53%', confidence: 0.96, bbox: { x: 250, y: 200, width: 100, height: 25 } },
        ],
      },
    ],
  };

  const sampleResult: OcrDocumentResult & { confidenceSummary?: unknown } = {
    documentFingerprint: 'doc-export-test',
    createdAt: '2026-11-23T00:00:00.000Z',
    engineId: 'tesseract.js',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        status: 'complete',
        pageIndex: 0,
        pageNumber: 1,
        width: 612,
        height: 792,
        blocks: [
          {
            id: 'h1',
            type: 'heading',
            text: 'Market Summary Report',
            rect: { x: 50, y: 40, width: 500, height: 30 },
          },
          {
            id: 'p1',
            type: 'paragraph',
            text: 'Markets opened strongly on Monday following positive global cues.',
            rect: { x: 50, y: 90, width: 500, height: 40 },
          },
          sampleTable,
          {
            id: 'eq1',
            type: 'equation',
            latex: 'E = mc^2',
            text: 'E = mc^2',
            rect: { x: 50, y: 270, width: 200, height: 40 },
          },
        ],
      },
      {
        status: 'complete',
        pageIndex: 1,
        pageNumber: 2,
        width: 612,
        height: 792,
        blocks: [
          {
            id: 'p2',
            type: 'paragraph',
            text: 'Concluding remarks on fiscal performance.',
            rect: { x: 50, y: 50, width: 500, height: 30 },
          },
        ],
      },
    ],
  };

  describe('formatTableBlockToMarkdown', () => {
    it('formats OcrTableBlock into standard GFM markdown table', () => {
      const md = formatTableBlockToMarkdown(sampleTable);
      expect(md).toContain('| Index | Value | Change |');
      expect(md).toContain('| :--- | :--- | :--- |');
      expect(md).toContain('| NIFTY 50 | 24,148.20 | ▲ 0.56% |');
      expect(md).toContain('| SENSEX | 79,402.29 | ▲ 0.53% |');
    });

    it('returns empty string for table without rows', () => {
      expect(formatTableBlockToMarkdown({ id: 't-empty', type: 'table', rect: { x: 0, y: 0, width: 0, height: 0 }, rows: [] })).toBe('');
    });
  });

  describe('exportOcrToMarkdown', () => {
    it('exports multi-page document into structured Markdown', () => {
      const md = exportOcrToMarkdown(sampleResult);

      expect(md).toContain('## Page 1');
      expect(md).toContain('### Market Summary Report');
      expect(md).toContain('Markets opened strongly on Monday');
      expect(md).toContain('| NIFTY 50 | 24,148.20 | ▲ 0.56% |');
      expect(md).toContain('$$\nE = mc^2\n$$');
      expect(md).toContain('---');
      expect(md).toContain('## Page 2');
      expect(md).toContain('Concluding remarks on fiscal performance.');
    });

    it('returns empty string for empty results', () => {
      expect(exportOcrToMarkdown({
        documentFingerprint: 'empty',
        createdAt: '2026-11-23T00:00:00.000Z',
        engineId: 'tesseract.js',
        profileId: 'default',
        diagnostics: [],
        pages: [],
      })).toBe('');
    });
  });

  describe('exportOcrToJson', () => {
    it('serializes document into schema-compliant JSON AST', () => {
      const jsonStr = exportOcrToJson(sampleResult, { pretty: true });
      const parsed = JSON.parse(jsonStr);

      expect(parsed.schemaVersion).toBe('pdfhub-ocr-ast-v1');
      expect(parsed.documentFingerprint).toBe('doc-export-test');
      expect(parsed.pageCount).toBe(2);
      expect(parsed.pages).toHaveLength(2);

      const page0 = parsed.pages[0];
      expect(page0.blocks).toHaveLength(4);
      expect(page0.blocks[0].type).toBe('heading');
      expect(page0.blocks[0].text).toBe('Market Summary Report');

      // Table block verification in AST
      const tableBlock = page0.blocks[2];
      expect(tableBlock.type).toBe('table');
      expect(tableBlock.tableData.rowCount).toBe(3);
      expect(tableBlock.tableData.columnCount).toBe(3);
      expect(tableBlock.tableData.rows[1][0].text).toBe('NIFTY 50');
    });
  });

  describe('exportOcrToPlainText', () => {
    it('exports multi-page document into clean plain text with banners and aligned table', () => {
      const text = exportOcrToPlainText(sampleResult);

      expect(text).toContain('=== Page 1 of 2 ===');
      expect(text).toContain('Market Summary Report');
      expect(text).toContain('NIFTY 50');
      expect(text).toContain('24,148.20');
      expect(text).toContain('=== Page 2 of 2 ===');
      expect(text).toContain('Concluding remarks on fiscal performance.');
    });
  });
});
