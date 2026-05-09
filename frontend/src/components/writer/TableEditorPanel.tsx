import React, { useMemo, useState } from 'react';
import type {
  PlacedElement,
  WriterTableModel,
} from '@/core/writer/types';
import {
  createDefaultTableModel,
} from '@/core/writer/content-model';
import {
  syncElementContentFromModel,
} from '@/core/writer/content-serialization';
import {
  deleteTableColumn,
  deleteTableRow,
  insertTableColumn,
  insertTableRow,
  pasteMatrixIntoTable,
  updateTableCellText,
} from '@/core/writer/tableCommands';
import {
  createSingleCellSelection,
  isCellInSelection,
  type WriterTableSelection,
} from '@/core/writer/tableSelection';

export interface TableEditorPanelProps {
  element: PlacedElement;
  onChange: (element: PlacedElement) => void;
  onClose?: () => void;
}

export const TableEditorPanel: React.FC<TableEditorPanelProps> = ({
  element,
  onChange,
  onClose,
}) => {
  const initialTable = useMemo(() => {
    if (element.contentModel?.kind === 'table') return element.contentModel;
    return createDefaultTableModel(3, 3);
  }, [element]);

  const [table, setTable] = useState<WriterTableModel>(initialTable);
  const [selection, setSelection] = useState<WriterTableSelection | null>(
    createSingleCellSelection(0, 0),
  );

  const selectedRow = selection?.startRow ?? 0;
  const selectedCol = selection?.startCol ?? 0;

  const commit = (nextTable: WriterTableModel) => {
    setTable(nextTable);
    onChange(
      syncElementContentFromModel({
        ...element,
        type: 'table',
        contentModel: nextTable,
      }),
    );
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain');

    if (!text || !text.includes('\t')) return;

    event.preventDefault();

    const matrix = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'));

    commit(pasteMatrixIntoTable(table, selectedRow, selectedCol, matrix));
  };

  return (
    <div
      className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      data-writer-allow-native-paste="true"
      onPaste={handlePaste}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 p-3">
        <div>
          <div className="text-sm font-semibold">Table Editor</div>
          <div className="text-xs text-slate-500">
            {table.rows.length} row(s), {table.columns.length} column(s)
          </div>
        </div>

        <div className="flex gap-2">
          {onClose && (
            <button
              type="button"
              className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 p-3">
        <ToolbarButton onClick={() => commit(insertTableRow(table, selectedRow + 1))}>
          Insert Row
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(deleteTableRow(table, selectedRow))}>
          Delete Row
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(insertTableColumn(table, selectedCol + 1))}>
          Insert Column
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(deleteTableColumn(table, selectedCol))}>
          Delete Column
        </ToolbarButton>
      </div>

      <div className="overflow-auto p-3">
        <table className="border-collapse text-sm min-w-full">
          <thead>
            <tr>
              <th className="border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-1 w-10">
                #
              </th>
              {table.columns.map((column, colIndex) => (
                <th
                  key={column.id}
                  className="border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-1"
                >
                  {column.label || colIndex + 1}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th className="border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-1">
                  {rowIndex + 1}
                </th>

                {row.cells.map((cell, colIndex) => {
                  const selected = isCellInSelection({ row: rowIndex, col: colIndex }, selection);

                  return (
                    <td
                      key={cell.id}
                      className={[
                        'border border-slate-300 dark:border-slate-700 p-0',
                        selected ? 'bg-blue-50 dark:bg-blue-950/40' : '',
                      ].join(' ')}
                    >
                      <input
                        value={cell.text}
                        onFocus={() => setSelection(createSingleCellSelection(rowIndex, colIndex))}
                        onChange={(event) =>
                          commit(updateTableCellText(table, rowIndex, colIndex, event.target.value))
                        }
                        className="w-full min-w-[120px] bg-transparent px-2 py-1 outline-none"
                        data-writer-allow-native-paste="true"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function ToolbarButton(props: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
