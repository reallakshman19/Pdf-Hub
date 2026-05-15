import { describe, expect, it } from 'vitest';
import {
  addTableDraftColumn,
  addTableDraftRow,
  createTableDraftFromResult,
  removeTableDraftColumn,
  removeTableDraftRow,
  tableDraftToResult,
  updateTableDraftCell,
} from './tableDraft';

const sourceTable = {
  confidence: 0.82,
  html: '<table></table>',
  tsv: 'A\tB',
  tableData: {
    columns: [{ id: 'col-1' }, { id: 'col-2' }],
    rows: [
      {
        id: 'row-1',
        cells: [
          { id: 'cell-1-1', text: 'A' },
          { id: 'cell-1-2', text: 'B' },
        ],
      },
    ],
  },
};

describe('select-box-copy table draft', () => {
  it('edits a cell and regenerates TSV/HTML', () => {
    const draft = updateTableDraftCell(
      createTableDraftFromResult(sourceTable),
      0,
      1,
      'Changed',
    );

    const result = tableDraftToResult(draft);

    expect(result.tsv).toBe('A\tChanged');
    expect(result.html).toContain('Changed');
  });

  it('adds and removes rows', () => {
    let draft = createTableDraftFromResult(sourceTable);

    draft = addTableDraftRow(draft);
    expect(draft.tableData.rows).toHaveLength(2);

    draft = removeTableDraftRow(draft, 1);
    expect(draft.tableData.rows).toHaveLength(1);
  });

  it('adds and removes columns', () => {
    let draft = createTableDraftFromResult(sourceTable);

    draft = addTableDraftColumn(draft);
    expect(draft.tableData.columns).toHaveLength(3);
    expect(draft.tableData.rows[0].cells).toHaveLength(3);

    draft = removeTableDraftColumn(draft, 2);
    expect(draft.tableData.columns).toHaveLength(2);
    expect(draft.tableData.rows[0].cells).toHaveLength(2);
  });
});