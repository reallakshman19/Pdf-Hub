import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import {
  buildWriterTableVisualModel,
  writerTableCellStyleToCss,
} from './writerTableVisualStyles';

describe('writerTableVisualStyles', () => {
  it('builds header and body cell visual model with inherited styles', () => {
    const model = buildWriterTableVisualModel({
      element: makeTableElement(),
      width: 320,
      height: 140,
    });

    expect(model).not.toBeNull();
    expect(model?.headerCells).toHaveLength(2);
    expect(model?.bodyCells).toHaveLength(4);

    const header = model!.headerCells[0];

    expect(header.text).toBe('A');
    expect(header.style.bold).toBe(true);
    expect(header.style.alignment).toBe('center');
    expect(header.style.backgroundColor).toBe('#E2E8F0');

    const body = model!.bodyCells[0];

    expect(body.text).toBe('A1');
    expect(body.style.alignment).toBe('right');
    expect(body.style.verticalAlign).toBe('middle');
    expect(body.style.backgroundColor).toBe('#FEF3C7');
    expect(body.style.borders?.bottom?.style).toBe('double');
  });

  it('normalizes column widths to rendered width', () => {
    const model = buildWriterTableVisualModel({
      element: makeTableElement(),
      width: 400,
      height: 140,
    });

    expect(model).not.toBeNull();

    const totalWidth = model!.columnWidths.reduce((sum, width) => sum + width, 0);

    expect(totalWidth).toBeCloseTo(400);
  });

  it('converts resolved cell style to CSS', () => {
    const css = writerTableCellStyleToCss({
      alignment: 'center',
      verticalAlign: 'middle',
      fontFamily: 'Aptos',
      fontSize: 12,
      textColor: '#111827',
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      backgroundColor: '#FEF3C7',
      padding: 8,
      borders: {
        top: { style: 'single', color: '#111827', width: 1 },
        right: { style: 'dashed', color: '#111827', width: 1 },
        bottom: { style: 'double', color: '#92400E', width: 2 },
        left: { style: 'dotted', color: '#111827', width: 1 },
      },
    });

    expect(css.textAlign).toBe('center');
    expect(css.alignItems).toBe('center');
    expect(css.justifyContent).toBe('center');
    expect(css.fontFamily).toBe('Aptos');
    expect(css.fontSize).toBe(12);
    expect(css.color).toBe('#111827');
    expect(css.fontWeight).toBe(700);
    expect(css.fontStyle).toBe('italic');
    expect(css.textDecoration).toBe('underline line-through');
    expect(css.backgroundColor).toBe('#FEF3C7');
    expect(css.padding).toBe('8px');
    expect(css.borderTop).toBe('1px solid #111827');
    expect(css.borderRight).toBe('1px dashed #111827');
    expect(css.borderBottom).toBe('2px double #92400E');
    expect(css.borderLeft).toBe('1px dotted #111827');
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
      height: 140,
    },
    tableData: {
      hasHeaderRow: true,
      defaultCellStyle: {
        fontFamily: 'Aptos',
        fontSize: 10,
        textColor: '#111827',
        padding: 6,
        alignment: 'left',
        verticalAlign: 'top',
      },
      headerCellStyle: {
        bold: true,
        alignment: 'center',
        backgroundColor: '#E2E8F0',
      },
      columns: [
        {
          id: 'a',
          label: 'A',
          width: 160,
          style: {
            alignment: 'center',
          },
        },
        {
          id: 'b',
          label: 'B',
          width: 160,
        },
      ],
      rows: [
        {
          id: 'row-1',
          height: 40,
          cells: [
            {
              id: 'a1',
              text: 'A1',
              style: {
                alignment: 'right',
                verticalAlign: 'middle',
                backgroundColor: '#FEF3C7',
                borders: {
                  bottom: {
                    style: 'double',
                    color: '#92400E',
                    width: 1,
                  },
                },
              },
            },
            {
              id: 'b1',
              text: 'B1',
            },
          ],
        },
        {
          id: 'row-2',
          height: 40,
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
