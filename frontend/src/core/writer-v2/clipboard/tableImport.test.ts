import { describe, expect, it } from 'vitest';
import {
  clipboardHtmlContainsTable,
  extractFirstTableFromClipboardHtml,
} from './tableImport';

describe('writer-v2 table import', () => {
  it('detects table HTML', () => {
    expect(clipboardHtmlContainsTable('<table><tr><td>A</td></tr></table>')).toBe(true);
    expect(clipboardHtmlContainsTable('<p>No table</p>')).toBe(false);
  });

  it('converts first HTML table into WriterTableData', () => {
    const table = extractFirstTableFromClipboardHtml(`
      <table>
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td>Pipe</td><td>12 inch</td></tr>
      </table>
    `);

    expect(table?.columns).toHaveLength(2);
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows[0].cells[0].text).toBe('Name');
    expect(table?.rows[1].cells[1].text).toBe('12 inch');
  });

  it('preserves colspan and rowspan when greater than one', () => {
    const table = extractFirstTableFromClipboardHtml(`
      <table>
        <tr><td colspan="2">Merged</td></tr>
        <tr><td rowspan="2">A</td><td>B</td></tr>
      </table>
    `);

    expect(table?.rows[0].cells[0].colSpan).toBe(2);
    expect(table?.rows[1].cells[0].rowSpan).toBe(2);
  });
});
