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
});
