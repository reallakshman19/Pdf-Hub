import { describe, it, expect } from 'vitest';
import {
  buildPdfUaStructureTree,
  exportToMarkdown,
  exportToPlainText,
  exportToEpubXhtml,
} from '../ocrAccessiblePdfExporter';
import type { OcrDocumentResult, OcrLine, OcrTableBlock } from '../../types';

describe('ocrAccessiblePdfExporter', () => {
  const mockTable: OcrTableBlock = {
    id: 'tbl-1',
    type: 'table',
    rect: { x: 50, y: 150, width: 300, height: 60 },
    rows: [
      {
        id: 'r-0',
        cells: [
          { id: 'c-0', text: 'Item', confidence: 0.95, bbox: { x: 50, y: 150, width: 150, height: 20 } },
          { id: 'c-1', text: 'Cost', confidence: 0.95, bbox: { x: 200, y: 150, width: 150, height: 20 } },
        ],
      },
      {
        id: 'r-1',
        cells: [
          { id: 'c-2', text: 'Subscription', confidence: 0.95, bbox: { x: 50, y: 170, width: 150, height: 20 } },
          { id: 'c-3', text: '$49.00', confidence: 0.95, bbox: { x: 200, y: 170, width: 150, height: 20 } },
        ],
      },
    ],
  };

  const mockLines: OcrLine[] = [
    {
      id: 'l-head',
      pageIndex: 0,
      text: 'STATEMENT SUMMARY:',
      confidence: 0.98,
      bbox: { x: 50, y: 50, width: 180, height: 18 },
      wordIds: [],
    },
    {
      id: 'l-p1',
      pageIndex: 0,
      text: 'Thank you for your business. Please see invoice breakdown below.',
      confidence: 0.95,
      bbox: { x: 50, y: 80, width: 350, height: 14 },
      wordIds: [],
    },
  ];

  const mockDoc: OcrDocumentResult = {
    documentFingerprint: 'doc-export-1',
    createdAt: '2026-11-23T08:00:00.000Z',
    engineId: 'tesseract-wasm',
    profileId: 'default',
    diagnostics: [],
    pages: [
      {
        pageNumber: 1,
        pageIndex: 0,
        status: 'success',
        confidence: 0.96,
        blocks: [mockTable],
        lines: mockLines,
        words: [],
      },
    ],
  };

  it('builds a PDF/UA structure tree with semantic hierarchy', () => {
    const tree = buildPdfUaStructureTree(mockDoc, { title: 'Billing Statement', language: 'en' });

    expect(tree.title).toBe('Billing Statement');
    expect(tree.language).toBe('en');
    expect(tree.rootElement.type).toBe('Document');
    expect(tree.totalElements).toBeGreaterThan(5);

    const sect = tree.rootElement.children?.[0];
    expect(sect?.type).toBe('Sect');

    // Headings, paragraphs, and tables
    const types = sect?.children?.map((c) => c.type);
    expect(types).toContain('H2');
    expect(types).toContain('P');
    expect(types).toContain('Table');
  });

  it('exports to formatted Markdown with table syntax and frontmatter', () => {
    const md = exportToMarkdown(mockDoc, { title: 'Billing Statement' });

    expect(md).toContain('---');
    expect(md).toContain('title: "Billing Statement"');
    expect(md).toContain('<!-- Page 1 -->');
    expect(md).toContain('STATEMENT SUMMARY:');
    expect(md).toContain('| Item | Cost |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Subscription | $49.00 |');
  });

  it('exports to plain text with page headers', () => {
    const txt = exportToPlainText(mockDoc);

    expect(txt).toContain('=== Page 1 ===');
    expect(txt).toContain('STATEMENT SUMMARY:');
    expect(txt).toContain('Thank you for your business.');
  });

  it('exports to valid ePub XHTML structure with ARIA pagebreak roles', () => {
    const xhtml = exportToEpubXhtml(mockDoc, { title: 'Billing Statement' });

    expect(xhtml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(xhtml).toContain('role="doc-pagebreak"');
    expect(xhtml).toContain('<title>Billing Statement</title>');
    expect(xhtml).toContain('<p>Thank you for your business. Please see invoice breakdown below.</p>');
  });
});
