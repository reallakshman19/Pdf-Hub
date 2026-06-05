import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';

describe('exportFlattenedWriterPdf TableBox Pro', () => {
  it('flattens tableBox with professional table properties without crashing', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const pdfBytes = await pdf.save();

    const element: WriterElementV2 = {
      id: 'table-pro',
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
          {
            id: 'col-a',
            label: 'Value',
            width: 120,
          },
          {
            id: 'col-b',
            label: 'Description',
            width: 240,
          },
        ],
        rows: [
          {
            id: 'row-1',
            height: 48,
            cells: [
              {
                id: 'a1',
                text: '42',
                style: {
                  alignment: 'right',
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
                text: 'Styled cell with wrapped text',
                style: {
                  alignment: 'left',
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
