import { describe, expect, it } from 'vitest';
import { groupTextItemsIntoRows } from './textGrouping';
import { reconstructTableFromRows } from './tableReconstruction';
import type { SelectBoxTextItem } from './types';

function item(
  id: string,
  text: string,
  x: number,
  y: number,
): SelectBoxTextItem {
  return {
    id,
    text,
    x,
    y,
    width: text.length * 7,
    height: 10,
    fontSize: 10,
  };
}

describe('select-box-copy table reconstruction', () => {
  it('reconstructs a simple positioned table into HTML and TSV', () => {
    const rows = groupTextItemsIntoRows([
      item('h1', 'Line', 10, 10),
      item('h2', 'Size', 100, 10),
      item('h3', 'Spec', 180, 10),
      item('r1c1', 'P-101', 10, 30),
      item('r1c2', '14"', 100, 30),
      item('r1c3', 'A1A', 180, 30),
      item('r2c1', 'P-102', 10, 50),
      item('r2c2', '8"', 100, 50),
      item('r2c3', 'B2B', 180, 50),
    ]);

    const table = reconstructTableFromRows(rows);

    expect(table).toBeTruthy();
    expect(table?.confidence).toBeGreaterThanOrEqual(0.75);
    expect(table?.tableData.columns).toHaveLength(3);
    expect(table?.tableData.rows).toHaveLength(3);
    expect(table?.html).toContain('<table>');
    expect(table?.tsv).toContain('P-101\t14"\tA1A');
  });

  it('returns null for non-tabular text', () => {
    const rows = groupTextItemsIntoRows([
      item('a', 'This', 10, 10),
      item('b', 'is', 45, 10),
      item('c', 'paragraph', 65, 10),
      item('d', 'text', 10, 28),
    ]);

    expect(reconstructTableFromRows(rows)).toBeNull();
  });
});