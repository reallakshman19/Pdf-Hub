import { describe, expect, it } from 'vitest';
import type { SelectBoxCopyResult } from './types';
import { createWriterElementFromSelectBoxCopy } from './insertIntoWriterV2';

function baseResult(patch: Partial<SelectBoxCopyResult> = {}): SelectBoxCopyResult {
  return {
    pageNumber: 1,
    pageIndex: 0,
    viewportRect: {
      x: 10,
      y: 10,
      width: 200,
      height: 100,
    },
    pdfRect: {
      x: 10,
      y: 500,
      width: 200,
      height: 100,
    },
    items: [],
    rows: [],
    plainText: 'Copied text',
    html: '<p>Copied text</p>',
    table: null,
    ...patch,
  };
}

describe('insert Select Box Copy into Writer V2', () => {
  it('creates rich text writer element for normal text selection', () => {
    const element = createWriterElementFromSelectBoxCopy({
      result: baseResult(),
      documentFingerprint: 'doc-1',
      zIndex: 10,
    });

    expect(element.type).toBe('richTextBox');
    expect(element.plainText).toBe('Copied text');
    expect(element.style.zIndex).toBe(10);
  });

  it('creates tableBox for high-confidence table selection', () => {
    const element = createWriterElementFromSelectBoxCopy({
      result: baseResult({
        table: {
          confidence: 0.9,
          html: '<table><tr><td>A</td></tr></table>',
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
      }),
      documentFingerprint: 'doc-1',
    });

    expect(element.type).toBe('tableBox');
    expect(element.tableData?.columns).toHaveLength(2);
    expect(element.plainText).toBe('A\tB');
  });

  it('creates imageBox for forced image insertion', () => {
    const element = createWriterElementFromSelectBoxCopy({
      result: baseResult(),
      documentFingerprint: 'doc-1',
      mode: 'image',
      imageAssetId: 'asset-1',
    });

    expect(element.type).toBe('imageBox');
    expect(element.imageAssetId).toBe('asset-1');
    expect(element.assetIds).toEqual(['asset-1']);
  });
});