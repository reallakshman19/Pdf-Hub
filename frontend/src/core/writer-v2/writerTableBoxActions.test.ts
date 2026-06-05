import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  addActiveTableColumn,
  addActiveTableRow,
  removeActiveTableColumn,
  removeActiveTableRow,
  updateActiveTableCell,
  updateActiveTableColumnLabel,
} from './writerTableBoxActions';

function tableElement(): WriterElementV2 {
  return {
    id: 'table-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'tableBox',
    rect: { x: 10, y: 20, width: 300, height: 150 },
    plainText: 'Table',
    tableData: {
      columns: [
        { id: 'col-1', label: 'A', width: 1 },
        { id: 'col-2', label: 'B', width: 1 },
      ],
      rows: [
        {
          id: 'row-1',
          cells: [
            { id: 'cell-1', text: 'A1' },
            { id: 'cell-2', text: 'B1' },
          ],
        },
      ],
    },
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('writerTableBoxActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [tableElement()],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'table-1',
    });
  });

  it('updates a cell', () => {
    const result = updateActiveTableCell('row-1', 'cell-1', 'Updated');

    expect(result.changed).toBe(true);
    expect(useWriterV2Store.getState().elements[0].tableData?.rows[0].cells[0].text).toBe('Updated');
  });

  it('adds and removes rows', () => {
    addActiveTableRow();

    expect(useWriterV2Store.getState().elements[0].tableData?.rows).toHaveLength(2);

    removeActiveTableRow();

    expect(useWriterV2Store.getState().elements[0].tableData?.rows).toHaveLength(1);
  });

  it('adds and removes columns', () => {
    addActiveTableColumn();

    const afterAdd = useWriterV2Store.getState().elements[0].tableData;
    expect(afterAdd?.columns).toHaveLength(3);
    expect(afterAdd?.rows[0].cells).toHaveLength(3);

    removeActiveTableColumn();

    const afterRemove = useWriterV2Store.getState().elements[0].tableData;
    expect(afterRemove?.columns).toHaveLength(2);
    expect(afterRemove?.rows[0].cells).toHaveLength(2);
  });

  it('updates a column label', () => {
    updateActiveTableColumnLabel('col-1', 'New A');

    expect(useWriterV2Store.getState().elements[0].tableData?.columns[0].label).toBe('New A');
  });

  it('does not remove final row or column', () => {
    removeActiveTableRow();

    expect(useWriterV2Store.getState().elements[0].tableData?.rows).toHaveLength(1);

    removeActiveTableColumn();
    removeActiveTableColumn();

    expect(useWriterV2Store.getState().elements[0].tableData?.columns).toHaveLength(1);
  });
});
