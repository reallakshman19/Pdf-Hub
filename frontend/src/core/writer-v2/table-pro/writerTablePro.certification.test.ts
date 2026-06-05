import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { exportFlattenedWriterPdf } from '../export/flattenedPdfExport';
import { exportWriterDocx } from '../export/writerDocxExporter';
import { writerElementsToPortableBlocks } from '../export/docx/writerElementsToPortableBlocks';
import { buildWriterTableVisualModel } from './writerTableVisualStyles';
import {
  mergeWriterTableCells,
  normalizeWriterTableData,
} from './writerTableStructureActions';
import { createRectangularTableSelection } from './writerTableSelection';

describe('TableBox Pro certification', () => {
  it('certifies table model, visual model, DOCX export, and flattened PDF export', async () => {
    const baseElement = makeCertificationTableElement();

    const normalized = normalizeWriterTableData(baseElement.tableData);

    expect(normalized).not.toBeNull();
    expect(normalized?.columns).toHaveLength(3);
    expect(normalized?.rows).toHaveLength(2);
    expect(normalized?.rows[0].cells).toHaveLength(3);

    const mergeResult = mergeWriterTableCells(
      [baseElement],
      createRectangularTableSelection({
        elementId: baseElement.id,
        startRowIndex: 0,
        startColumnIndex: 0,
        endRowIndex: 1,
        endColumnIndex: 1,
      }),
    );

    expect(mergeResult.changed).toBe(true);

    const mergedElement = mergeResult.elements[0];

    expect(mergedElement.tableData?.rows[0].cells[0].colSpan).toBe(2);
    expect(mergedElement.tableData?.rows[0].cells[0].rowSpan).toBe(2);
    expect(mergedElement.tableData?.rows[0].cells[1].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(mergedElement.tableData?.rows[1].cells[0].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(mergedElement.tableData?.rows[1].cells[1].mergedInto).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });

    const visualModel = buildWriterTableVisualModel({
      element: mergedElement,
      width: 360,
      height: 180,
    });

    expect(visualModel).not.toBeNull();
    expect(visualModel?.headerCells).toHaveLength(3);

    const mergedVisualCell = visualModel?.bodyCells.find(
      (cell) => cell.rowIndex === 0 && cell.columnIndex === 0,
    );

    expect(mergedVisualCell).toBeTruthy();
    expect(mergedVisualCell?.colSpan).toBe(2);
    expect(mergedVisualCell?.rowSpan).toBe(2);
    expect(mergedVisualCell?.width).toBeGreaterThan(200);
    expect(mergedVisualCell?.height).toBeGreaterThan(80);

    expect(
      visualModel?.bodyCells.some(
        (cell) => cell.rowIndex === 0 && cell.columnIndex === 1,
      ),
    ).toBe(false);

    expect(
      visualModel?.bodyCells.some(
        (cell) => cell.rowIndex === 1 && cell.columnIndex === 0,
      ),
    ).toBe(false);

    const portableResult = writerElementsToPortableBlocks([mergedElement]);

    expect(portableResult.fatal).toBe(false);
    expect(portableResult.blocks.some((block) => block.type === 'table')).toBe(true);

    const docxResult = await exportWriterDocx({
      elements: [mergedElement],
      assets: [],
      title: 'TableBox Pro Certification',
    });

    expect(docxResult.fatal).toBe(false);
    expect(docxResult.bytes.byteLength).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(docxResult.bytes);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const stylesXml = await zip.file('word/styles.xml')!.async('string');
    const contentTypesXml = await zip.file('[Content_Types].xml')!.async('string');

    expect(documentXml).toContain('Merged A1:B2');
    expect(documentXml).toContain('Standalone C1');
    expect(documentXml).toContain('Standalone C2');
    expect(documentXml).toMatch(/<w:tbl[\s>]/);
    expect(documentXml).toMatch(/<w:tc[\s>]/);
    expect(documentXml).toMatch(/<w:shd[^>]+w:fill="FEF3C7"/);
    expect(documentXml).toMatch(/<w:tcBorders[\s>]/);
    expect(documentXml).toMatch(/<w:gridSpan[^>]+w:val="2"/);
    expect(documentXml).not.toContain('[object Object]');
    expect(documentXml).not.toContain('undefined');
    expect(documentXml).toContain('Merged follower');

    expect(stylesXml).toContain('Heading1');
    expect(contentTypesXml).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );

    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([595, 842]);
    const sourcePdfBytes = await sourcePdf.save();

    const flattened = await exportFlattenedWriterPdf({
      pdfBytes: sourcePdfBytes,
      elements: [mergedElement],
      assets: [],
    });

    expect(flattened.flattenedElementCount).toBe(1);
    expect(flattened.pageCount).toBe(1);
    expect(flattened.bytes.byteLength).toBeGreaterThan(sourcePdfBytes.byteLength);

    const reloadedPdf = await PDFDocument.load(flattened.bytes);

    expect(reloadedPdf.getPageCount()).toBe(1);

    assertNoCorruption(documentXml);
    assertNoCorruption(stylesXml);
    assertNoCorruption(contentTypesXml);
  });
});

