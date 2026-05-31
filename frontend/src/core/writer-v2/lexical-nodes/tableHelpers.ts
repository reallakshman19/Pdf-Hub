import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  $isElementNode,
  type LexicalEditor,
} from 'lexical';
import {
  $createTableNodeWithDimensions,
  TableNode,
  TableRowNode,
  TableCellNode,
} from '@lexical/table';

/**
 * Insert a table at the current cursor position.
 * @param editor - The Lexical editor instance
 * @param rows - Number of rows (min 1, max 50)
 * @param cols - Number of columns (min 1, max 20)
 */
export function insertTable(
  editor: LexicalEditor,
  rows: number,
  cols: number,
): void {
  const clampedRows = Math.max(1, Math.min(rows, 50));
  const clampedCols = Math.max(1, Math.min(cols, 20));

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const tableNode = $createTableNodeWithDimensions(
      clampedRows,
      clampedCols,
      false, // includeHeaders
    );

    selection.insertNodes([tableNode]);

    // Place cursor after table
    const paragraph = $createParagraphNode();
    tableNode.insertAfter(paragraph);
    paragraph.selectStart();
  });
}

/**
 * Insert a table from pasted/imported data (e.g., CSV, HTML table).
 * Each row is a string[], and the outer array is the rows.
 */
export function insertTableFromData(
  editor: LexicalEditor,
  data: string[][],
): void {
  if (data.length === 0) return;
  const cols = Math.max(...data.map((r) => r.length));
  if (cols === 0) return;

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const tableNode = $createTableNodeWithDimensions(
      data.length,
      cols,
      false,
    );

    // Fill cells with data
    const rows = tableNode.getChildren();
    for (let r = 0; r < rows.length; r++) {
      const rowNode = rows[r];
      if (!(rowNode instanceof TableRowNode)) continue;
      const cells = rowNode.getChildren();
      for (let c = 0; c < cells.length; c++) {
        const cellNode = cells[c];
        if (!(cellNode instanceof TableCellNode)) continue;
        const text = data[r]?.[c] ?? '';
        const paragraph = cellNode.getFirstChild();
        if (paragraph && $isElementNode(paragraph)) {
          paragraph.clear();
          paragraph.append($createTextNode(text));
        }
      }
    }

    selection.insertNodes([tableNode]);
  });
}

/** Re-export for editor config registration */
export { TableNode, TableRowNode, TableCellNode };
