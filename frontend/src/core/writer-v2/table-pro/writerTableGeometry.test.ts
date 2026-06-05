import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import {
  computeResizedColumnWidths,
  computeWriterTableGridLayout,
  createTableSelectionFromDrag,
  hitTestWriterTableCell,
  hitTestWriterTableResizeHandle,
} from './writerTableGeometry';

describe('writerTableGeometry', () => {
  it('computes cell layout for body rows with header space reserved', () => {
    const element = makeTableElement();

    const layout = computeWriterTableGridLayout({
      element,
      rect: {
        x: 0,
        y: 0,
        width: 300,
        height: 140,
      },
      headerHeight: 20,
    });

    expect(layout).not.toBeNull();
    expect(layout?.hasHeaderRow).toBe(true);
    expect(layout?.headerHeight).toBe(20);
    expect(layout?.cells).toHaveLength(6);

    const firstCell = layout!.cells[0];

    expect(firstCell.rowIndex).toBe(0);
    expect(firstCell.columnIndex).toBe(0);
    expect(firstCell.rect.x).toBe(0);
    expect(firstCell.rect.y).toBe(60);
    expect(firstCell.rect.width).toBeCloseTo(100);
    expect(firstCell.rect.height).toBeCloseTo(60);
  });

  it('hit-tests cells using bottom-left local y semantics', () => {
    const layout = computeWriterTableGridLayout({
      element: makeTableElement(),
      rect: {
        x: 0,
        y: 0,
        width: 300,
        height: 140,
      },
      headerHeight: 20,
    })!;

    const hit = hitTestWriterTableCell(layout, {
      x: 50,
      y: 90,
    });

    expect(hit?.rowIndex).toBe(0);
    expect(hit?.columnIndex).toBe(0);
  });

  it('detects column resize handle', () => {
    const layout = computeWriterTableGridLayout({
      element: makeTableElement(),
      rect: {
        x: 0,
        y: 0,
        width: 300,
        height: 140,
      },
      headerHeight: 20,
    })!;

    const hit = hitTestWriterTableResizeHandle(layout, {
      x: 100,
      y: 80,
    });

    expect(hit).toEqual({
      type: 'column',
      index: 0,
    });
  });

  it('creates rectangular drag selection', () => {
    const selection = createTableSelectionFromDrag({
      elementId: 'table-1',
      anchor: {
        elementId: 'table-1',
        rowIndex: 0,
        columnIndex: 0,
      },
      current: {
        elementId: 'table-1',
        rowIndex: 1,
        columnIndex: 2,
      },
    });

    expect(selection.cells).toHaveLength(6);
    expect(selection.cells[0]).toEqual({
      elementId: 'table-1',
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(selection.cells[5]).toEqual({
      elementId: 'table-1',
      rowIndex: 1,
      columnIndex: 2,
    });
  });

  it('resizes adjacent columns while preserving minimum width', () => {
    const next = computeResizedColumnWidths({
      currentWidths: [100, 100, 100],
      columnIndex: 0,
      delta: 40,
      minColumnWidth: 50,
    });

    expect(next).toEqual([140, 60, 100]);

    const clamped = computeResizedColumnWidths({
      currentWidths: [100, 100, 100],
      columnIndex: 0,
      delta: 90,
      minColumnWidth: 50,
    });

    expect(clamped).toEqual([150, 50, 100]);
  });

  it('computes one spanned geometry cell for a merged range and skips follower cells', () => {
    const element = makeTableElement();

    element.tableData!.rows[0].cells[0] = {
      ...element.tableData!.rows[0].cells[0],
      colSpan: 2,
      rowSpan: 2,
    };

    element.tableData!.rows[0].cells[1] = {
      ...element.tableData!.rows[0].cells[1],
      text: '',
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    element.tableData!.rows[1].cells[0] = {
      ...element.tableData!.rows[1].cells[0],
      text: '',
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    element.tableData!.rows[1].cells[1] = {
      ...element.tableData!.rows[1].cells[1],
      text: '',
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    const layout = computeWriterTableGridLayout({
      element,
      rect: {
        x: 0,
        y: 0,
        width: 300,
        height: 140,
      },
      headerHeight: 20,
    });

    expect(layout).not.toBeNull();

    const mergedCell = layout!.cells.find(
      (cell) => cell.rowIndex === 0 && cell.columnIndex === 0,
    );

    expect(mergedCell).toBeTruthy();
    expect(mergedCell?.colSpan).toBe(2);
    expect(mergedCell?.rowSpan).toBe(2);
    expect(mergedCell?.rect.width).toBeCloseTo(200);
    expect(mergedCell?.rect.height).toBeCloseTo(120);

    expect(
      layout!.cells.some((cell) => cell.rowIndex === 0 && cell.columnIndex === 1),
    ).toBe(false);

    expect(
      layout!.cells.some((cell) => cell.rowIndex === 1 && cell.columnIndex === 0),
    ).toBe(false);
  });

  it('hit-tests merged cell area to the master cell address', () => {
    const element = makeTableElement();

    element.tableData!.rows[0].cells[0] = {
      ...element.tableData!.rows[0].cells[0],
      colSpan: 2,
      rowSpan: 2,
    };

    element.tableData!.rows[0].cells[1] = {
      ...element.tableData!.rows[0].cells[1],
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    element.tableData!.rows[1].cells[0] = {
      ...element.tableData!.rows[1].cells[0],
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    element.tableData!.rows[1].cells[1] = {
      ...element.tableData!.rows[1].cells[1],
      mergedInto: {
        rowIndex: 0,
        columnIndex: 0,
      },
    };

    const layout = computeWriterTableGridLayout({
      element,
      rect: {
        x: 0,
        y: 0,
        width: 300,
        height: 140,
      },
      headerHeight: 20,
    })!;

    const hit = hitTestWriterTableCell(layout, {
      x: 150,
      y: 40,
    });

    expect(hit?.rowIndex).toBe(0);
    expect(hit?.columnIndex).toBe(0);
  });
});

function makeTableElement(): WriterElementV2 {
  return {
    id: 'table-1',
    documentFingerprint: 'doc',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 0,
      y: 0,
      width: 300,
      height: 140,
    },
    tableData: {
      hasHeaderRow: true,
      columns: [
        { id: 'a', label: 'A', width: 100 },
        { id: 'b', label: 'B', width: 100 },
        { id: 'c', label: 'C', width: 100 },
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
