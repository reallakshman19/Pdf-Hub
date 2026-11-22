/** Rectangular spreadsheet TSV only. Preserve empty cells and whitespace.
 * CSV-like prose is not silently promoted to a table. Oversized input remains text. */
export function parseTabularText(text: string): string[][] | null {
  if (!text.includes('\t') || text.length > 1_000_000) return null;
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > 50) return null;
  const rows = lines.map(line => line.split('\t'));
  const columns = rows[0].length;
  if (columns < 2 || columns > 20 || rows.some(row => row.length !== columns)) return null;
  return rows;
}
