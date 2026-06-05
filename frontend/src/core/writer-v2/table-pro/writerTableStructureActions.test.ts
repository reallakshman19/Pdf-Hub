import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { createRectangularTableSelection } from './writerTableSelection';
import {
  deleteWriterTableColumn,
  deleteWriterTableRow,
  insertWriterTableColumn,
  insertWriterTableRow,
  mergeWriterTableCells,
  normalizeWriterTableData,
  splitWriterTableCell,
} from './writerTableStructureActions';

describe('writerTableStructureActions', () => {
  it('normalizes malformed table rows to match column count', () => {
    const table = makeTableElement().tableData!;
    table.rows[0].cells = [table.rows[0].cells[0]];

    const normalized = normalizeWriterTableData(table);

    expect(normalized).not.toBeNull();
    expect(normalized?.rows[0].cells).toHaveLength(3);
    expect(normalized?.rows[0].cells[1].text).toBe('');
  });

  it('inserts row below selected row', () => {
    const result = insertWriterTableRow(
      [makeTableElement()],
      'table-1',
      0,
      'below',
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.rows).toHaveLength(3);
    expect(result.elements[0].tableData?.rows[1].cells).toHaveLength(3);
  });

  it('deletes row but prevents deleting the final row', () => {
    const result = deleteWriterTableRow(
      [makeTableElement()],
      'table-1',
      0,
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.rows).toHaveLength(1);

    const onlyOne = makeTableElement();
    onlyOne.tableData!.rows = [onlyOne.tableData!.rows[0]];

    const blocked = deleteWriterTableRow(
      [onlyOne],
      'table-1',
      0,
    );

    expect(blocked.changed).toBe(false);
    expect(blocked.message).toBe('Cannot delete the last table row.');
  });

  it('inserts column right and updates all rows', () => {
    const result = insertWriterTableColumn(
      [makeTableElement()],
      'table-1',
      1,
      'right',
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.columns).toHaveLength(4);
    expect(result.elements[0].tableData?.rows[0].cells).toHaveLength(4);
    expect(result.elements[0].tableData?.rows[1].cells).toHaveLength(4);
  });

  it('deletes column but prevents deleting final column', () => {
    const result = deleteWriterTableColumn(
      [makeTableElement()],
      'table-1',
      1,
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.columns).toHaveLength(2);
    expect(result.elements[0].tableData?.rows[0].cells).toHaveLength(2);

    const onlyOne = makeTableElement();
    onlyOne.tableData!.columns = [onlyOne.tableData!.columns[0]];
    onlyOne.tableData!.rows = onlyOne.tableData!.rows.map((row) => ({
      ...row,
      cells: [row.cells[0]],
    }));

    const blocked = deleteWriterTableColumn(
      [onlyOne],
      'table-1',
      0,
    );

    expect(blocked.changed).toBe(false);
    expect(blocked.message).toBe('Cannot delete the last table column.');
  });

  it('merges rectangular range and marks follower cells as mergedInto', () => {
    const selection = createRectangularTableSelection({
      elementId: 'table-1',
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 1,
      endColumnIndex: 1,
    });

    const result = mergeWriterTableCells(
      [makeTableElement()],
      selection,
    );

    expect(result.changed).toBe(true);

    const rows = result.elements[0].tableData!.rows;
    const master = rows[0].cells[0];

    expect(master.colSpan).toBe(2);
    expect(master.rowSpan).toBe(2);
    expect(master.text).toContain('A1');
    expect(master.text).toContain('B2');

    expect(rows[0].cells[1].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(rows[1].cells[0].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(rows[1].cells[1].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
  });

  it('splits merged cells', () => {
    const selection = createRectangularTableSelection({
      elementId: 'table-1',
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 1,
      endColumnIndex: 1,
    });

    const merged = mergeWriterTableCells(
      [makeTableElement()],
      selection,
    );

    const split = splitWriterTableCell(
      merged.elements,
      'table-1',
      0,
      0,
    );

    expect(split.changed).toBe(true);

    const rows = split.elements[0].tableData!.rows;

    expect(rows[0].cells[0].colSpan).toBeUndefined();
    expect(rows[0].cells[0].rowSpan).toBeUndefined();
    expect(rows[0].cells[1].mergedInto).toBeUndefined();
    expect(rows[1].cells[0].mergedInto).toBeUndefined();
    expect(rows[1].cells[1].mergedInto).toBeUndefined();
  });
});

function makeTableElement(): WriterElementV2 {
  return {
    id: 'table-1',
    documentFingerprint: 'doc',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 72,
      y: 500,
      width: 360,
      height: 160,
    },
    tableData: {
      hasHeaderRow: true,
      columns: [
        { id: 'a', label: 'A', width: 120 },
        { id: 'b', label: 'B', width: 120 },
        { id: 'c', label: 'C', width: 120 },
      ],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'a1', text: 'A1' },
            { id: 'b1', text: 'B1' },
            { id: 'c1', text: 'C1' },
          ],
        },
        {
          id: 'row-2',
          cells: [
            { id: 'a2', text: 'A2' },
            { id: 'b2', text: 'B2' },
            { id: 'c2', text: 'C2' },
          ],
        },
      ],
    },
    style: {
      zIndex: 0,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
