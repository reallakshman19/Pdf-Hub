import type {
  WriterElementV2,
  WriterTableCell,
  WriterTableData,
  WriterTableRow,
} from './types';
import { useWriterV2Store } from './writerV2Store';

export interface WriterTableActionResult {
  changed: boolean;
  message: string;
}

export function updateActiveTableCell(
  rowId: string,
  cellId: string,
  text: string,
): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  const tableData = cloneTableData(table.tableData);

  for (const row of tableData.rows) {
    if (row.id !== rowId) continue;

    for (const cell of row.cells) {
      if (cell.id === cellId) {
        cell.text = text;
      }
    }
  }

  return commitTableData(table, tableData, 'Updated Writer table cell.');
}

export function addActiveTableRow(): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  const tableData = cloneTableData(table.tableData);

  tableData.rows.push({
    id: createTableId('row'),
    cells: tableData.columns.map(() => ({
      id: createTableId('cell'),
      text: '',
    })),
  });

  return commitTableData(table, tableData, 'Added Writer table row.');
}

export function removeActiveTableRow(): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  if (table.tableData.rows.length <= 1) {
    return {
      changed: false,
      message: 'Writer table must keep at least one row.',
    };
  }

  const tableData = cloneTableData(table.tableData);
  tableData.rows.pop();

  return commitTableData(table, tableData, 'Removed Writer table row.');
}

export function addActiveTableColumn(): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  const tableData = cloneTableData(table.tableData);
  const nextIndex = tableData.columns.length + 1;

  tableData.columns.push({
    id: createTableId('col'),
    label: `Column ${nextIndex}`,
    width: 1,
  });

  tableData.rows = tableData.rows.map((row) => ({
    ...row,
    cells: [
      ...row.cells,
      {
        id: createTableId('cell'),
        text: '',
      },
    ],
  }));

  return commitTableData(table, tableData, 'Added Writer table column.');
}

export function removeActiveTableColumn(): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  if (table.tableData.columns.length <= 1) {
    return {
      changed: false,
      message: 'Writer table must keep at least one column.',
    };
  }

  const tableData = cloneTableData(table.tableData);

  tableData.columns.pop();
  tableData.rows = tableData.rows.map((row) => ({
    ...row,
    cells: row.cells.slice(0, Math.max(1, row.cells.length - 1)),
  }));

  return commitTableData(table, tableData, 'Removed Writer table column.');
}

export function updateActiveTableColumnLabel(
  columnId: string,
  label: string,
): WriterTableActionResult {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return {
      changed: false,
      message: 'No active Writer table selected.',
    };
  }

  const tableData = cloneTableData(table.tableData);

  tableData.columns = tableData.columns.map((column) =>
    column.id === columnId
      ? {
          ...column,
          label,
        }
      : column,
  );

  return commitTableData(table, tableData, 'Updated Writer table column label.');
}

export function getActiveTableBox(): WriterElementV2 | null {
  const store = useWriterV2Store.getState();
  const activeId = store.activeId ?? store.selectedIds.at(-1);

  if (!activeId) return null;

  const element = store.elements.find((item) => item.id === activeId);

  if (!element || element.type !== 'tableBox' || element.locked || element.hidden) {
    return null;
  }

  return element;
}

function commitTableData(
  table: WriterElementV2,
  tableData: WriterTableData,
  message: string,
): WriterTableActionResult {
  const store = useWriterV2Store.getState();

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: table.id,
    patch: {
      tableData,
      plainText: summarizeTable(tableData),
    },
  });

  return {
    changed: result.changed,
    message,
  };
}

function summarizeTable(tableData: WriterTableData): string {
  return `Table ${tableData.columns.length}x${tableData.rows.length}`;
}

function cloneTableData(tableData: WriterTableData): WriterTableData {
  return {
    columns: tableData.columns.map((column) => ({ ...column })),
    rows: tableData.rows.map((row): WriterTableRow => ({
      ...row,
      cells: row.cells.map((cell): WriterTableCell => ({ ...cell })),
    })),
  };
}

function createTableId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
