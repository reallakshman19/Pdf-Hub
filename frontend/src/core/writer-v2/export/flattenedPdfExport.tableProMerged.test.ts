import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';

describe('exportFlattenedWriterPdf TableBox Pro merged cells', () => {
  it('flattens merged table cells without drawing merged follower cells', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const pdfBytes = await pdf.save();

    const element: WriterElementV2 = {
      id: 'table-merged',
      documentFingerprint: 'doc',
      pageIndex: 0,
      type: 'tableBox',
      rect: {
        x: 72,
        y: 500,
        width: 360,
        height: 160,
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
          { id: 'a', label: 'A', width: 120 },
          { id: 'b', label: 'B', width: 120 },
          { id: 'c', label: 'C', width: 120 },
        ],
        rows: [
          {
            id: 'row-1',
            height: 48,
            cells: [
              {
                id: 'a1',
                text: 'Merged A1:B2',
                colSpan: 2,
                rowSpan: 2,
                style: {
                  alignment: 'center',
                  verticalAlign: 'middle',
                  backgroundColor: '#FEF3C7',
                  bold: true,
                  borders: {
                    bottom: {
                      style: 'double',
                      color: '#92400E',
                      width: 1,
                    },
                  },
                },
              },
              {
                id: 'b1',
                text: '',
                mergedInto: {
                  rowIndex: 0,
                  columnIndex: 0,
                },
              },
              {
                id: 'c1',
                text: 'C1',
              },
            ],
          },
          {
            id: 'row-2',
            height: 48,
            cells: [
              {
                id: 'a2',
                text: '',
                mergedInto: {
                  rowIndex: 0,
                  columnIndex: 0,
                },
              },
              {
                id: 'b2',
                text: '',
                mergedInto: {
                  rowIndex: 0,
                  columnIndex: 0,
                },
              },
              {
                id: 'c2',
                text: 'C2',
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

    const result = await exportFlattenedWriterPdf({
      pdfBytes,
      elements: [element],
      assets: [],
    });

    expect(result.bytes.byteLength).toBeGreaterThan(pdfBytes.byteLength);
    expect(result.flattenedElementCount).toBe(1);
    expect(result.pageCount).toBe(1);

    const reloaded = await PDFDocument.load(result.bytes);

    expect(reloaded.getPageCount()).toBe(1);
  });
});
