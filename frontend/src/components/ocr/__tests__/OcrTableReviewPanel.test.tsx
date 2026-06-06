import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WriterTableData } from '@/core/writer-v2/types';
import { getOcrProfile } from '@/core/ocr/ocrProfiles';
import { mockOcrEngine } from '@/core/ocr/engines/mockOcrEngine';
import type { OcrTableBlock } from '@/core/ocr/types';
import { OcrTableReviewPanel } from '../OcrTableReviewPanel';

describe('OcrTableReviewPanel', () => {
  it('renders empty state', () => {
    render(
      <OcrTableReviewPanel tableBlock={null} />,
    );

    expect(screen.getByTestId('ocr-table-review-empty')).toBeTruthy();
  });

  it('renders editable OCR table', async () => {
    const tableBlock = await getMockTableBlock();

    render(
      <OcrTableReviewPanel tableBlock={tableBlock} />,
    );

    expect(screen.getByTestId('ocr-table-review-panel')).toBeTruthy();
    expect(screen.getAllByTestId('ocr-table-column-label')).toHaveLength(2);
    expect(screen.getAllByTestId('ocr-table-cell-input')).toHaveLength(4);
    expect(screen.getByDisplayValue('Pipe')).toBeTruthy();
    expect(screen.getByDisplayValue('Valve')).toBeTruthy();
  });

  it('edits table cell and accepts WriterTableData', async () => {
    const tableBlock = await getMockTableBlock();
    let accepted: WriterTableData | null = null;

    render(
      <OcrTableReviewPanel
        tableBlock={tableBlock}
        onAcceptTable={(tableData) => {
          accepted = tableData;
        }}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Valve'), {
      target: {
        value: 'Gate Valve',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-table-accept'));

    await waitFor(() => {
      expect(accepted).not.toBeNull();
    });

    const finalAccepted = accepted as unknown as WriterTableData;
    expect(finalAccepted.columns).toHaveLength(2);
    expect(finalAccepted.rows).toHaveLength(2);
    expect(finalAccepted.rows[1].cells[0].text).toBe('Gate Valve');
  });

  it('renames column before accepting', async () => {
    const tableBlock = await getMockTableBlock();
    let accepted: WriterTableData | null = null;

    render(
      <OcrTableReviewPanel
        tableBlock={tableBlock}
        onAcceptTable={(tableData) => {
          accepted = tableData;
        }}
      />,
    );

    const columnInputs = screen.getAllByTestId('ocr-table-column-label');

    fireEvent.change(columnInputs[1], {
      target: {
        value: 'Qty',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-table-accept'));

    const finalAccepted = accepted as unknown as WriterTableData;
    expect(finalAccepted.columns[1].label).toBe('Qty');
  });

  it('toggles header row flag', async () => {
    const tableBlock = await getMockTableBlock();
    let accepted: WriterTableData | null = null;

    render(
      <OcrTableReviewPanel
        tableBlock={tableBlock}
        onAcceptTable={(tableData) => {
          accepted = tableData;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-table-has-header'));
    fireEvent.click(screen.getByTestId('ocr-table-accept'));

    const finalAccepted = accepted as unknown as WriterTableData;
    expect(finalAccepted.hasHeaderRow).toBe(false);
    expect(finalAccepted.headerCellStyle).toBeUndefined();
  });

  it('highlights low-confidence cells', async () => {
    const tableBlock = await getMockTableBlock();
    tableBlock.rows[2].cells[0].confidence = 0.5;

    render(
      <OcrTableReviewPanel tableBlock={tableBlock} />,
    );

    expect(screen.getByTestId('ocr-table-low-confidence-count').textContent).toBe('1 low');

    const lowCells = screen
      .getAllByTestId('ocr-table-cell')
      .filter((cell) => cell.getAttribute('data-low-confidence') === 'true');

    expect(lowCells).toHaveLength(1);
  });
});

async function getMockTableBlock(): Promise<OcrTableBlock> {
  const document = await mockOcrEngine.recognize({
    documentFingerprint: 'doc-table-review-panel',
    profile: getOcrProfile('table-heavy'),
    pages: [
      {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
    ],
  });

  const tableBlock = document.pages[0].blocks.find((block) => block.type === 'table');

  if (!tableBlock || tableBlock.type !== 'table') {
    throw new Error('Expected mock OCR table block.');
  }

  return tableBlock as OcrTableBlock;
}
