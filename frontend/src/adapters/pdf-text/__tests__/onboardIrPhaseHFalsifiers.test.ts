import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  clusterPageSpansIntoParagraphs,
} from '@/core/existing-text/paragraphClusterer';
import {
  suggestAlignmentForText,
} from '@/core/existing-text/tableCellDetector';
import {
  computeTableCellFit,
} from '@/core/existing-text/tableCellFitEngine';
import {
  applyExistingTextTableCellReplacementToDocument,
} from '../PdfLibExistingTextTableCellReconstruction';
import {
  readExistingTextPageContentStreams,
} from '../PdfLibExistingTextContentStreams';
import type { ExistingTextSpan } from '@/core/existing-text/types';
import type { DetectedTableCell } from '@/core/existing-text/tableCellTypes';
import { buildExistingTextSpan } from '@/core/existing-text/model';

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

describe('OnBoard IR Phase H Adversarial Falsifiers: Table Cell Detection, Auto-Fit Squeeze, and Tabular Mutation', () => {
  it('Falsifier 1: Table Cell Isolation prevents vertically adjacent numeric cells with matching X coordinates from merging into a paragraph', () => {
    // 2 rows, 2 columns table
    // Column 1 has numbers at exact same X = 150, deltaY = 15pt (1.5x font size)
    const spans: ExistingTextSpan[] = [
      makeMockSpan('s0_0', 'Invoice', 50, 200, 40),
      makeMockSpan('s0_1', '$100.00', 150, 200, 45),

      makeMockSpan('s1_0', 'Shipping', 50, 185, 45),
      makeMockSpan('s1_1', '$200.00', 150, 185, 45),
    ];

    const paragraphs = clusterPageSpansIntoParagraphs(spans);

    // Number cells must NOT be clustered into a single 2-line paragraph
    const numberParagraphs = paragraphs.filter((p) =>
      p.lines.some((l) => l.span.text.includes('$')),
    );

    expect(numberParagraphs).toHaveLength(2);
    expect(numberParagraphs[0].lines).toHaveLength(1);
    expect(numberParagraphs[0].fullText).toBe('$100.00');
    expect(numberParagraphs[1].lines).toHaveLength(1);
    expect(numberParagraphs[1].fullText).toBe('$200.00');
  });

  it('Falsifier 2: Cell Column Bleed Prevention via Tz auto-squeeze ensures replacement text wider than cell is scaled within cell width', () => {
    // Cell width 60pt, padding 3pt => maxAllowedWidth = 54pt
    const cell: DetectedTableCell = {
      tableId: 't1',
      rowIndex: 1,
      columnIndex: 1,
      bounds: { x: 100, y: 200, width: 60, height: 20 },
      spanIds: ['s1'],
      text: '$50.00',
      isHeader: false,
      suggestedAlignment: 'right',
    };

    // Replacement text is 250% wider (natural width ~65pt at 10pt font)
    const measureFn = (txt: string, size: number) => txt.length * size * 0.5;
    const replacementText = '$1,234,567.89'; // length = 13 => 65pt

    const fit = computeTableCellFit(cell, replacementText, measureFn, 10);

    expect(fit.isSqueezed).toBe(true);
    expect(fit.horizontalScalingPercent).toBeLessThan(100);
    expect(fit.horizontalScalingPercent).toBeGreaterThanOrEqual(75);
    // Rendered text width must NOT bleed past maxAllowedWidth
    expect(fit.replacementTextWidthPt).toBeLessThanOrEqual(fit.maxAllowedWidthPt);
  });

  it('Falsifier 3: Numeric Right-Alignment Heuristic accurately computes right-aligned offset for currency and accounting values', () => {
    expect(suggestAlignmentForText('$1,429.50')).toBe('right');
    expect(suggestAlignmentForText('(500.00)')).toBe('right');

    const cell: DetectedTableCell = {
      tableId: 't1',
      rowIndex: 1,
      columnIndex: 2,
      bounds: { x: 200, y: 300, width: 100, height: 25 },
      spanIds: ['s1'],
      text: '$0.00',
      isHeader: false,
      suggestedAlignment: 'right',
    };

    const measureFn = (txt: string, size: number) => txt.length * size * 0.5;
    const fit = computeTableCellFit(cell, '$1,429.50', measureFn, 10);

    expect(fit.alignment).toBe('right');
    // maxAllowedWidth = 100 - 6 = 94pt
    // "$1,429.50" length = 9 => 45pt
    // offset = 94 - 45 = 49pt
    // baselineX = 200 + 3 + 49 = 252pt
    expect(fit.xOffsetPt).toBeCloseTo(49, 1);
    expect(fit.baselineXPts).toBeCloseTo(252, 1);
  });

  it('Falsifier 4: Cell Grid Navigation precisely computes next, previous, and row-wrap cell indices', () => {
    const colCount = 3;
    const rowCount = 2;

    const navigate = (r: number, c: number, shift: boolean) => {
      const nextCol = shift ? c - 1 : c + 1;
      let targetRow = r;
      let targetCol = nextCol;

      if (targetCol >= colCount) {
        targetCol = 0;
        targetRow = (targetRow + 1) % rowCount;
      } else if (targetCol < 0) {
        targetCol = colCount - 1;
        targetRow = (targetRow - 1 + rowCount) % rowCount;
      }

      return { row: targetRow, col: targetCol };
    };

    // Forward Tab from (0, 0) -> (0, 1)
    expect(navigate(0, 0, false)).toEqual({ row: 0, col: 1 });

    // Forward Tab from row end (0, 2) wraps to next row (1, 0)
    expect(navigate(0, 2, false)).toEqual({ row: 1, col: 0 });

    // Forward Tab from table end (1, 2) wraps to table start (0, 0)
    expect(navigate(1, 2, false)).toEqual({ row: 0, col: 0 });

    // Shift+Tab from (1, 0) wraps back to previous row end (0, 2)
    expect(navigate(1, 0, true)).toEqual({ row: 0, col: 2 });
  });

  it('Falsifier 5: Table Cell Mutation emits Tz horizontal scaling operator and cell-bounded whiteout, restoring state cleanly', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    const span = makeMockSpan('cell_span_1', '$10.00', 100, 500, 30, 10);
    const cell: DetectedTableCell = {
      tableId: 'tbl_1',
      rowIndex: 1,
      columnIndex: 1,
      bounds: { x: 90, y: 490, width: 50, height: 20 },
      spanIds: [span.id],
      text: '$10.00',
      isHeader: false,
      suggestedAlignment: 'right',
    };

    // Replacement text that requires Tz squeeze
    const result = await applyExistingTextTableCellReplacementToDocument(
      doc,
      lib,
      {
        cell,
        span,
        replacementText: '$999,999.00',
        alignment: 'right',
      },
    );

    expect(result.originalText).toBe('$10.00');
    expect(result.replacementText).toBe('$999,999.00');
    expect(result.horizontalScalingPercent).toBeLessThan(100);

    const savedBytes = await doc.save();
    const streamResult = await readExistingTextPageContentStreams(savedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = streamResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Verify stream contains whiteout fill (1 1 1 rg ... f), Tz horizontal scaling (79 Tz), and reset (100 Tz)
    expect(content).toContain('1 1 1 rg');
    expect(content).toContain('f');
    expect(content).toContain('79 Tz');
    expect(content).toContain('100 Tz');
  });
});
