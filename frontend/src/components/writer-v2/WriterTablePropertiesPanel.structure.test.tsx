import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterTablePropertiesPanel } from './WriterTablePropertiesPanel';

describe('WriterTablePropertiesPanel structural editing', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc',
      elements: [makeTableElement()],
      assetRecords: [],
    });
    useWriterV2Store.setState({
      activeId: 'table-1',
      selectedIds: ['table-1'],
    });
  });

  it('inserts row below from the panel', () => {
    render(<WriterTablePropertiesPanel />);

    expect(screen.getByText('2 rows × 2 columns')).toBeTruthy();

    fireEvent.click(screen.getByText('Row below'));

    const table = getTable();

    expect(table.tableData?.rows).toHaveLength(3);
  });

  it('deletes selected row from the panel', () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Delete row'));

    const table = getTable();

    expect(table.tableData?.rows).toHaveLength(1);
  });

  it('inserts column right from the panel', () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Column right'));

    const table = getTable();

    expect(table.tableData?.columns).toHaveLength(3);
    expect(table.tableData?.rows[0].cells).toHaveLength(3);
  });

  it('deletes selected column from the panel', () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Delete column'));

    const table = getTable();

    expect(table.tableData?.columns).toHaveLength(1);
    expect(table.tableData?.rows[0].cells).toHaveLength(1);
  });

  it('merges selected cells when range selection is provided', () => {
    render(
      <WriterTablePropertiesPanel
        tableSelection={{
          elementId: 'table-1',
          cells: [
            {
              elementId: 'table-1',
              rowIndex: 0,
              columnIndex: 0,
            },
            {
              elementId: 'table-1',
              rowIndex: 0,
              columnIndex: 1,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByText('Merge cells'));

    const table = getTable();

    expect(table.tableData?.rows[0].cells[0].colSpan).toBe(2);
    expect(table.tableData?.rows[0].cells[1].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
  });

  it('splits selected merged cell from the panel', () => {
    render(
      <WriterTablePropertiesPanel
        tableSelection={{
          elementId: 'table-1',
          cells: [
            {
              elementId: 'table-1',
              rowIndex: 0,
              columnIndex: 0,
            },
            {
              elementId: 'table-1',
              rowIndex: 0,
              columnIndex: 1,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByText('Merge cells'));
    fireEvent.click(screen.getByText('Split cell'));

    const table = getTable();

    expect(table.tableData?.rows[0].cells[0].colSpan).toBeUndefined();
    expect(table.tableData?.rows[0].cells[1].mergedInto).toBeUndefined();
  });
});

function getTable(): WriterElementV2 {
  const table = useWriterV2Store
    .getState()
    .elements
    .find((element) => element.id === 'table-1');

  if (!table) {
    throw new Error('Expected table element.');
  }

  return table;
}

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
