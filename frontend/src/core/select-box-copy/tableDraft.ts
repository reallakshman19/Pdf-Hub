import { v4 as uuidv4 } from 'uuid';
import type { WriterTableData } from '@/core/writer-v2/types';
import type { SelectBoxTableResult } from './types';
import {
  tableDataToHtml,
  tableDataToTsv,
} from './tableReconstruction';

export interface SelectBoxTableDraft {
  confidence: number;
  tableData: WriterTableData;
}

export function createTableDraftFromResult(
  table: SelectBoxTableResult,
): SelectBoxTableDraft {
  return {
    confidence: table.confidence,
    tableData: cloneTableData(table.tableData),
  };
}

export function updateTableDraftCell(
  draft: SelectBoxTableDraft,
  rowIndex: number,
  cellIndex: number,
  text: string,
): SelectBoxTableDraft {
  const tableData = cloneTableData(draft.tableData);

  const row = tableData.rows[rowIndex];
  const cell = row?.cells[cellIndex];

  if (!row || !cell) return draft;

  row.cells[cellIndex] = {
    ...cell,
    text,
  };

  return {
    ...draft,
    tableData,
  };
}

export function addTableDraftRow(
  draft: SelectBoxTableDraft,
): SelectBoxTableDraft {
  const tableData = cloneTableData(draft.tableData);
  const columnCount = Math.max(1, tableData.columns.length);

  tableData.rows.push({
    id: `row-${uuidv4()}`,
    cells: Array.from({ length: columnCount }, () => ({
      id: `cell-${uuidv4()}`,
      text: '',
    })),
  });

  return {
    ...draft,
    tableData,
  };
}

export function removeTableDraftRow(
  draft: SelectBoxTableDraft,
  rowIndex: number,
): SelectBoxTableDraft {
  const tableData = cloneTableData(draft.tableData);

  if (tableData.rows.length <= 1) return draft;

  tableData.rows.splice(rowIndex, 1);

  return {
    ...draft,
    tableData,
  };
}

export function addTableDraftColumn(
  draft: SelectBoxTableDraft,
): SelectBoxTableDraft {
  const tableData = cloneTableData(draft.tableData);
  const columnNumber = tableData.columns.length + 1;

  tableData.columns.push({
    id: `col-${uuidv4()}`,
    label: `Column ${columnNumber}`,
  });

  for (const row of tableData.rows) {
    row.cells.push({
      id: `cell-${uuidv4()}`,
      text: '',
    });
  }

  return {
    ...draft,
    tableData,
  };
}

export function removeTableDraftColumn(
  draft: SelectBoxTableDraft,
  columnIndex: number,
): SelectBoxTableDraft {
  const tableData = cloneTableData(draft.tableData);

  if (tableData.columns.length <= 1) return draft;

  tableData.columns.splice(columnIndex, 1);

  for (const row of tableData.rows) {
    row.cells.splice(columnIndex, 1);
  }

  return {
    ...draft,
    tableData,
  };
}

export function tableDraftToResult(
  draft: SelectBoxTableDraft,
): SelectBoxTableResult {
  return {
    confidence: draft.confidence,
    tableData: cloneTableData(draft.tableData),
    html: tableDataToHtml(draft.tableData),
    tsv: tableDataToTsv(draft.tableData),
  };
}

function cloneTableData(tableData: WriterTableData): WriterTableData {
  return {
    ...tableData,
    columns: tableData.columns.map((column) => ({ ...column })),
    rows: tableData.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    })),
  };
}