function assertNoCorruption(value: string): void {
  expect(value).not.toContain('[object Object]');
  expect(value).not.toContain('undefined');

  const mojibakePattern = new RegExp(
    [
      '\\uFFFD',
      '\\u00c3\\u002e',
      '\\u00c2\\u002e',
      '\\u00e2\\u20ac\\u2122',
      '\\u00e2\\u20ac\\u0153',
      '\\u00e2\\u20ac',
      '\\u00e2\\u20ac\\u201c',
      '\\u00e2\\u20ac\\u201d',
      '\\u00e2\\u20ac\\u00a6',
    ].join('|'),
  );

  expect(value).not.toMatch(mojibakePattern);
}

function makeCertificationTableElement(): WriterElementV2 {
  return {
    id: 'table-pro-certification',
    documentFingerprint: 'table-pro-certification-doc',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 72,
      y: 500,
      width: 360,
      height: 180,
    },
    tableData: {
      hasHeaderRow: true,
      defaultCellStyle: {
        fontFamily: 'Helvetica',
        fontSize: 10,
        textColor: '#111827',
        padding: 6,
        alignment: 'left',
        verticalAlign: 'top',
        borders: {
          top: { style: 'single', color: '#CBD5E1', width: 0.5 },
          right: { style: 'single', color: '#CBD5E1', width: 0.5 },
          bottom: { style: 'single', color: '#CBD5E1', width: 0.5 },
          left: { style: 'single', color: '#CBD5E1', width: 0.5 },
        },
      },
      headerCellStyle: {
        bold: true,
        alignment: 'center',
        verticalAlign: 'middle',
        backgroundColor: '#E2E8F0',
      },
      columns: [
        {
          id: 'col-a',
          label: 'A',
          width: 120,
        },
        {
          id: 'col-b',
          label: 'B',
          width: 120,
        },
        {
          id: 'col-c',
          label: 'C',
          width: 120,
        },
      ],
      rows: [
        {
          id: 'row-1',
          height: 54,
          cells: [
            {
              id: 'a1',
              text: 'Merged A1:B2',
              style: {
                alignment: 'center',
                verticalAlign: 'middle',
                backgroundColor: '#FEF3C7',
                bold: true,
                borders: {
                  top: { style: 'double', color: '#92400E', width: 1 },
                  right: { style: 'double', color: '#92400E', width: 1 },
                  bottom: { style: 'double', color: '#92400E', width: 1 },
                  left: { style: 'double', color: '#92400E', width: 1 },
                },
              },
            },
            {
              id: 'b1',
              text: 'Merged follower B1',
            },
            {
              id: 'c1',
              text: 'Standalone C1',
              style: {
                alignment: 'right',
                verticalAlign: 'middle',
              },
            },
          ],
        },
        {
          id: 'row-2',
          height: 54,
          cells: [
            {
              id: 'a2',
              text: 'Merged follower A2',
            },
            {
              id: 'b2',
              text: 'Merged follower B2',
            },
            {
              id: 'c2',
              text: 'Standalone C2',
              style: {
                backgroundColor: '#DBEAFE',
              },
            },
          ],
        },
      ],
    },
    style: {
      zIndex: 0,
      fontFamily: 'Helvetica',
      fontSize: 10,
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 4,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
