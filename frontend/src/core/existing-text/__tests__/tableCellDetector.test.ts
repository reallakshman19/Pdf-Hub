import { describe, it, expect } from 'vitest';
import type { ExistingTextSpan } from '../types';
import { buildExistingTextSpan } from '../model';
import {
  detectTableGridsForPage,
  findTableCellForSpan,
  suggestAlignmentForText,
  isSpanInsideTable,
} from '../tableCellDetector';
import { clusterPageSpansIntoParagraphs } from '../paragraphClusterer';

function makeMockSpan(
  id: string,
  text: string,
  x: number,
  y: number,
  advanceWidth: number,
  fontSize = 10,
): ExistingTextSpan {
  const span = buildExistingTextSpan(
    { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
    {
      sourceIndex: parseInt(id.replace(/\D/g, '') || '0', 10),
      text,
      transform: [fontSize, 0, 0, fontSize, x, y],
      width: advanceWidth,
      height: fontSize,
      fontName: 'Helvetica',
      direction: 'ltr',
      hasEol: false,
    },
  );
  return { ...span, id };
}

describe('tableCellDetector', () => {
  it('returns empty array when fewer than 4 spans exist', () => {
    const spans: ExistingTextSpan[] = [
      makeMockSpan('s1', 'Hello', 50, 100, 30),
      makeMockSpan('s2', 'World', 100, 100, 30),
    ];
    expect(detectTableGridsForPage(spans)).toEqual([]);
  });

  it('detects a 3-row by 3-column table grid and computes dividers', () => {
    // 3 rows: y = 200, y = 185, y = 170
    // 3 columns: x = 50, x = 150, x = 250
    const spans: ExistingTextSpan[] = [
      // Row 0 (Header)
      makeMockSpan('s_r0_c0', 'Item', 50, 200, 30),
      makeMockSpan('s_r0_c1', 'Date', 150, 200, 30),
      makeMockSpan('s_r0_c2', 'Total', 250, 200, 30),

      // Row 1
      makeMockSpan('s_r1_c0', 'Widgets', 50, 185, 45),
      makeMockSpan('s_r1_c1', '2026-11-20', 150, 185, 60),
      makeMockSpan('s_r1_c2', '$1,250.00', 250, 185, 55),

      // Row 2
      makeMockSpan('s_r2_c0', 'Gadgets', 50, 170, 45),
      makeMockSpan('s_r2_c1', '2026-11-21', 150, 170, 60),
      makeMockSpan('s_r2_c2', '$4,800.50', 250, 170, 55),
    ];

    const tables = detectTableGridsForPage(spans);
    expect(tables).toHaveLength(1);

    const table = tables[0];
    expect(table.rowCount).toBe(3);
    expect(table.colCount).toBe(3);
    expect(table.cells).toHaveLength(9);
    expect(table.columnDividers).toHaveLength(2); // 2 inner dividers
    expect(table.rowDividers).toHaveLength(2);    // 2 inner dividers

    // Row 0 is header
    expect(table.cells[0].isHeader).toBe(true);
    expect(table.cells[1].isHeader).toBe(true);

    // Row 1 and 2 are not headers
    expect(table.cells[3].isHeader).toBe(false);
    expect(table.cells[5].isHeader).toBe(false);

    // Find cell for span
    const targetSpan = spans[5]; // '$1,250.00' (row 1, col 2)
    const cell = findTableCellForSpan(targetSpan, tables);
    expect(cell).not.toBeNull();
    expect(cell?.rowIndex).toBe(1);
    expect(cell?.columnIndex).toBe(2);
    expect(cell?.suggestedAlignment).toBe('right');
    expect(isSpanInsideTable(targetSpan, tables)).toBe(true);
  });

  it('suggests correct alignment based on cell content heuristics', () => {
    // Numeric and currency
    expect(suggestAlignmentForText('$1,429.50')).toBe('right');
    expect(suggestAlignmentForText('€500.00')).toBe('right');
    expect(suggestAlignmentForText('98.5%')).toBe('right');
    expect(suggestAlignmentForText('-42.00')).toBe('right');
    expect(suggestAlignmentForText('(1,200.00)')).toBe('right');

    // Dates and short codes
    expect(suggestAlignmentForText('2026-11-23')).toBe('center');
    expect(suggestAlignmentForText('11/23/2026')).toBe('center');
    expect(suggestAlignmentForText('REV_A')).toBe('center');

    // General descriptions
    expect(suggestAlignmentForText('Invoice Payment Description')).toBe('left');
    expect(suggestAlignmentForText('')).toBe('left');
  });

  it('prevents vertically adjacent table cells from erroneously clustering into a paragraph', () => {
    // Two rows of a table with numbers having the exact same X coordinate and 15pt vertical spacing
    const spans: ExistingTextSpan[] = [
      makeMockSpan('s0_0', 'Invoice', 50, 200, 40),
      makeMockSpan('s0_1', '$100.00', 150, 200, 45),

      makeMockSpan('s1_0', 'Shipping', 50, 185, 45),
      makeMockSpan('s1_1', '$200.00', 150, 185, 45),
    ];

    // Cluster without table detection vs with table detection
    const paragraphs = clusterPageSpansIntoParagraphs(spans);

    // Each cell should be its own isolated block, not merged into a 2-line paragraph of "$100.00\n$200.00"
    const numberParagraphs = paragraphs.filter((p) =>
      p.lines.some((l) => l.span.text.includes('$')),
    );

    // There should be 2 separate single-line paragraphs for the numbers, NOT 1 merged paragraph!
    expect(numberParagraphs).toHaveLength(2);
    expect(numberParagraphs[0].lines).toHaveLength(1);
    expect(numberParagraphs[1].lines).toHaveLength(1);
  });
});
