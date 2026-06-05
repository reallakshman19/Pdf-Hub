import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { createSingleCellSelection } from './writerTableSelection';
import {
  buildResizeTableColumnCommand,
  buildSetTableCellFillCommand,
  buildSetTableCellHorizontalAlignmentCommand,
  buildSetTableHeaderRowCommand,
  buildUpdateTableCellTextCommand,
  buildDeleteTableColumnCommand,
  buildDeleteTableRowCommand,
  buildInsertTableColumnCommand,
  buildInsertTableRowCommand,
  buildMergeTableCellsCommand,
  buildSplitTableCellCommand,
} from './writerTableCommandBridge';
import { createRectangularTableSelection } from './writerTableSelection';

describe('writerTableCommandBridge', () => {
  it('builds UPDATE_WRITER_ELEMENT command for cell alignment', () => {
    const elements = [makeTableElement()];
    const selection = createSingleCellSelection('table-1', 0, 0);

    const result = buildSetTableCellHorizontalAlignmentCommand(
      elements,
      selection,
      'center',
    );

    expect(result.changed).toBe(true);
    expect(result.command?.type).toBe('UPDATE_WRITER_ELEMENT');

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.id).toBe('table-1');
      expect(result.command.patch.tableData?.rows[0].cells[0].style?.alignment).toBe('center');
    }
  });

  it('builds UPDATE_WRITER_ELEMENT command for fill color', () => {
    const result = buildSetTableCellFillCommand(
      [makeTableElement()],
      createSingleCellSelection('table-1', 0, 1),
      '#FEF3C7',
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.rows[0].cells[1].style?.backgroundColor).toBe('#FEF3C7');
    }
  });

  it('builds command for header row toggle', () => {
    const result = buildSetTableHeaderRowCommand(
      [makeTableElement()],
      'table-1',
      false,
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.hasHeaderRow).toBe(false);
    }
  });

  it('builds command for column resize', () => {
    const result = buildResizeTableColumnCommand(
      [makeTableElement()],
      'table-1',
      'col-a',
      220,
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.columns[0].width).toBe(220);
    }
  });

  it('builds command for cell text update', () => {
    const result = buildUpdateTableCellTextCommand(
      [makeTableElement()],
      'table-1',
      1,
      1,
      'Updated cell',
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.rows[1].cells[1].text).toBe('Updated cell');
    }
  });

  it('returns null command when no change is possible', () => {
    const result = buildSetTableHeaderRowCommand(
      [makeTableElement()],
      'missing-table',
      false,
    );

    expect(result.changed).toBe(false);
    expect(result.command).toBeNull();
  });

  it('builds command for inserting table row', () => {
    const result = buildInsertTableRowCommand(
      [makeTableElement()],
      'table-1',
      0,
      'below',
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.rows).toHaveLength(3);
    }
  });

  it('builds command for deleting table row', () => {
    const result = buildDeleteTableRowCommand(
      [makeTableElement()],
      'table-1',
      0,
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.rows).toHaveLength(1);
    }
  });

  it('builds command for inserting table column', () => {
    const result = buildInsertTableColumnCommand(
      [makeTableElement()],
      'table-1',
      0,
      'right',
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.columns).toHaveLength(3);
      expect(result.command.patch.tableData?.rows[0].cells).toHaveLength(3);
    }
  });

  it('builds command for deleting table column', () => {
    const result = buildDeleteTableColumnCommand(
      [makeTableElement()],
      'table-1',
      0,
    );

    expect(result.changed).toBe(true);

    if (result.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(result.command.patch.tableData?.columns).toHaveLength(1);
      expect(result.command.patch.tableData?.rows[0].cells).toHaveLength(1);
    }
  });

  it('builds command for merging and splitting table cells', () => {
    const selection = createRectangularTableSelection({
      elementId: 'table-1',
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 1,
      endColumnIndex: 1,
    });

    const merge = buildMergeTableCellsCommand(
      [makeTableElement()],
      selection,
    );

    expect(merge.changed).toBe(true);

    if (merge.command?.type !== 'UPDATE_WRITER_ELEMENT') {
      throw new Error('Expected merge update command.');
    }

    expect(merge.command.patch.tableData?.rows[0].cells[0].colSpan).toBe(2);

    const mergedElement = {
      ...makeTableElement(),
      tableData: merge.command.patch.tableData,
    };

    const split = buildSplitTableCellCommand(
      [mergedElement],
      'table-1',
      0,
      0,
    );

    expect(split.changed).toBe(true);

    if (split.command?.type === 'UPDATE_WRITER_ELEMENT') {
      expect(split.command.patch.tableData?.rows[0].cells[0].colSpan).toBeUndefined();
    }
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
