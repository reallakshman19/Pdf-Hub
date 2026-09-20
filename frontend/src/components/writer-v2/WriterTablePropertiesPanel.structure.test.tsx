import { beforeEach, describe, expect, it } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

  it('keeps cell text local until blur, then commits it', async () => {
    render(<WriterTablePropertiesPanel />);

    const input = screen.getByLabelText(
      'Selected table cell text',
    );

    fireEvent.change(input, {
      target: { value: 'Draft value' },
    });

    expect(
      getTable().tableData?.rows[0].cells[0].text,
    ).toBe('A1');

    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        getTable()
          .tableData
          ?.rows[0]
          .cells[0]
          .text,
      ).toBe('Draft value');
    });
  });

  it('serializes rapid padding and column-width commits against latest table state', async () => {
    render(<WriterTablePropertiesPanel />);

    const padding = screen.getByLabelText(
      'Table cell padding',
    );
    const width = screen.getByLabelText(
      'Table column width',
    );

    fireEvent.change(padding, {
      target: { value: '14' },
    });
    fireEvent.blur(padding);

    fireEvent.change(width, {
      target: { value: '190' },
    });
    fireEvent.blur(width);

    await waitFor(() => {
      const table = getTable();

      expect(
        table
          .tableData
          ?.rows[0]
          .cells[0]
          .style
          ?.padding,
      ).toBe(14);
      expect(
        table.tableData?.columns[0].width,
      ).toBe(190);
    });
  });

  it('cancels a cell-text draft on Escape without mutating Writer state', () => {
    render(<WriterTablePropertiesPanel />);

    const input = screen.getByLabelText(
      'Selected table cell text',
    );

    fireEvent.change(input, {
      target: { value: 'Discard me' },
    });
    fireEvent.keyDown(input, {
      key: 'Escape',
    });

    expect(
      getTable().tableData?.rows[0].cells[0].text,
    ).toBe('A1');
    expect(
      (input as HTMLInputElement).value,
    ).toBe('A1');
  });

  it('inserts row below from the panel', async () => {
    render(<WriterTablePropertiesPanel />);

    expect(screen.getByText('2 rows × 2 columns')).toBeTruthy();

    fireEvent.click(screen.getByText('Row below'));

    await waitFor(() => {
      expect(
        getTable().tableData?.rows,
      ).toHaveLength(3);
    });
  });

  it('deletes selected row from the panel', async () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Delete row'));

    await waitFor(() => {
      expect(
        getTable().tableData?.rows,
      ).toHaveLength(1);
    });
  });

  it('inserts column right from the panel', async () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Column right'));

    await waitFor(() => {
      const table = getTable();
      expect(
        table.tableData?.columns,
      ).toHaveLength(3);
      expect(
        table.tableData?.rows[0].cells,
      ).toHaveLength(3);
    });
  });

  it('deletes selected column from the panel', async () => {
    render(<WriterTablePropertiesPanel />);

    fireEvent.click(screen.getByText('Delete column'));

    await waitFor(() => {
      const table = getTable();
      expect(
        table.tableData?.columns,
      ).toHaveLength(1);
      expect(
        table.tableData?.rows[0].cells,
      ).toHaveLength(1);
    });
  });

  it('merges selected cells when range selection is provided', async () => {
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

    await waitFor(() => {
      const table = getTable();
      expect(
        table.tableData?.rows[0].cells[0].colSpan,
      ).toBe(2);
      expect(
        table.tableData?.rows[0].cells[1].mergedInto,
      ).toEqual({
        rowIndex: 0,
        columnIndex: 0,
      });
    });
  });

  it('splits selected merged cell from the panel', async () => {
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

    fireEvent.click(
      screen.getByText('Merge cells'),
    );

    await waitFor(() => {
      expect(
        getTable()
          .tableData
          ?.rows[0]
          .cells[0]
          .colSpan,
      ).toBe(2);
    });

    fireEvent.click(
      screen.getByText('Split cell'),
    );

    await waitFor(() => {
      const table = getTable();
      expect(
        table.tableData?.rows[0].cells[0].colSpan,
      ).toBeUndefined();
      expect(
        table.tableData?.rows[0].cells[1].mergedInto,
      ).toBeUndefined();
    });
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
