import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  WriterElementV2,
  WriterTableData,
} from '../../types';
import { writerElementsToPortableBlocks } from '../docx/writerElementsToPortableBlocks';
import { exportFlattenedWriterPdf } from '../flattenedPdfExport';
import { exportWriterDocx } from '../writerDocxExporter';
import {
  exportPdfHubWriterProject,
  importPdfHubWriterProject,
} from '../projectZip';

describe('Writer table export paths', () => {
  it('converts tableBox to portable table block with header and body rows', () => {
    const result = writerElementsToPortableBlocks([
      makeTableElement(),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.exportedElementCount).toBe(1);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: 'table',
      elementId: 'table-element-1',
      pageIndex: 0,
    });

    if (result.blocks[0].type !== 'table') {
      throw new Error('Expected table block');
    }

    expect(result.blocks[0].rows).toHaveLength(3);
    expect(result.blocks[0].rows[0].cells[0].children[0]).toMatchObject({
      type: 'paragraph',
      children: [expect.objectContaining({ text: 'Item' })],
    });
    expect(result.blocks[0].rows[1].cells[1].children[0]).toMatchObject({
      type: 'paragraph',
      children: [expect.objectContaining({ text: '10' })],
    });
  });

  it('emits invalid table fallback for tableBox without tableData', () => {
    const invalid = {
      ...makeTableElement(),
      tableData: undefined,
    };
    const result = writerElementsToPortableBlocks([invalid]);

    expect(result.fatal).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warning',
          code: 'INVALID_TABLE_DATA',
        }),
      ]),
    );
    expect(result.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [
        expect.objectContaining({
          text: '[Invalid table]',
        }),
      ],
    });
  });

  it('flattens tableBox into PDF without dropping table element', async () => {
    const source = await createSinglePagePdfBytes();
    const result = await exportFlattenedWriterPdf({
      pdfBytes: source,
      elements: [makeTableElement()],
      assets: [],
    });
    const pdf = await PDFDocument.load(result.bytes);

    expect(result.pageCount).toBe(1);
    expect(result.flattenedElementCount).toBe(1);
    expect(result.embeddedAssetCount).toBe(0);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports tableBox into DOCX table XML', async () => {
    const result = await exportWriterDocx({
      elements: [makeTableElement()],
      assets: [],
      title: 'Table export DOCX',
    });

    const zip = await JSZip.loadAsync(result.bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(result.fatal).toBe(false);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.level === 'error')).toHaveLength(0);
    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('Item');
    expect(documentXml).toContain('Qty');
    expect(documentXml).toContain('Bolt');
    expect(documentXml).toContain('10');
    expect(documentXml).not.toContain('[Invalid table]');
  });

  it('preserves tableData through project ZIP roundtrip', async () => {
    const exported = await exportPdfHubWriterProject({
      originalPdfBytes: await createSinglePagePdfBytes(),
      documentFingerprint: 'table-project-doc',
      elements: [makeTableElement()],
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const imported = await importPdfHubWriterProject(exported.bytes);

    expect(imported.elements).toHaveLength(1);
    expect(imported.elements[0].type).toBe('tableBox');
    expect(imported.elements[0].tableData?.columns).toHaveLength(2);
    expect(imported.elements[0].tableData?.rows).toHaveLength(2);
    expect(imported.elements[0].tableData?.rows[0].cells[0].text).toBe('Bolt');
    expect(imported.elements[0].tableData?.rows[0].cells[1].text).toBe('10');
  });
});

async function createSinglePagePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return await doc.save();
}

function makeTableElement(): WriterElementV2 {
  return {
    id: 'table-element-1',
    documentFingerprint: 'table-export-doc',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 72,
      y: 560,
      width: 260,
      height: 120,
    },
    plainText: 'Table',
    tableData: makeTableData(),
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 4,
      opacity: 1,
      fontSize: 9,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function makeTableData(): WriterTableData {
  return {
    columns: [
      {
        id: 'item',
        label: 'Item',
        width: 160,
      },
      {
        id: 'qty',
        label: 'Qty',
        width: 80,
        style: {
          alignment: 'right',
        },
      },
    ],
    rows: [
      {
        id: 'row-1',
        cells: [
          {
            id: 'row-1-item',
            text: 'Bolt',
          },
          {
            id: 'row-1-qty',
            text: '10',
            style: {
              alignment: 'right',
            },
          },
        ],
      },
      {
        id: 'row-2',
        cells: [
          {
            id: 'row-2-item',
            text: 'Nut',
          },
          {
            id: 'row-2-qty',
            text: '25',
            style: {
              alignment: 'right',
            },
          },
        ],
      },
    ],
    hasHeaderRow: true,
    defaultCellStyle: {
      padding: 4,
      fontSize: 9,
      textColor: '#111827',
      borders: {
        top: { style: 'single', color: '#CBD5E1', width: 0.5 },
        right: { style: 'single', color: '#CBD5E1', width: 0.5 },
        bottom: { style: 'single', color: '#CBD5E1', width: 0.5 },
        left: { style: 'single', color: '#CBD5E1', width: 0.5 },
      },
    },
    headerCellStyle: {
      bold: true,
      backgroundColor: '#F1F5F9',
    },
  };
}
