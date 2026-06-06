import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  createOcrTableReviewModel,
  getLowConfidenceOcrTableCells,
  ocrTableReviewModelToPlainText,
  ocrTableReviewModelToWriterTableData,
  renameOcrTableReviewColumn,
  setOcrTableReviewHeaderMode,
  updateOcrTableReviewCellText,
} from '../ocrTableReviewModel';
import type { OcrTableBlock } from '../types';

describe('ocrTableReviewModel', () => {
  it('creates table review model from OCR table block', async () => {
    const tableBlock = await getMockTableBlock();

    const model = createOcrTableReviewModel(tableBlock);

    expect(model.sourceBlockId).toBe(tableBlock.id);
    expect(model.hasHeaderRow).toBe(true);
    expect(model.columns).toHaveLength(2);
    expect(model.columns[0].label).toBe('Item');
    expect(model.columns[1].label).toBe('Quantity');
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0].cells[0].text).toBe('Pipe');
  });

  it('updates cell text and marks cell edited', async () => {
    const tableBlock = await getMockTableBlock();
    const model = createOcrTableReviewModel(tableBlock);

    const updated = updateOcrTableReviewCellText(model, {
      rowIndex: 0,
      columnIndex: 0,
      text: 'Pipe spool',
    });

    expect(updated.rows[0].cells[0].text).toBe('Pipe spool');
    expect(updated.rows[0].cells[0].edited).toBe(true);

    const reverted = updateOcrTableReviewCellText(updated, {
      rowIndex: 0,
      columnIndex: 0,
      text: 'Pipe',
    });

    expect(reverted.rows[0].cells[0].edited).toBe(false);
  });

  it('renames columns and toggles header mode', async () => {
    const tableBlock = await getMockTableBlock();
    const model = createOcrTableReviewModel(tableBlock);

    const renamed = renameOcrTableReviewColumn(model, {
      columnIndex: 1,
      label: 'Qty',
    });

    expect(renamed.columns[1].label).toBe('Qty');

    const withoutHeader = setOcrTableReviewHeaderMode(renamed, false);

    expect(withoutHeader.hasHeaderRow).toBe(false);
  });

  it('converts review model to WriterTableData', async () => {
    const tableBlock = await getMockTableBlock();
    const model = createOcrTableReviewModel(tableBlock);

    const updated = updateOcrTableReviewCellText(model, {
      rowIndex: 1,
      columnIndex: 0,
      text: 'Gate Valve',
    });

    const tableData = ocrTableReviewModelToWriterTableData(updated);

    expect(tableData.hasHeaderRow).toBe(true);
    expect(tableData.columns).toHaveLength(2);
    expect(tableData.columns[0].label).toBe('Item');
    expect(tableData.rows).toHaveLength(2);
    expect(tableData.rows[1].cells[0].text).toBe('Gate Valve');
    expect(tableData.headerCellStyle?.bold).toBe(true);
  });

  it('creates plain text representation', async () => {
    const tableBlock = await getMockTableBlock();
    const model = createOcrTableReviewModel(tableBlock);

    const text = ocrTableReviewModelToPlainText(model);

    expect(text).toContain('Item\tQuantity');
    expect(text).toContain('Pipe\t2');
    expect(text).toContain('Valve\t1');
  });

  it('returns low-confidence table cells', async () => {
    const tableBlock = await getMockTableBlock();
    tableBlock.rows[2].cells[0].confidence = 0.5;

    const model = createOcrTableReviewModel(tableBlock);
    const lowConfidence = getLowConfidenceOcrTableCells(model, 0.7);

    expect(lowConfidence).toHaveLength(1);
    expect(lowConfidence[0].text).toBe('Valve');
  });
});

async function getMockTableBlock(): Promise<OcrTableBlock> {
  const document = await mockOcrEngine.recognize({
    documentFingerprint: 'doc-table-review',
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
