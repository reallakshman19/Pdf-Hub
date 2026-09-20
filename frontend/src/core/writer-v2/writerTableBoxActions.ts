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

type TableMutation = (
  tableData: WriterTableData,
) => boolean;

export async function updateActiveTableCell(
  rowId: string,
  cellId: string,
  text: string,
): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      const row = tableData.rows.find(
        (item) => item.id === rowId,
      );
      const cell = row?.cells.find(
        (item) => item.id === cellId,
      );

      if (!cell || cell.text === text) {
        return false;
      }

      cell.text = text;
      return true;
    },
    'Updated Writer table cell.',
  );
}

export async function addActiveTableRow(): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      tableData.rows.push({
        id: createTableId('row'),
        cells: tableData.columns.map(() => ({
          id: createTableId('cell'),
          text: '',
        })),
      });
      return true;
    },
    'Added Writer table row.',
  );
}

export async function removeActiveTableRow(): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      if (tableData.rows.length <= 1) {
        return false;
      }

      tableData.rows.pop();
      return true;
    },
    'Removed Writer table row.',
  );
}

export async function addActiveTableColumn(): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      const nextIndex =
        tableData.columns.length + 1;

      tableData.columns.push({
        id: createTableId('col'),
        label: `Column ${nextIndex}`,
        width: 1,
      });

      tableData.rows = tableData.rows.map(
        (row) => ({
          ...row,
          cells: [
            ...row.cells,
            {
              id: createTableId('cell'),
              text: '',
            },
          ],
        }),
      );

      return true;
    },
    'Added Writer table column.',
  );
}

export async function removeActiveTableColumn(): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      if (tableData.columns.length <= 1) {
        return false;
      }

      tableData.columns.pop();
      tableData.rows = tableData.rows.map(
        (row) => ({
          ...row,
          cells: row.cells.slice(
            0,
            Math.max(
              1,
              row.cells.length - 1,
            ),
          ),
        }),
      );

      return true;
    },
    'Removed Writer table column.',
  );
}

export async function updateActiveTableColumnLabel(
  columnId: string,
  label: string,
): Promise<WriterTableActionResult> {
  const table = getActiveTableBox();

  if (!table?.tableData) {
    return noActiveTableResult();
  }

  return commitTableMutation(
    table.id,
    (tableData) => {
      const column = tableData.columns.find(
        (item) => item.id === columnId,
      );

      if (!column || column.label === label) {
        return false;
      }

      column.label = label;
      return true;
    },
    'Updated Writer table column label.',
  );
}

export function getActiveTableBox(): WriterElementV2 | null {
  const store = useWriterV2Store.getState();
  const activeId =
    store.activeId
    ?? store.selectedIds.at(-1);

  if (!activeId) return null;

  const element = store.elements.find(
    (item) => item.id === activeId,
  );

  if (
    !element
    || element.type !== 'tableBox'
    || element.locked
    || element.hidden
  ) {
    return null;
  }

  return element;
}

async function commitTableMutation(
  tableId: string,
  mutate: TableMutation,
  message: string,
): Promise<WriterTableActionResult> {
  const store = useWriterV2Store.getState();

  const result =
    await store.dispatchWriterCommandDurableLatest(
      (state) => {
        const table = state.elements.find(
          (item) => item.id === tableId,
        );

        if (
          !table
          || table.type !== 'tableBox'
          || table.locked
          || table.hidden
          || !table.tableData
        ) {
          return null;
        }

        const tableData =
          cloneTableData(table.tableData);

        if (!mutate(tableData)) {
          return null;
        }

        return {
          type: 'UPDATE_WRITER_ELEMENT',
          id: table.id,
          patch: {
            tableData,
            plainText:
              summarizeTable(tableData),
          },
        };
      },
    );

  return {
    changed: result.changed,
    message: result.changed
      ? message
      : result.reason,
  };
}

function noActiveTableResult(): WriterTableActionResult {
  return {
    changed: false,
    message:
      'No active Writer table selected.',
  };
}

function summarizeTable(
  tableData: WriterTableData,
): string {
  return `Table ${tableData.columns.length}x${tableData.rows.length}`;
}

function cloneTableData(
  tableData: WriterTableData,
): WriterTableData {
  return {
    ...tableData,
    columns: tableData.columns.map(
      (column) => ({ ...column }),
    ),
    rows: tableData.rows.map(
      (row): WriterTableRow => ({
        ...row,
        cells: row.cells.map(
          (cell): WriterTableCell => ({
            ...cell,
            ...(cell.style
              ? {
                  style: {
                    ...cell.style,
                    ...(cell.style.borders
                      ? {
                          borders: {
                            ...cell.style.borders,
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          }),
        ),
      }),
    ),
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
