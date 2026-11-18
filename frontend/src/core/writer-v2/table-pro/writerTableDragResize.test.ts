import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  WriterElementV2,
} from '../types';
import {
  buildWriterTableDragResizeCommand,
} from './writerTableDragResize';

function tableElement(): WriterElementV2 {
  return {
    id: 'table-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    },
    style: {
      zIndex: 1,
      opacity: 1,
    },
    createdAt:
      '2026-09-19T00:00:00.000Z',
    updatedAt:
      '2026-09-19T00:00:00.000Z',
    locked: false,
    hidden: false,
    tableData: {
      columns: [
        { id: 'col-1', width: 100 },
        { id: 'col-2', width: 100 },
        { id: 'col-3', width: 100 },
      ],
      rows: [
        {
          id: 'row-1',
          height: 40,
          cells: [
            { id: 'c11', text: 'A' },
            { id: 'c12', text: 'B' },
            { id: 'c13', text: 'C' },
          ],
        },
        {
          id: 'row-2',
          height: 40,
          cells: [
            { id: 'c21', text: 'D' },
            { id: 'c22', text: 'E' },
            { id: 'c23', text: 'F' },
          ],
        },
      ],
    },
  };
}

describe('buildWriterTableDragResizeCommand', () => {
  it('builds one final column update from captured widths and pointer-up position', () => {
    const result =
      buildWriterTableDragResizeCommand({
        drag: {
          type: 'resize-column',
          columnIndex: 0,
          startX: 100,
          initialWidths: [100, 100, 100],
        },
        point: {
          x: 130,
          y: 0,
        },
        elements: [tableElement()],
        elementId: 'table-1',
      });

    expect(result.changed).toBe(true);
    expect(result.command).toMatchObject({
      type: 'UPDATE_WRITER_ELEMENT',
      id: 'table-1',
      patch: {
        tableData: {
          columns: [
            { id: 'col-1', width: 130 },
            { id: 'col-2', width: 70 },
            { id: 'col-3', width: 100 },
          ],
        },
      },
    });
  });

  it('builds one final row update from captured height and pointer-up position', () => {
    const result =
      buildWriterTableDragResizeCommand({
        drag: {
          type: 'resize-row',
          rowIndex: 0,
          startY: 120,
          initialHeight: 40,
        },
        point: {
          x: 0,
          y: 100,
        },
        elements: [tableElement()],
        elementId: 'table-1',
      });

    expect(result.changed).toBe(true);
    expect(result.command).toMatchObject({
      type: 'UPDATE_WRITER_ELEMENT',
      id: 'table-1',
      patch: {
        tableData: {
          rows: [
            {
              id: 'row-1',
              height: 60,
            },
          ],
        },
      },
    });
  });

  it('returns no command when the table target disappears before commit', () => {
    const result =
      buildWriterTableDragResizeCommand({
        drag: {
          type: 'resize-row',
          rowIndex: 0,
          startY: 120,
          initialHeight: 40,
        },
        point: {
          x: 0,
          y: 100,
        },
        elements: [],
        elementId: 'table-1',
      });

    expect(result).toEqual({
      command: null,
      changed: false,
      message:
        'Writer table resize target is unavailable.',
    });
  });

  it('clamps paired widths while preserving total table width at the minimum', () => {
    const result = buildWriterTableDragResizeCommand({
      drag: { type: 'resize-column', columnIndex: 0, startX: 100, initialWidths: [100, 100, 100] },
      point: { x: 190, y: 0 },
      elements: [tableElement()],
      elementId: 'table-1',
    });
    expect(result.changed).toBe(true);
    expect(result.command).toMatchObject({
      type: 'UPDATE_WRITER_ELEMENT',
      patch: { tableData: { columns: [
        { id: 'col-1', width: 184 },
        { id: 'col-2', width: 16 },
        { id: 'col-3', width: 100 },
      ] } },
    });
  });

  it('rejects resizing the terminal column without an adjacent sibling', () => {
    const result = buildWriterTableDragResizeCommand({
      drag: { type: 'resize-column', columnIndex: 2, startX: 300, initialWidths: [100, 100, 100] },
      point: { x: 330, y: 0 },
      elements: [tableElement()],
      elementId: 'table-1',
    });
    expect(result.changed).toBe(false);
    expect(result.command).toBeNull();
  });

  it('rejects a stale document-specific table drag even when its element ID collides', () => {
    const foreign = { ...tableElement(), documentFingerprint: 'doc-B' };
    const result = buildWriterTableDragResizeCommand({
      drag: { type: 'resize-column', documentFingerprint: 'doc-A', columnIndex: 0, startX: 100, initialWidths: [100, 100, 100] },
      point: { x: 130, y: 0 },
      elements: [foreign],
      elementId: 'table-1',
    });
    expect(result.changed).toBe(false);
    expect(result.command).toBeNull();
  });

  it('rejects a locked table without creating a mutation command', () => {
    const result = buildWriterTableDragResizeCommand({
      drag: { type: 'resize-column', columnIndex: 0, startX: 100, initialWidths: [100, 100, 100] },
      point: { x: 130, y: 0 },
      elements: [{ ...tableElement(), locked: true }],
      elementId: 'table-1',
    });
    expect(result.changed).toBe(false);
    expect(result.command).toBeNull();
  });

  it('carries every original table row and cell through an atomic paired-column command', () => {
    const original = tableElement();
    const result = buildWriterTableDragResizeCommand({
      drag: { type: 'resize-column', columnIndex: 0, startX: 100, initialWidths: [100, 100, 100] },
      point: { x: 125, y: 0 },
      elements: [original],
      elementId: 'table-1',
    });
    expect(result.changed).toBe(true);
    if (result.command?.type !== 'UPDATE_WRITER_ELEMENT') throw new Error('No canonical update');
    const tableData = result.command.patch.tableData;
    expect(tableData?.rows).toEqual(original.tableData?.rows);
    expect(tableData?.columns.map((column) => column.width)).toEqual([125, 75, 100]);
  });

});
