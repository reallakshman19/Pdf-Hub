import { describe, it, expect } from 'vitest';
import { convertOcrDocumentToWriterElements } from '../ocrDocumentToWriterV2';
import type { OcrDocumentResult, OcrTableBlock } from '../types';

describe('ocrDocumentToWriterV2', () => {
  const sampleTable: OcrTableBlock = {
    id: 'tbl-1',
    type: 'table',
    rect: { x: 50, y: 150, width: 300, height: 100 },
    rows: [
      {
        id: 'r1',
        cells: [
          { id: 'c1_1', text: 'Item', confidence: 0.98, bbox: { x: 50, y: 150, width: 150, height: 50 } },
          { id: 'c1_2', text: 'Price', confidence: 0.98, bbox: { x: 200, y: 150, width: 150, height: 50 } },
        ],
      },
      {
        id: 'r2',
        cells: [
          { id: 'c2_1', text: 'Steel Beam', confidence: 0.95, bbox: { x: 50, y: 200, width: 150, height: 50 } },
          { id: 'c2_2', text: '₹ 15,000', confidence: 0.96, bbox: { x: 200, y: 200, width: 150, height: 50 } },
        ],
      },
    ],
  };

  const sampleResult: OcrDocumentResult = {
    documentFingerprint: 'writer-doc-123',
    createdAt: '2026-11-23T00:00:00.000Z',
    engineId: 'tesseract.js',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        status: 'complete',
        pageIndex: 0,
        pageNumber: 1,
        blocks: [
          {
            id: 'b1',
            type: 'heading',
            text: 'Structural Bill of Quantities',
            confidence: 0.99,
            rect: { x: 50, y: 50, width: 400, height: 30 },
          },
          {
            id: 'b2',
            type: 'paragraph',
            text: 'All quantities verified by engineer.',
            confidence: 0.92,
            rect: { x: 50, y: 90, width: 400, height: 40 },
          },
          sampleTable,
        ],
      },
      {
        status: 'complete',
        pageIndex: 1,
        pageNumber: 2,
        blocks: [
          {
            id: 'b3',
            type: 'paragraph',
            text: 'Sign-off required on delivery.',
            confidence: 0.85,
            rect: { x: 50, y: 50, width: 400, height: 30 },
          },
          {
            id: 'b_low',
            type: 'paragraph',
            text: 'Faint watermark text',
            confidence: 0.40,
            rect: { x: 50, y: 90, width: 200, height: 20 },
          },
        ],
      },
    ],
  };

  it('handles empty results safely', () => {
    const res = convertOcrDocumentToWriterElements({
      documentFingerprint: 'empty',
      createdAt: '2026-11-23T00:00:00.000Z',
      engineId: 'tesseract.js',
      profileId: 'default',
      diagnostics: [],
      pages: [],
    });
    expect(res.elements).toHaveLength(0);
    expect(res.pageCount).toBe(0);
  });

  it('converts multi-page OCR document into richTextBox and tableBox elements', () => {
    const res = convertOcrDocumentToWriterElements(sampleResult);

    expect(res.pageCount).toBe(2);
    expect(res.convertedBlockCount).toBe(5);
    expect(res.textCount).toBe(4);
    expect(res.tableCount).toBe(1);

    // Verify first page elements
    const p0Elements = res.elements.filter((e) => e.pageIndex === 0);
    expect(p0Elements).toHaveLength(3);

    const headingElem = p0Elements[0];
    expect(headingElem.type).toBe('richTextBox');
    expect(headingElem.plainText).toBe('Structural Bill of Quantities');
    expect(headingElem.documentFingerprint).toBe('writer-doc-123');

    const tableElem = p0Elements[2];
    expect(tableElem.type).toBe('tableBox');
    expect(tableElem.tableData).toBeDefined();
    expect(tableElem.tableData?.columns).toHaveLength(2);
    expect(tableElem.tableData?.rows).toHaveLength(2);
    expect(tableElem.tableData?.rows[1].cells[1].text).toBe('₹ 15,000');
  });

  it('filters out blocks below minConfidence threshold', () => {
    const res = convertOcrDocumentToWriterElements(sampleResult, {
      minConfidence: 0.50,
    });

    // The block with confidence 0.40 should be excluded
    expect(res.elements).toHaveLength(4);
    expect(res.elements.some((e) => e.plainText === 'Faint watermark text')).toBe(false);
  });

  it('respects includeTables and includeText options', () => {
    const noTables = convertOcrDocumentToWriterElements(sampleResult, {
      includeTables: false,
    });
    expect(noTables.tableCount).toBe(0);
    expect(noTables.elements.every((e) => e.type !== 'tableBox')).toBe(true);

    const onlyTables = convertOcrDocumentToWriterElements(sampleResult, {
      includeText: false,
    });
    expect(onlyTables.textCount).toBe(0);
    expect(onlyTables.tableCount).toBe(1);
    expect(onlyTables.elements).toHaveLength(1);
    expect(onlyTables.elements[0].type).toBe('tableBox');
  });
});
