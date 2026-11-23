import { describe, it, expect } from 'vitest';
import {
  extractColumnDividers,
  extractRowDividers,
  adjustColumnDivider,
  adjustRowDivider,
} from '../tableGridGeometry';
import type { OcrTableBlock } from '@/core/ocr/types';

describe('tableGridGeometry', () => {
  const sampleTable: OcrTableBlock = {
    id: 'tbl-1',
    type: 'table',
    rect: { x: 50, y: 50, width: 300, height: 100 },
    bbox: { x: 50, y: 50, width: 300, height: 100 },
    rows: [
      {
        id: 'r1',
        cells: [
          { id: 'c1_1', text: 'Item', confidence: 0.95, bbox: { x: 50, y: 50, width: 100, height: 50 } },
          { id: 'c1_2', text: 'Qty', confidence: 0.95, bbox: { x: 150, y: 50, width: 100, height: 50 } },
          { id: 'c1_3', text: 'Rate', confidence: 0.95, bbox: { x: 250, y: 50, width: 100, height: 50 } },
        ],
      },
      {
        id: 'r2',
        cells: [
          { id: 'c2_1', text: 'Beam', confidence: 0.95, bbox: { x: 50, y: 100, width: 100, height: 50 } },
          { id: 'c2_2', text: '10', confidence: 0.95, bbox: { x: 150, y: 100, width: 100, height: 50 } },
          { id: 'c2_3', text: '500', confidence: 0.95, bbox: { x: 250, y: 100, width: 100, height: 50 } },
        ],
      },
    ],
  };

  it('extracts correct number of column and row dividers', () => {
    const colDividers = extractColumnDividers(sampleTable);
    expect(colDividers).toHaveLength(2); // 3 cols -> 2 inner dividers
    expect(colDividers[0].x).toBe(150);
    expect(colDividers[1].x).toBe(250);

    const rowDividers = extractRowDividers(sampleTable);
    expect(rowDividers).toHaveLength(1); // 2 rows -> 1 inner divider
    expect(rowDividers[0].y).toBe(100);
  });

  it('adjusts column divider position and updates adjacent cell widths', () => {
    // Move divider 0 from x=150 to x=170 (+20px)
    const updated = adjustColumnDivider(sampleTable, 0, 170);

    // Col 0 width becomes 120
    expect(updated.rows[0].cells[0].bbox.width).toBe(120);
    expect(updated.rows[1].cells[0].bbox.width).toBe(120);

    // Col 1 x becomes 170 and width becomes 80
    expect(updated.rows[0].cells[1].bbox.x).toBe(170);
    expect(updated.rows[0].cells[1].bbox.width).toBe(80);
    expect(updated.rows[1].cells[1].bbox.x).toBe(170);
    expect(updated.rows[1].cells[1].bbox.width).toBe(80);

    // Col 2 remains unchanged
    expect(updated.rows[0].cells[2].bbox.x).toBe(250);
    expect(updated.rows[0].cells[2].bbox.width).toBe(100);
  });

  it('adjusts row divider position and updates adjacent row heights', () => {
    // Move row divider 0 from y=100 to y=110 (+10px)
    const updated = adjustRowDivider(sampleTable, 0, 110);

    // Row 0 height becomes 60
    expect(updated.rows[0].cells[0].bbox.height).toBe(60);
    expect(updated.rows[0].cells[1].bbox.height).toBe(60);

    // Row 1 y becomes 110 and height becomes 40
    expect(updated.rows[1].cells[0].bbox.y).toBe(110);
    expect(updated.rows[1].cells[0].bbox.height).toBe(40);
  });

  it('safely clamps movement within minimum width bounds', () => {
    // Attempt to drag divider past right boundary
    const updated = adjustColumnDivider(sampleTable, 0, 300);
    expect(updated.rows[0].cells[0].bbox.width).toBeLessThan(300);
    expect(updated.rows[0].cells[1].bbox.width).toBeGreaterThanOrEqual(10);
  });
});
