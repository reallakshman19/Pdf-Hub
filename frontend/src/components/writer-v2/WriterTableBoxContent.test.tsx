import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { WriterTableBoxContent } from './WriterTableBoxContent';

describe('WriterTableBoxContent', () => {
  it('renders formatted header and body cells', () => {
    render(
      <WriterTableBoxContent
        element={makeTableElement()}
        width={320}
        height={140}
        selection={null}
      />,
    );

    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('B1')).toBeTruthy();

    const bodyCell = screen
      .getByText('A1')
      .closest('[data-writer-table-body-cell="true"]');

    expect(bodyCell).toBeTruthy();
    expect(bodyCell).toHaveStyle({
      backgroundColor: 'rgb(254, 243, 199)', // #FEF3C7 in rgb
    });
  });

  it('marks selected cells with selected attribute', () => {
    render(
      <WriterTableBoxContent
        element={makeTableElement()}
        width={320}
        height={140}
        selection={{
          elementId: 'table-1',
          cells: [
            {
              elementId: 'table-1',
              rowIndex: 0,
              columnIndex: 0,
            },
          ],
        }}
      />,
    );

    const selected = document.querySelector(
      '[data-writer-table-cell-selected="true"]',
    );

    expect(selected).toBeTruthy();
    expect(selected?.textContent).toContain('A1');
  });

  it('renders invalid table fallback', () => {
    const element = makeTableElement();
    element.tableData = undefined;

    render(
      <WriterTableBoxContent
        element={element}
        width={320}
        height={140}
        selection={null}
      />,
    );

    expect(screen.getByText('Invalid table')).toBeTruthy();
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
              },
            },
            {
              id: 'b1',
              text: 'B1',
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
