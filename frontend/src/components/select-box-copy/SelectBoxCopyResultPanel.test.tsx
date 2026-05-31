import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SelectBoxCopyResult } from '@/core/select-box-copy/types';
import { SelectBoxCopyResultPanel } from './SelectBoxCopyResultPanel';

function resultWithTable(): SelectBoxCopyResult {
  return {
    pageNumber: 1,
    pageIndex: 0,
    viewportRect: { x: 0, y: 0, width: 200, height: 100 },
    pdfRect: { x: 0, y: 500, width: 200, height: 100 },
    items: [
      { id: 'a', text: 'A', x: 10, y: 10, width: 10, height: 10, fontSize: 10 },
      { id: 'b', text: 'B', x: 60, y: 10, width: 10, height: 10, fontSize: 10 },
    ],
    rows: [],
    plainText: 'A\tB',
    html: '<p>A B</p>',
    table: {
      confidence: 0.86,
      html: '<table><tr><td>A</td><td>B</td></tr></table>',
      tsv: 'A\tB',
      tableData: {
        columns: [{ id: 'col-1' }, { id: 'col-2' }],
        rows: [
          {
            id: 'row-1',
            cells: [
              { id: 'cell-1', text: 'A' },
              { id: 'cell-2', text: 'B' },
            ],
          },
        ],
      },
    },
  };
}

describe('SelectBoxCopyResultPanel', () => {
  it('shows inspector metrics and confidence badge', () => {
    render(
      <SelectBoxCopyResultPanel
        result={resultWithTable()}
        onCopy={vi.fn()}
        onCopyImage={vi.fn()}
        onInsertWriter={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/select box copy result inspector/i)).toBeTruthy();
    expect(document.querySelector('[data-select-box-copy-confidence-badge="true"]')).toBeTruthy();
    expect(screen.getByText(/Recommended/i)).toBeTruthy();
  });

  it('allows table preview and cell correction before copy', () => {
    const onCopy = vi.fn();

    render(
      <SelectBoxCopyResultPanel
        result={resultWithTable()}
        onCopy={onCopy}
        onCopyImage={vi.fn()}
        onInsertWriter={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /show table preview/i }));

    const cell = screen.getByLabelText('Table cell 1-2');
    fireEvent.change(cell, {
      target: {
        value: 'Changed',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /copy table/i }));

    expect(onCopy).toHaveBeenCalledWith(
      'table',
      expect.objectContaining({
        table: expect.objectContaining({
          tsv: 'A\tChanged',
        }),
      }),
    );
  });

  it('supports force image insertion mode', () => {
    const onInsertWriter = vi.fn();

    render(
      <SelectBoxCopyResultPanel
        result={resultWithTable()}
        onCopy={vi.fn()}
        onCopyImage={vi.fn()}
        onInsertWriter={onInsertWriter}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('image'));
    fireEvent.click(screen.getByRole('button', { name: /insert writer/i }));

    expect(onInsertWriter).toHaveBeenCalledWith(
      'image',
      expect.any(Object),
    );
  });
});