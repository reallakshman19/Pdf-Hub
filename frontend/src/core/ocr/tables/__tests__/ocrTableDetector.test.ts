import { describe, expect, it } from 'vitest';
import type { OcrWord } from '../../types';
import { detectOcrTables } from '../ocrTableDetector';

function makeWord(text: string, x: number, y: number, width: number, height: number, confidence = 95): OcrWord {
  return {
    id: `word-${text}-${x}-${y}`,
    pageIndex: 0,
    text,
    normalizedText: text.toLowerCase(),
    confidence,
    bbox: { x, y, width, height },
  };
}

describe('ocrTableDetector', () => {
  it('detects a 3x3 structured table from aligned words', () => {
    // 3 rows at y=100, y=130, y=160
    // 3 columns at x=50, x=150, x=250
    const words: OcrWord[] = [
      // Row 1 (Headers)
      makeWord('ITEM', 50, 100, 30, 15),
      makeWord('QTY', 150, 100, 25, 15),
      makeWord('PRICE', 250, 100, 35, 15),

      // Row 2
      makeWord('VALVE', 50, 130, 40, 15),
      makeWord('10', 150, 130, 15, 15),
      makeWord('$100', 250, 130, 30, 15),

      // Row 3
      makeWord('PUMP', 50, 160, 35, 15),
      makeWord('2', 150, 160, 10, 15),
      makeWord('$500', 250, 160, 30, 15),
    ];

    const tables = detectOcrTables({
      words,
      lines: [],
      pageWidth: 600,
      pageHeight: 800,
      pageIndex: 0,
      coordinateOrigin: 'top-left',
    });

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.type).toBe('table');
    expect(table.rows).toHaveLength(3);

    // Row 1
    expect(table.rows[0].cells[0].text).toBe('ITEM');
    expect(table.rows[0].cells[1].text).toBe('QTY');
    expect(table.rows[0].cells[2].text).toBe('PRICE');

    // Row 2
    expect(table.rows[1].cells[0].text).toBe('VALVE');
    expect(table.rows[1].cells[1].text).toBe('10');
    expect(table.rows[1].cells[2].text).toBe('$100');

    // Row 3
    expect(table.rows[2].cells[0].text).toBe('PUMP');
    expect(table.rows[2].cells[1].text).toBe('2');
    expect(table.rows[2].cells[2].text).toBe('$500');
  });

  it('detects equipment schedule table with multi-word cells', () => {
    const words: OcrWord[] = [
      // Header
      makeWord('TAG', 40, 50, 25, 12),
      makeWord('DESCRIPTION', 120, 50, 70, 12),
      makeWord('RATING', 260, 50, 45, 12),

      // Row 1
      makeWord('V-101', 40, 75, 30, 12),
      makeWord('BALL', 120, 75, 30, 12),
      makeWord('VALVE', 155, 75, 35, 12),
      makeWord('10', 260, 75, 15, 12),
      makeWord('BAR', 280, 75, 25, 12),

      // Row 2
      makeWord('P-201', 40, 100, 30, 12),
      makeWord('CENTRIFUGAL', 120, 100, 75, 12),
      makeWord('PUMP', 200, 100, 30, 12),
      makeWord('25', 260, 100, 15, 12),
      makeWord('KW', 280, 100, 20, 12),
    ];

    const tables = detectOcrTables({
      words,
      lines: [],
      pageWidth: 500,
      pageHeight: 700,
      pageIndex: 1,
      coordinateOrigin: 'top-left',
    });

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.rows).toHaveLength(3);

    // Multi-word concatenation in cells
    expect(table.rows[1].cells[1].text).toBe('BALL VALVE');
    expect(table.rows[1].cells[2].text).toBe('10 BAR');
    expect(table.rows[2].cells[1].text).toBe('CENTRIFUGAL PUMP');
    expect(table.rows[2].cells[2].text).toBe('25 KW');
  });

  it('handles empty cells gracefully in sparse tables', () => {
    const words: OcrWord[] = [
      // Row 1
      makeWord('COL1', 50, 100, 30, 15),
      makeWord('COL2', 150, 100, 30, 15),
      makeWord('COL3', 250, 100, 30, 15),

      // Row 2 (COL2 is empty)
      makeWord('VAL1', 50, 130, 30, 15),
      makeWord('VAL3', 250, 130, 30, 15),
    ];

    const tables = detectOcrTables({
      words,
      lines: [],
      pageWidth: 600,
      pageHeight: 800,
      coordinateOrigin: 'top-left',
    });

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].cells[0].text).toBe('VAL1');
    expect(table.rows[1].cells[1].text).toBe(''); // Empty cell
    expect(table.rows[1].cells[2].text).toBe('VAL3');
  });

  it('rejects regular single-column paragraph text without false positives', () => {
    // Standard paragraph: words with non-aligned column boundaries
    const words: OcrWord[] = [
      makeWord('This', 50, 100, 25, 12),
      makeWord('is', 80, 100, 12, 12),
      makeWord('a', 97, 100, 8, 12),
      makeWord('standard', 110, 100, 45, 12),
      makeWord('paragraph', 160, 100, 50, 12),

      makeWord('with', 50, 120, 25, 12),
      makeWord('normal', 80, 120, 35, 12),
      makeWord('running', 120, 120, 40, 12),
      makeWord('prose', 165, 120, 30, 12),
      makeWord('text.', 200, 120, 25, 12),
    ];

    const tables = detectOcrTables({
      words,
      lines: [],
      pageWidth: 600,
      pageHeight: 800,
      coordinateOrigin: 'top-left',
    });

    expect(tables).toHaveLength(0);
  });

  it('detects table with standard PDF bottom-left coordinates (decreasing Y reading order)', () => {
    // In PDF user space:
    // Header is at y=500
    // Row 2 is at y=460
    // Row 3 is at y=420
    const words: OcrWord[] = [
      makeWord('TAG', 50, 500, 30, 15),
      makeWord('NAME', 150, 500, 35, 15),

      makeWord('V1', 50, 460, 20, 15),
      makeWord('INLET', 150, 460, 40, 15),

      makeWord('V2', 50, 420, 20, 15),
      makeWord('OUTLET', 150, 420, 45, 15),
    ];

    const tables = detectOcrTables({
      words,
      lines: [],
      pageWidth: 600,
      pageHeight: 800,
      coordinateOrigin: 'bottom-left',
    });

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.rows).toHaveLength(3);

    // Reading order from top to bottom
    expect(table.rows[0].cells[0].text).toBe('TAG');
    expect(table.rows[0].cells[1].text).toBe('NAME');
    expect(table.rows[1].cells[0].text).toBe('V1');
    expect(table.rows[1].cells[1].text).toBe('INLET');
    expect(table.rows[2].cells[0].text).toBe('V2');
    expect(table.rows[2].cells[1].text).toBe('OUTLET');
  });
});
