import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { createRectangularTableSelection } from './writerTableSelection';
import {
  applyWriterTableCellStyle,
  resizeWriterTableColumn,
  setWriterTableCellBorder,
  setWriterTableCellFill,
  setWriterTableCellHorizontalAlignment,
  setWriterTableHeaderRow,
  updateWriterTableCellText,
} from './writerTableStyleActions';

describe('writerTableStyleActions', () => {
  it('applies cell style to a rectangular selection immutably', () => {
    const original = [makeTableElement()];

    const selection = createRectangularTableSelection({
      elementId: 'table-1',
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 1,
      endColumnIndex: 1,
    });

    const result = applyWriterTableCellStyle(original, selection, {
      alignment: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#FEF3C7',
      bold: true,
    });

    expect(result.changed).toBe(true);
    expect(result.elements).not.toBe(original);
    expect(result.elements[0]).not.toBe(original[0]);

    const table = result.elements[0];
    expect(table.tableData?.rows[0].cells[0].style?.alignment).toBe('center');
    expect(table.tableData?.rows[0].cells[0].style?.verticalAlign).toBe('middle');
    expect(table.tableData?.rows[0].cells[0].style?.backgroundColor).toBe('#FEF3C7');
    expect(table.tableData?.rows[0].cells[0].style?.bold).toBe(true);

    expect(table.tableData?.rows[1].cells[1].style?.alignment).toBe('center');

    expect(original[0].tableData?.rows[0].cells[0].style).toBeUndefined();
  });

  it('sets horizontal alignment through convenience action', () => {
    const result = setWriterTableCellHorizontalAlignment(
      [makeTableElement()],
      {
        elementId: 'table-1',
        cells: [
          {
            elementId: 'table-1',
            rowIndex: 0,
            columnIndex: 1,
          },
        ],
      },
      'right',
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.rows[0].cells[1].style?.alignment).toBe('right');
  });

  it('sets cell fill', () => {
    const result = setWriterTableCellFill(
      [makeTableElement()],
      {
        elementId: 'table-1',
        cells: [
          {
            elementId: 'table-1',
            rowIndex: 0,
            columnIndex: 0,
          },
        ],
      },
      '#DBEAFE',
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.rows[0].cells[0].style?.backgroundColor).toBe('#DBEAFE');
  });

  it('sets all borders on a selected cell', () => {
    const result = setWriterTableCellBorder(
      [makeTableElement()],
      {
        elementId: 'table-1',
        cells: [
          {
            elementId: 'table-1',
            rowIndex: 0,
            columnIndex: 0,
          },
        ],
      },
      'all',
      {
        style: 'double',
        color: '#92400E',
        width: 1,
      },
    );

    expect(result.changed).toBe(true);

    const borders = result.elements[0].tableData?.rows[0].cells[0].style?.borders;

    expect(borders?.top?.style).toBe('double');
    expect(borders?.right?.color).toBe('#92400E');
    expect(borders?.bottom?.width).toBe(1);
    expect(borders?.left?.style).toBe('double');
  });

  it('toggles header row flag', () => {
    const result = setWriterTableHeaderRow(
      [makeTableElement()],
      'table-1',
      false,
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.hasHeaderRow).toBe(false);
  });

  it('resizes column width', () => {
    const result = resizeWriterTableColumn(
      [makeTableElement()],
      'table-1',
      'col-a',
      220,
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.columns[0].width).toBe(220);
  });

  it('updates cell text', () => {
    const result = updateWriterTableCellText(
      [makeTableElement()],
      'table-1',
      1,
      1,
      'Updated B2',
    );

    expect(result.changed).toBe(true);
    expect(result.elements[0].tableData?.rows[1].cells[1].text).toBe('Updated B2');
  });

  it('returns unchanged result when element is missing', () => {
    const elements = [makeTableElement()];

    const result = setWriterTableHeaderRow(
      elements,
      'missing-table',
      false,
    );

    expect(result.changed).toBe(false);
    expect(result.elements).toBe(elements);
    expect(result.message).toBe('Table was not found.');
  });

  it('returns unchanged result when selection is empty', () => {
    const elements = [makeTableElement()];

    const result = applyWriterTableCellStyle(
      elements,
      {
        elementId: 'table-1',
        cells: [],
      },
      {
        alignment: 'center',
      },
    );

    expect(result.changed).toBe(false);
    expect(result.elements).toBe(elements);
    expect(result.message).toBe('No table cells selected.');
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
      width: 320,
      height: 120,
    },
    tableData: {
      hasHeaderRow: true,
      columns: [
        {
          id: 'col-a',
          label: 'A',
          width: 160,
        },
        {
          id: 'col-b',
          label: 'B',
          width: 160,
        },
      ],
      rows: [
        {
          id: 'row-1',
          cells: [
            {
              id: 'a1',
              text: 'A1',
            },
            {
              id: 'b1',
              text: 'B1',
            },
          ],
        },
        {
          id: 'row-2',
          cells: [
            {
              id: 'a2',
              text: 'A2',
            },
            {
              id: 'b2',
              text: 'B2',
            },
          ],
        },
      ],
    },
    style: {
      zIndex: 0,
      fontSize: 11,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
