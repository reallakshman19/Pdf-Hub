import { describe, it, expect } from 'vitest';
import { TableNode, TableRowNode, TableCellNode } from './tableHelpers';

describe('Table Helpers', () => {
  it('re-exports Lexical table node types', () => {
    expect(TableNode).toBeDefined();
    expect(TableRowNode).toBeDefined();
    expect(TableCellNode).toBeDefined();
  });

  it('insertTable function exists and is callable', async () => {
    const { insertTable } = await import('./tableHelpers');
    expect(typeof insertTable).toBe('function');
  });

  it('insertTableFromData function exists and is callable', async () => {
    const { insertTableFromData } = await import('./tableHelpers');
    expect(typeof insertTableFromData).toBe('function');
  });
});
