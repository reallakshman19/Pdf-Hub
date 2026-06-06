import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  createOcrRegion,
  createOcrRegionResult,
} from '../ocrRegionModel';
import {
  ocrRegionResultToWriterElement,
  ocrTableBlockToWriterTableData,
} from '../ocrRegionToWriter';
import type { OcrTableBlock } from '../types';

describe('ocrRegionToWriter', () => {
  it('converts OCR text region to richTextBox', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-writer-text',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const region = createOcrRegion({
      id: 'region-text',
      documentFingerprint: 'doc-writer-text',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const regionResult = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
    });

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode: 'richTextBox',
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(converted.element).not.toBeNull();
    expect(converted.element?.type).toBe('richTextBox');
    expect(converted.element?.plainText).toContain('Writer OCR Demo');
    expect(converted.element?.rect).toEqual(region.bbox);
    expect(converted.diagnostics[0].code).toBe('OCR_REGION_CONVERTED');
  });

  it('converts OCR text region to richNote', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-note',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const region = createOcrRegion({
      id: 'region-note',
      documentFingerprint: 'doc-note',
      pageIndex: 0,
      mode: 'note',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
    });

    const regionResult = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
    });

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode: 'richNote',
    });

    expect(converted.element?.type).toBe('richNote');
    expect(converted.element?.plainText).toContain('Writer OCR Demo');
  });

  it('converts OCR text region to reviewLabel', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-review',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const region = createOcrRegion({
      id: 'region-review',
      documentFingerprint: 'doc-review',
      pageIndex: 0,
      mode: 'review',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
    });

    const regionResult = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
    });

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode: 'reviewLabel',
    });

    expect(converted.element?.type).toBe('reviewLabel');
    expect(converted.element?.review?.category).toBe('ocr');
    expect(converted.element?.review?.status).toBe('open');
  });

  it('converts OCR table block to WriterTableData', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-table-data',
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

    const tableData = ocrTableBlockToWriterTableData(tableBlock as OcrTableBlock);

    expect(tableData.columns).toHaveLength(2);
    expect(tableData.columns[0].label).toBe('Item');
    expect(tableData.columns[1].label).toBe('Quantity');
    expect(tableData.rows).toHaveLength(2);
    expect(tableData.rows[0].cells[0].text).toBe('Pipe');
    expect(tableData.rows[1].cells[0].text).toBe('Valve');
    expect(tableData.headerCellStyle?.bold).toBe(true);
  });

  it('converts OCR table region to tableBox', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-table-region',
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

    const region = createOcrRegion({
      id: 'region-table',
      documentFingerprint: 'doc-table-region',
      pageIndex: 0,
      mode: 'table',
      bbox: {
        x: 60,
        y: 460,
        width: 420,
        height: 200,
      },
    });

    const regionResult = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
    });

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode: 'tableBox',
      useFirstRowAsHeader: true,
    });

    expect(converted.element).not.toBeNull();
    expect(converted.element?.type).toBe('tableBox');
    expect(converted.element?.tableData?.columns).toHaveLength(2);
    expect(converted.element?.tableData?.rows[0].cells[0].text).toBe('Pipe');
    expect(converted.diagnostics[0].code).toBe('OCR_REGION_CONVERTED');
  });

  it('returns warning when tableBox conversion has no OCR table', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-no-table',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const region = createOcrRegion({
      id: 'region-no-table',
      documentFingerprint: 'doc-no-table',
      pageIndex: 0,
      mode: 'table',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
    });

    const regionResult = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
    });

    const converted = ocrRegionResultToWriterElement(regionResult, {
      outputMode: 'tableBox',
    });

    expect(converted.element).toBeNull();
    expect(converted.diagnostics[0].code).toBe('NO_OCR_TABLE');
  });
});
